"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { RemoteAction } from "../reducer";

// The EPHEMERAL layer of a shared dashboard: who is connected (presence),
// where their pointer is on the open corkboard (cursor broadcasts) and which
// task they are dragging right now (drag broadcasts — the "flying task" the
// rest of the group watches). It exists only while the tabs are open.
//
// It ALSO carries the broadcast-first fast path for DURABLE edits (the "edit"
// event): when a teammate changes a task/block/member the change is broadcast
// here for ~80ms peer application on top of being persisted through the
// server action. postgres_changes (realtime.ts) stays the source of truth and
// reconciles ~0.5s later; this channel just removes the wait. The reducer's
// equality bail absorbs the duplicate when the durable event lands.
//
// Hot data (cursors/drags, ~12 msg/s while moving) lives OUTSIDE React state:
// a version-ticked external store that only the components drawing it
// subscribe to — the rest of the tree never re-renders for a pointer move.

export interface LiveCursor {
  tabId: string;
  memberId: string;
  /** Corkboard the pointer is on — only rendered by viewers of that block. */
  blockId: string;
  /** Fractions of the corkboard container (0–1). */
  fx: number;
  fy: number;
  ts: number;
}

export interface LiveDrag {
  tabId: string;
  memberId: string;
  taskId: string;
  blockId: string;
  /** Fractions of the USABLE board (same space as tasks.map_x / map_y). */
  fx: number;
  fy: number;
  active: boolean;
  ts: number;
}

export interface LiveRoom {
  tabId: string;
  memberId: string;
  /** Members with at least one connected tab (self included). */
  onlineMemberIds: ReadonlySet<string>;
  connected: boolean;
  sendCursor: (
    cursor: { blockId: string; fx: number; fy: number } | null,
  ) => void;
  sendDrag: (drag: {
    taskId: string;
    blockId: string;
    fx: number;
    fy: number;
    active: boolean;
  }) => void;
  /**
   * Ephemeral game channel (the map's air-hockey easter egg). Small,
   * fire-and-forget payloads on a dedicated "game" event — kept OUT of the hot
   * store so the ball loop never re-renders cursors/drags. Throttled ~40ms.
   */
  sendGame: (payload: Record<string, unknown>) => void;
  /** Raw callback on every incoming "game" broadcast. Returns an unsubscribe. */
  subscribeGame: (onMessage: (payload: Record<string, unknown>) => void) => () => void;
  /**
   * Broadcast a durable edit to peers on the fast path (no throttle — every
   * edit must arrive, and in order). Fire-and-forget; the origin tab never
   * receives its own edit back (broadcast self:false).
   */
  sendEdit: (action: RemoteAction) => void;
  /** Raw callback on every incoming "edit" broadcast. Returns an unsubscribe. */
  subscribeEdit: (onEdit: (action: RemoteAction) => void) => () => void;
  subscribeHot: (onChange: () => void) => () => void;
  getHotVersion: () => number;
  /** Peer cursors by tabId. Read after a hot-version tick. */
  getCursors: () => ReadonlyMap<string, LiveCursor>;
  /** Peer drags by taskId. Read after a hot-version tick. */
  getDrags: () => ReadonlyMap<string, LiveDrag>;
}

const LiveRoomContext = createContext<LiveRoom | null>(null);

/** Null outside a cloud dashboard (local demo has no live layer). */
export function useLiveRoom(): LiveRoom | null {
  return useContext(LiveRoomContext);
}

const EMPTY_CURSORS: ReadonlyMap<string, LiveCursor> = new Map();
const EMPTY_DRAGS: ReadonlyMap<string, LiveDrag> = new Map();
const noopSubscribe = () => () => {};
const zeroVersion = () => 0;

/**
 * Subscribes THIS component to the hot layer (cursors + drags). Re-renders on
 * every broadcast — mount it only in components that draw live artifacts.
 */
export function useLiveHot(): {
  cursors: ReadonlyMap<string, LiveCursor>;
  drags: ReadonlyMap<string, LiveDrag>;
} {
  const room = useLiveRoom();
  useSyncExternalStore(
    room ? room.subscribeHot : noopSubscribe,
    room ? room.getHotVersion : zeroVersion,
    zeroVersion,
  );
  return {
    cursors: room ? room.getCursors() : EMPTY_CURSORS,
    drags: room ? room.getDrags() : EMPTY_DRAGS,
  };
}

/** Leading + trailing throttle; `flush` sends whatever is pending NOW. */
function makeThrottled<T>(ms: number, send: (value: T) => void) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;
  const fire = () => {
    if (pending === null) return;
    const value = pending;
    pending = null;
    last = Date.now();
    send(value);
  };
  const push = (value: T) => {
    pending = value;
    const wait = last + ms - Date.now();
    if (wait <= 0) {
      fire();
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        fire();
      }, wait);
    }
  };
  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    fire();
  };
  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = null;
  };
  return { push, flush, cancel };
}

/** ~12 msg/s per stream — smooth with the CSS interpolation on the far side. */
const SEND_INTERVAL_MS = 80;
/** ~25 msg/s for the game ball — snappier than cursors, still cheap. */
const GAME_INTERVAL_MS = 40;
/** A cursor not refreshed in this window is gone (tab crashed / sleeping). */
const CURSOR_TTL_MS = 5000;
/** How long a finished drag ghost may linger before pruning. */
const DRAG_LINGER_MS = 2500;

export function LiveRoomProvider({
  groupId,
  memberId,
  tabId,
  children,
}: {
  groupId: string;
  memberId: string;
  tabId: string;
  children: ReactNode;
}) {
  const [connected, setConnected] = useState(false);
  const [onlineMemberIds, setOnlineMemberIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // Hot store: mutated in place, announced by bumping `version`.
  const hot = useRef({
    version: 0,
    cursors: new Map<string, LiveCursor>(),
    drags: new Map<string, LiveDrag>(),
    listeners: new Set<() => void>(),
  });
  // Game channel listeners live outside the hot store — the air-hockey loop
  // drives its own refs/rAF and must not tick the hot version.
  const gameListeners = useRef(new Set<(payload: Record<string, unknown>) => void>());
  // Durable-edit listeners also live outside the hot store: an incoming edit
  // goes to the reducer (a state dispatch), never the cursor/drag render path.
  const editListeners = useRef(new Set<(action: RemoteAction) => void>());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const senders = useRef<{
    cursor: ReturnType<typeof makeThrottled<Record<string, unknown>>> | null;
    drag: ReturnType<typeof makeThrottled<Record<string, unknown>>> | null;
    game: ReturnType<typeof makeThrottled<Record<string, unknown>>> | null;
  }>({ cursor: null, drag: null, game: null });

  useEffect(() => {
    const store = hot.current;
    const notify = () => {
      store.version++;
      for (const listener of store.listeners) listener();
    };

    const supabase = createClient();
    const channel = supabase.channel(`live:${groupId}`, {
      // self:false — our own tab never needs its own cursor back.
      config: { broadcast: { self: false }, presence: { key: tabId } },
    });
    channelRef.current = channel;

    const rawSend = (
      event: "cursor" | "drag" | "game",
      payload: Record<string, unknown>,
    ) => {
      // Fire-and-forget: a dropped frame is invisible, the next one corrects.
      void channel.send({ type: "broadcast", event, payload });
    };
    // Local handles for the cleanup below (the ref may be repointed by then).
    const cursorSender = makeThrottled<Record<string, unknown>>(
      SEND_INTERVAL_MS,
      (payload) => rawSend("cursor", payload),
    );
    const dragSender = makeThrottled<Record<string, unknown>>(
      SEND_INTERVAL_MS,
      (payload) => rawSend("drag", payload),
    );
    const gameSender = makeThrottled<Record<string, unknown>>(
      GAME_INTERVAL_MS,
      (payload) => rawSend("game", payload),
    );
    senders.current = { cursor: cursorSender, drag: dragSender, game: gameSender };

    channel.on("broadcast", { event: "cursor" }, ({ payload }) => {
      const p = payload as Partial<LiveCursor> & { gone?: boolean };
      if (typeof p?.tabId !== "string") return;
      if (p.gone) {
        if (!store.cursors.delete(p.tabId)) return;
      } else {
        if (
          typeof p.memberId !== "string" ||
          typeof p.blockId !== "string" ||
          typeof p.fx !== "number" ||
          typeof p.fy !== "number"
        ) {
          return;
        }
        store.cursors.set(p.tabId, {
          tabId: p.tabId,
          memberId: p.memberId,
          blockId: p.blockId,
          fx: p.fx,
          fy: p.fy,
          ts: Date.now(),
        });
      }
      notify();
    });

    channel.on("broadcast", { event: "drag" }, ({ payload }) => {
      const p = payload as Partial<LiveDrag>;
      if (
        typeof p?.tabId !== "string" ||
        typeof p.memberId !== "string" ||
        typeof p.taskId !== "string" ||
        typeof p.blockId !== "string" ||
        typeof p.fx !== "number" ||
        typeof p.fy !== "number"
      ) {
        return;
      }
      store.drags.set(p.taskId, {
        tabId: p.tabId,
        memberId: p.memberId,
        taskId: p.taskId,
        blockId: p.blockId,
        fx: p.fx,
        fy: p.fy,
        active: p.active === true,
        ts: Date.now(),
      });
      notify();
    });

    channel.on("broadcast", { event: "game" }, ({ payload }) => {
      const p = payload as Record<string, unknown> | undefined;
      if (!p || typeof p !== "object") return;
      for (const listener of gameListeners.current) listener(p);
    });

    channel.on("broadcast", { event: "edit" }, ({ payload }) => {
      // Only well-formed remote actions are forwarded; the reducer and its
      // per-action guards do the rest. self:false means this never fires for
      // our own edits.
      const p = payload as Partial<RemoteAction> | undefined;
      if (!p || typeof p.type !== "string" || !p.type.startsWith("APPLY_REMOTE_")) {
        return;
      }
      for (const listener of editListeners.current) listener(p as RemoteAction);
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{ memberId: string }>();
      const members = new Set<string>();
      const tabs = new Set<string>();
      for (const [key, metas] of Object.entries(state)) {
        tabs.add(key);
        for (const meta of metas) {
          if (typeof meta.memberId === "string") members.add(meta.memberId);
        }
      }
      setOnlineMemberIds(members);
      // A tab that left takes its cursor and any drag it was doing with it.
      let dirty = false;
      for (const key of store.cursors.keys()) {
        if (!tabs.has(key)) {
          store.cursors.delete(key);
          dirty = true;
        }
      }
      for (const [taskId, drag] of store.drags) {
        if (!tabs.has(drag.tabId)) {
          store.drags.delete(taskId);
          dirty = true;
        }
      }
      if (dirty) notify();
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        void channel.track({ memberId });
      } else {
        setConnected(false);
      }
    });

    // Belt-and-braces prune: crashed tabs whose presence hasn't expired yet,
    // and finished drags nobody cleaned up.
    const pruner = setInterval(() => {
      const now = Date.now();
      let dirty = false;
      for (const [key, cursor] of store.cursors) {
        if (now - cursor.ts > CURSOR_TTL_MS) {
          store.cursors.delete(key);
          dirty = true;
        }
      }
      for (const [taskId, drag] of store.drags) {
        const ttl = drag.active ? CURSOR_TTL_MS : DRAG_LINGER_MS;
        if (now - drag.ts > ttl) {
          store.drags.delete(taskId);
          dirty = true;
        }
      }
      if (dirty) notify();
    }, 1000);

    return () => {
      clearInterval(pruner);
      cursorSender.cancel();
      dragSender.cancel();
      gameSender.cancel();
      senders.current = { cursor: null, drag: null, game: null };
      channelRef.current = null;
      setConnected(false);
      store.cursors.clear();
      store.drags.clear();
      notify();
      void supabase.removeChannel(channel);
    };
  }, [groupId, memberId, tabId]);

  const room: LiveRoom = {
    tabId,
    memberId,
    onlineMemberIds,
    connected,
    sendCursor: (cursor) => {
      if (cursor === null) {
        // Leaving the board beats any queued position.
        senders.current.cursor?.cancel();
        const channel = channelRef.current;
        if (channel) {
          void channel.send({
            type: "broadcast",
            event: "cursor",
            payload: { tabId, gone: true },
          });
        }
        return;
      }
      senders.current.cursor?.push({ tabId, memberId, ...cursor });
    },
    sendDrag: (drag) => {
      const sender = senders.current.drag;
      if (!sender) return;
      sender.push({ tabId, memberId, ...drag });
      // The last frame of a drag (active:false = where it landed) must not
      // wait out the throttle window.
      if (!drag.active) sender.flush();
    },
    sendGame: (payload) => {
      const sender = senders.current.game;
      if (!sender) return;
      sender.push({ tabId, memberId, ...payload });
      // Start/end frames are one-shot signals — never let them sit in the
      // throttle buffer waiting for a frame that won't come.
      if (payload.type === "start" || payload.type === "end") sender.flush();
    },
    subscribeGame: (onMessage) => {
      gameListeners.current.add(onMessage);
      return () => {
        gameListeners.current.delete(onMessage);
      };
    },
    sendEdit: (action) => {
      const channel = channelRef.current;
      if (!channel) return;
      // Unthrottled: durable edits are discrete (clicks, typing, one commit
      // per resize/reorder), so there is no frame storm to smooth — and every
      // one must land. A dropped edit is caught by postgres_changes anyway.
      void channel.send({ type: "broadcast", event: "edit", payload: action });
    },
    subscribeEdit: (onEdit) => {
      editListeners.current.add(onEdit);
      return () => {
        editListeners.current.delete(onEdit);
      };
    },
    subscribeHot: (onChange) => {
      hot.current.listeners.add(onChange);
      return () => {
        hot.current.listeners.delete(onChange);
      };
    },
    getHotVersion: () => hot.current.version,
    getCursors: () => hot.current.cursors,
    getDrags: () => hot.current.drags,
  };

  return (
    <LiveRoomContext.Provider value={room}>{children}</LiveRoomContext.Provider>
  );
}
