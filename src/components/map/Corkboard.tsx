"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useDndMonitor, useDraggable } from "@dnd-kit/core";
import { Check, Lock, LockOpen, X } from "lucide-react";
import type { BlockFlow, ModuleFlow, ProjectFlow } from "@/lib/data/flow";
import { wouldCreateCycle } from "@/lib/data/flow";
import { useProject } from "@/lib/data/ProjectProvider";
import {
  useLiveHot,
  useLiveRoom,
  type LiveCursor,
  type LiveDrag,
} from "@/lib/data/cloud/live";
import {
  IMPORTANCE_DEFAULT,
  importanceScale,
  type Project,
  type ProjectModule,
  type TeamMember,
} from "@/lib/data/types";
import { formatShort } from "@/lib/utils/dates";
import { DocTypeBadge } from "@/components/ui/DocTypeBadge";
import { InlineAddTask } from "@/components/ui/InlineAddTask";
import { colorForKey } from "@/lib/utils/colors";
import { cn } from "@/lib/utils/cn";
import { AirHockeyLayer } from "./AirHockey";

// The corkboard INSIDE one block: tasks are pinned wherever you drop them
// (Mac-desktop style, positions persist as board fractions), dependencies are
// measured SVG curves. Dragging a port onto another node creates a
// dependency — with magnetic snapping and live highlighting of valid
// targets; clicking an edge exposes its remove button. Everyone can edit
// everything here; cycles are the only hard rule.

const PAD = 10;
/** Width of the double-click draft input (a fixed box is right for typing). */
const NODE_BASE_WIDTH = 172;
/** Text-hugging card width bounds, before the importance scale. */
const NODE_MIN_WIDTH = 84;
const NODE_MAX_WIDTH = 200;
const EST_NODE_H = 60;
/** Cursor-to-node distance at which a connection snaps on. */
const SNAP_RADIUS = 56;

/* Dot field — the board texture is real SVG dots so they can MAKE ROOM for
   the traveling card: dots inside its footprint duck away, dots around it
   lean outward following the card's shape, and on drop they spring home in
   a small outward wave. */
const DOT_SPACING = 26;
/** How far past the card's edge a dot still feels the push. */
const DOT_FIELD = 80;
/** Displacement of a dot sitting right at the card's edge. */
const DOT_PUSH = 18;
/** The clearing extends this far past the card on every side. */
const DOT_MARGIN = 10;
/** Spring-back easing: one overshoot past home, then settle. */
const DOT_RETURN_EASING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Point {
  x: number;
  y: number;
}

interface Edge {
  sourceId: string;
  targetId: string;
  done: boolean;
}

interface PortDrag {
  sourceId: string;
  /** "out" = drag from the right port (this unlocks…); "in" = left port. */
  direction: "out" | "in";
  x: number;
  y: number;
  validIds: Set<string>;
  snapId: string | null;
}

export interface CorkboardProps {
  project: Project;
  flow: ProjectFlow;
  blockFlow: BlockFlow;
  /** When set, tasks not assigned to this member render as faint ghosts. */
  ghostMemberId: string | null;
  onToggleDependency: (targetId: string, depId: string) => void;
  /** Commits a free position as fractions (0–1) of the usable board. */
  onSetPosition: (id: string, fx: number, fy: number) => void;
  onOpen: (id: string) => void;
  onAddTask: (title: string) => void;
  /** Create a task pinned at board fractions (0–1) — double-click to place. */
  onAddTaskAt: (title: string, fx: number, fy: number) => void;
  /** Reports the measured board px so "Ordenar" can pack columns by size. */
  onBoardResize?: (size: { w: number; h: number }) => void;
  /** Fires when the air-hockey easter egg starts/ends (map hides the drag overlay). */
  onGameActiveChange?: (active: boolean) => void;
}

export function nodeWidth(module: ProjectModule): number {
  const title = module.title || "Sin título";
  // Hug the title: ~6.4px/char at the 12px base size plus the chrome around
  // it (padding, state glyph, optional type badge). Long titles cap at
  // NODE_MAX_WIDTH and wrap onto the second line (line-clamp-2).
  const chrome = 42 + (module.docType ? 30 : 0);
  const hug = Math.min(
    Math.max(chrome + title.length * 6.4, NODE_MIN_WIDTH),
    NODE_MAX_WIDTH,
  );
  return Math.round(hug * importanceScale(module.importance));
}

/** Shortest distance from a point to a rect's border (0 inside). */
function distanceToRect(x: number, y: number, rect: Rect): number {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.w));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.h));
  return Math.hypot(dx, dy);
}

/** Deterministic 0–1 from a string — stable corkboard jitter per task. */
function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/** Dependency depth using only edges between tasks of the same block. */
function layersOf(modules: ProjectModule[]): ProjectModule[][] {
  const inBlock = new Map(modules.map((m) => [m.id, m]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const depthOf = (mod: ProjectModule): number => {
    const known = depth.get(mod.id);
    if (known !== undefined) return known;
    if (visiting.has(mod.id)) return 0; // defensive: cycles never layer
    visiting.add(mod.id);
    let d = 0;
    for (const depId of mod.dependsOn) {
      const dep = inBlock.get(depId);
      if (dep) d = Math.max(d, depthOf(dep) + 1);
    }
    visiting.delete(mod.id);
    depth.set(mod.id, d);
    return d;
  };

  const layers: ProjectModule[][] = [];
  for (const mod of modules) {
    const d = depthOf(mod);
    (layers[d] ??= []).push(mod);
  }
  return layers.filter(Boolean);
}

/**
 * Reorders the nodes WITHIN each layer to cut edge crossings — the classic
 * barycenter heuristic: a node wants to sit at the average row of the
 * neighbours it connects to in the adjacent layer. A few alternating down/up
 * sweeps settle it. Pure reordering; it never moves a task between layers.
 */
function reduceCrossings(
  layers: ProjectModule[][],
  modules: ProjectModule[],
): void {
  if (layers.length < 2) return;
  const inBlock = new Set(modules.map((m) => m.id));
  const parents = new Map<string, string[]>(); // deps in an earlier layer
  const children = new Map<string, string[]>(); // tasks that depend on this one
  for (const m of modules) children.set(m.id, []);
  for (const m of modules) {
    const deps = m.dependsOn.filter((id) => inBlock.has(id));
    parents.set(m.id, deps);
    for (const d of deps) children.get(d)?.push(m.id);
  }

  const rowsOf = (layer: ProjectModule[]) => {
    const pos = new Map<string, number>();
    layer.forEach((m, i) => pos.set(m.id, i));
    return pos;
  };
  const barycenter = (
    neighbours: string[],
    rows: Map<string, number>,
    fallback: number,
  ): number => {
    let sum = 0;
    let n = 0;
    for (const id of neighbours) {
      const r = rows.get(id);
      if (r !== undefined) {
        sum += r;
        n += 1;
      }
    }
    return n === 0 ? fallback : sum / n;
  };
  // Sort layer `l` by each node's barycenter over `adj` in the reference layer.
  const sweep = (
    l: number,
    reference: ProjectModule[],
    adj: Map<string, string[]>,
  ) => {
    const rows = rowsOf(reference);
    const keyed = layers[l].map((m, i) => ({
      m,
      i,
      b: barycenter(adj.get(m.id) ?? [], rows, i),
    }));
    // Stable on ties (keep the existing order) so it converges, not oscillates.
    keyed.sort((a, b) => a.b - b.b || a.i - b.i);
    layers[l] = keyed.map((k) => k.m);
  };

  for (let pass = 0; pass < 4; pass += 1) {
    for (let l = 1; l < layers.length; l += 1) sweep(l, layers[l - 1], parents);
    for (let l = layers.length - 2; l >= 0; l -= 1) {
      sweep(l, layers[l + 1], children);
    }
  }
}

/**
 * Board fractions (0–1) that lay a block out left→right by dependency depth:
 * one column per layer. Within a column the nodes are ordered to MINIMISE edge
 * crossings (barycenter) and stacked with vertical space PROPORTIONAL to each
 * task's size, so bigger tasks claim more room and never crowd the small ones.
 *
 * When the board size is known the COLUMNS are packed by each layer's real card
 * widths too (a wide task reserves a wider column, so nothing overlaps its
 * neighbour); without it we fall back to even fractional columns. Used by the
 * "Ordenar" reset.
 */
export function autoLayoutFractions(
  modules: ProjectModule[],
  board?: { w: number; h: number } | null,
): Map<string, { fx: number; fy: number }> {
  const layers = layersOf(modules);
  reduceCrossings(layers, modules);
  const cols = Math.max(layers.length, 1);
  const out = new Map<string, { fx: number; fy: number }>();

  // fx for a node in layer `l`. place() maps a node's fx over (board.w − its
  // own width), so to land a card's LEFT edge at a target px we invert that.
  let columnFx: (mod: ProjectModule, l: number) => number;
  if (board && board.w > 0) {
    const widths = layers.map((layer) =>
      Math.max(...layer.map((m) => nodeWidth(m)), NODE_MIN_WIDTH),
    );
    const avail = board.w - PAD * 2;
    const sumW = widths.reduce((a, b) => a + b, 0);
    // One gap shared by every column: POSITIVE (real breathing room, scaled to
    // each layer's card width) when the cards fit, NEGATIVE (an even, staggered
    // overlap) when the block is too wide to fit — either way the last card
    // ends exactly at the right edge, so columns never pile up off-board.
    const gap = cols > 1 ? (avail - sumW) / (cols - 1) : 0;
    const lefts: number[] = [];
    let x = PAD;
    for (let l = 0; l < cols; l += 1) {
      lefts.push(x);
      x += widths[l] + gap;
    }
    columnFx = (mod, l) => {
      const usableW = Math.max(board.w - nodeWidth(mod) - PAD * 2, 1);
      return Math.min(1, Math.max(0, (lefts[l] - PAD) / usableW));
    };
  } else {
    columnFx = (_mod, l) => (cols === 1 ? 0.06 : (l / (cols - 1)) * 0.86 + 0.04);
  }

  // Vertical band the stacks live in (fractions of the usable board).
  const TOP = 0.08;
  const BOTTOM = 0.92;
  layers.forEach((layer, l) => {
    if (layer.length === 1) {
      out.set(layer[0].id, { fx: columnFx(layer[0], l), fy: 0.12 });
      return;
    }
    // Each row's slice of the band is proportional to the task's on-board size
    // (bigger importance → taller card → wider slice → more separation).
    const weights = layer.map((mod) => importanceScale(mod.importance));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const span = BOTTOM - TOP;
    let acc = 0;
    layer.forEach((mod, i) => {
      const fy = TOP + acc * span; // top of this task's weighted slice
      acc += weights[i] / total;
      out.set(mod.id, { fx: columnFx(mod, l), fy });
    });
  });
  return out;
}

/**
 * Top-left px of every node. Stored fractions win; tasks never dragged get an
 * auto slot: a ZIG-ZAG down the board (left, indented right, left…) in flow
 * order, plus a stable jitter for the hand-pinned look.
 *
 * The auto slot depends ONLY on the task's index in the block's full list and
 * its own id — never on how many OTHER tasks are still auto-placed. Pinning
 * one task must not move any of its neighbours.
 */
function resolvePositions(
  modules: ProjectModule[],
  board: { w: number; h: number },
): Map<string, Point> {
  const positions = new Map<string, Point>();

  const place = (mod: ProjectModule, fx: number, fy: number) => {
    const w = nodeWidth(mod);
    const usableW = Math.max(board.w - w - PAD * 2, 0);
    const usableH = Math.max(board.h - EST_NODE_H - PAD * 2, 0);
    positions.set(mod.id, {
      x: PAD + Math.min(1, Math.max(0, fx)) * usableW,
      y: PAD + Math.min(1, Math.max(0, fy)) * usableH,
    });
  };

  modules.forEach((mod, i) => {
    if (mod.mapX !== null && mod.mapY !== null) {
      place(mod, mod.mapX, mod.mapY);
      return;
    }
    const fx = (i % 2 === 0 ? 0.04 : 0.38) + hash01(mod.id) * 0.1;
    const fy =
      modules.length <= 1
        ? 0.12 + hash01(mod.id + ":y") * 0.08
        : (i / (modules.length - 1)) * 0.85 + hash01(mod.id + ":y") * 0.05;
    place(mod, fx, fy);
  });
  return positions;
}

export function Corkboard({
  project,
  flow,
  blockFlow,
  ghostMemberId,
  onToggleDependency,
  onSetPosition,
  onOpen,
  onAddTask,
  onAddTaskAt,
  onBoardResize,
  onGameActiveChange,
}: CorkboardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [boardSize, setBoardSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [rects, setRects] = useState<Map<string, Rect>>(new Map());
  const [portDrag, setPortDrag] = useState<PortDrag | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [rejectedId, setRejectedId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [recentEdgeKey, setRecentEdgeKey] = useState<string | null>(null);
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const [dragDelta, setDragDelta] = useState<Point | null>(null);
  // Air-hockey easter egg: the local player's held-task pointer as a fraction
  // of the full board (the paddle source), and a live flag that suppresses the
  // normal drop-commit while a game owns the drag.
  const [localPaddleFrac, setLocalPaddleFrac] = useState<{
    fx: number;
    fy: number;
  } | null>(null);
  const gameActiveRef = useRef(false);

  /** Client pointer → fraction (0–1) of the full board. */
  const boardFrac = (clientX: number, clientY: number) => {
    const base = containerRef.current?.getBoundingClientRect();
    if (!base || !boardSize) return null;
    return {
      fx: (clientX - base.left) / boardSize.w,
      fy: (clientY - base.top) / boardSize.h,
    };
  };

  const handleGameActiveChange = (active: boolean) => {
    gameActiveRef.current = active;
    onGameActiveChange?.(active);
  };
  // The task just dropped on the board — plays a one-shot spring "settle" in
  // place (no fly-in), then clears so the animation can replay on the next drop.
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);
  // Dot field: driven imperatively (no re-render per dot) — see updateDots.
  const dots = useRef(
    new Map<
      string,
      {
        el: SVGCircleElement;
        x: number;
        y: number;
        dx: number;
        dy: number;
        hidden: boolean;
      }
    >(),
  );
  const dotAnimations = useRef<Animation[]>([]);
  const lastFieldRect = useRef<Rect | null>(null);
  // Read once — decorative dot motion is skipped entirely under reduced motion.
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  // Double-click-to-place: an inline name field pinned at the click point.
  const [draft, setDraft] = useState<Point | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  // Guards against the blur that unmounting the field fires after Enter/Escape.
  const draftHandled = useRef(false);
  // Set while the click that trails an arrow (port) drag is still in flight:
  // releasing a connection over a node must NEVER open its popup.
  const suppressOpen = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  useEffect(() => {
    if (draft) draftInputRef.current?.focus();
  }, [draft]);

  const modules = blockFlow.modules;
  const inBlock = new Set(modules.map((m) => m.id));
  const isGhost = (mod: ProjectModule) =>
    ghostMemberId !== null && !mod.assigneeIds.includes(ghostMemberId);

  const positions = boardSize
    ? resolvePositions(modules, boardSize)
    : new Map<string, Point>();

  // --- live layer: teammates' cursors + tasks they are dragging -----------

  const room = useLiveRoom();
  const { cursors, drags } = useLiveHot();
  const blockId = blockFlow.block.id;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  const remoteCursors: LiveCursor[] = [];
  for (const cursor of cursors.values()) {
    if (cursor.blockId === blockId) remoteCursors.push(cursor);
  }

  /** Same px math as place(): fractions are of the USABLE board per node. */
  const ghostPoint = (mod: ProjectModule, fx: number, fy: number): Point => {
    const w = nodeWidth(mod);
    const usableW = Math.max((boardSize?.w ?? 0) - w - PAD * 2, 0);
    const usableH = Math.max((boardSize?.h ?? 0) - EST_NODE_H - PAD * 2, 0);
    return {
      x: PAD + clamp01(fx) * usableW,
      y: PAD + clamp01(fy) * usableH,
    };
  };

  // A finished drag keeps its ghost until the durable position (map_x/map_y
  // via postgres_changes) catches up — the card never snaps back home.
  const GHOST_EPS = 0.004;
  const ghostStillNeeded = (mod: ProjectModule, drag: LiveDrag): boolean => {
    if (drag.active) return true;
    if (mod.mapX === null || mod.mapY === null) return true;
    return (
      Math.abs(mod.mapX - drag.fx) > GHOST_EPS ||
      Math.abs(mod.mapY - drag.fy) > GHOST_EPS
    );
  };

  const remoteGhosts: {
    drag: LiveDrag;
    mod: ProjectModule;
    point: Point;
    dragger: TeamMember | null;
  }[] = [];
  if (boardSize) {
    for (const drag of drags.values()) {
      if (drag.blockId !== blockId) continue;
      if (drag.taskId === liftedId) continue; // our own drag wins visually
      const mod = modules.find((m) => m.id === drag.taskId);
      if (!mod || !ghostStillNeeded(mod, drag)) continue;
      remoteGhosts.push({
        drag,
        mod,
        point: ghostPoint(mod, drag.fx, drag.fy),
        dragger: project.members.find((m) => m.id === drag.memberId) ?? null,
      });
    }
  }
  const remoteGhostById = new Map(remoteGhosts.map((g) => [g.mod.id, g]));

  // Fingerprint of the ghosts currently traveling — drives the dot-field
  // effect further down (it must sit below the dot helpers it calls).
  const remoteFieldKey = remoteGhosts
    .filter((g) => g.drag.active)
    .map((g) => `${g.mod.id}:${Math.round(g.point.x)}:${Math.round(g.point.y)}`)
    .join("|");
  const remoteFieldWasActive = useRef(false);

  const sendLiveCursor = (clientX: number, clientY: number) => {
    if (!room || !boardSize || !containerRef.current) return;
    const point = localPoint({ clientX, clientY });
    room.sendCursor({
      blockId,
      fx: clamp01(point.x / boardSize.w),
      fy: clamp01(point.y / boardSize.h),
    });
  };

  /** The drag payload for the task currently lifted locally. */
  const sendLiveDrag = (delta: Point, active: boolean) => {
    if (!room || !boardSize || !liftedId) return;
    const mod = modules.find((m) => m.id === liftedId);
    const pos = positions.get(liftedId);
    if (!mod || !pos) return;
    const w = nodeWidth(mod);
    const usableW = Math.max(boardSize.w - w - PAD * 2, 1);
    const usableH = Math.max(boardSize.h - EST_NODE_H - PAD * 2, 1);
    room.sendDrag({
      taskId: liftedId,
      blockId,
      fx: clamp01((pos.x + delta.x - PAD) / usableW),
      fy: clamp01((pos.y + delta.y - PAD) / usableH),
      active,
    });
  };

  // --- measurement -------------------------------------------------------

  // Latest reporter behind a ref so the observer effect stays [] and never
  // re-subscribes when the parent passes a fresh callback identity.
  const onBoardResizeRef = useRef(onBoardResize);
  useEffect(() => {
    onBoardResizeRef.current = onBoardResize;
  }, [onBoardResize]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measureBoard = () => {
      const size = { w: container.clientWidth, h: container.clientHeight };
      setBoardSize(size);
      onBoardResizeRef.current?.(size);
    };
    measureBoard();
    const observer = new ResizeObserver(measureBoard);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Re-measure node rects whenever anything that moves them changes.
  const layoutKey = [
    boardSize ? `${boardSize.w}x${boardSize.h}` : "0",
    ...modules.map(
      (m) =>
        `${m.id}:${m.mapX}:${m.mapY}:${m.importance}:${m.dependsOn.join(",")}:${m.title.length}`,
    ),
  ].join("|");

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const base = container.getBoundingClientRect();
    const next = new Map<string, Rect>();
    for (const [id, el] of nodeRefs.current) {
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      next.set(id, {
        x: r.left - base.left,
        y: r.top - base.top,
        w: r.width,
        h: r.height,
      });
    }
    setRects(next);
    // layoutKey is the real dependency: it fingerprints everything that can
    // move a node (positions, sizes, edges, board size).
  }, [layoutKey]);

  /** Node rect with the live drag offset applied — edges follow the drag. */
  const rectFor = (id: string): Rect | null => {
    const rect = rects.get(id);
    if (!rect) return null;
    if (liftedId === id && dragDelta) {
      return { ...rect, x: rect.x + dragDelta.x, y: rect.y + dragDelta.y };
    }
    // A task flying in a teammate's hand: edges chase the ghost, not the
    // hidden origin node.
    const ghost = remoteGhostById.get(id);
    if (ghost) return { ...rect, x: ghost.point.x, y: ghost.point.y };
    return rect;
  };

  // --- dot field (imperative: runs per pointermove, outside React) --------

  /**
   * Pushes every dot away from the traveling card. Dots inside the card's
   * (slightly grown) footprint duck away — they gave up their spot; dots
   * within reach lean outward from the nearest edge, so the clearing follows
   * the card's SHAPE, not a circle. Only changed dots touch the DOM.
   */
  const updateDots = (rect: Rect | null) => {
    if (reducedMotion) return;
    lastFieldRect.current = rect;
    const zone = rect
      ? {
          x: rect.x - DOT_MARGIN,
          y: rect.y - DOT_MARGIN,
          w: rect.w + DOT_MARGIN * 2,
          h: rect.h + DOT_MARGIN * 2,
        }
      : null;
    for (const dot of dots.current.values()) {
      let dx = 0;
      let dy = 0;
      let hidden = false;
      if (zone) {
        const nx = Math.min(Math.max(dot.x, zone.x), zone.x + zone.w);
        const ny = Math.min(Math.max(dot.y, zone.y), zone.y + zone.h);
        const vx = dot.x - nx;
        const vy = dot.y - ny;
        const dist = Math.hypot(vx, vy);
        if (dist === 0) {
          // Swallowed by the card: fade out right where it was pushed to
          // (keeping its displacement) instead of jumping home mid-fade.
          hidden = true;
          dx = dot.dx;
          dy = dot.dy;
        } else if (dist < DOT_FIELD) {
          const t = 1 - dist / DOT_FIELD;
          const push = DOT_PUSH * t * t;
          dx = (vx / dist) * push;
          dy = (vy / dist) * push;
        }
      }
      if (hidden !== dot.hidden) {
        dot.hidden = hidden;
        dot.el.style.opacity = hidden ? "0" : "";
      }
      if (dx !== dot.dx || dy !== dot.dy) {
        dot.dx = dx;
        dot.dy = dy;
        dot.el.style.transform =
          dx === 0 && dy === 0 ? "" : `translate(${dx}px, ${dy}px)`;
      }
    }
  };

  /** Every displaced dot springs home — nearest first, a small outward wave. */
  const releaseDots = () => {
    const rect = lastFieldRect.current;
    lastFieldRect.current = null;
    for (const dot of dots.current.values()) {
      if (dot.hidden) {
        dot.hidden = false;
        dot.el.style.opacity = "";
      }
      if (dot.dx === 0 && dot.dy === 0) continue;
      const { dx, dy } = dot;
      dot.dx = 0;
      dot.dy = 0;
      dot.el.style.transform = "";
      if (reducedMotion) continue;
      const delay = rect
        ? Math.min(distanceToRect(dot.x, dot.y, rect) * 1.4, 160)
        : 0;
      dotAnimations.current.push(
        dot.el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0px, 0px)" },
          ],
          {
            duration: 480,
            easing: DOT_RETURN_EASING,
            delay,
            // Holds the displaced pose through the stagger delay.
            fill: "backwards",
          },
        ),
      );
    }
  };

  /** A new drag interrupts any spring-back still in flight. */
  const cancelDotAnimations = () => {
    for (const animation of dotAnimations.current) animation.cancel();
    dotAnimations.current = [];
  };

  // Remote flying cards displace the dot field exactly like local ones (the
  // local drag owns the dots while both happen at once).
  useEffect(() => {
    if (liftedId) return;
    const traveling = remoteGhosts.find((g) => g.drag.active);
    if (traveling) {
      if (!remoteFieldWasActive.current) cancelDotAnimations();
      remoteFieldWasActive.current = true;
      updateDots({
        x: traveling.point.x,
        y: traveling.point.y,
        w: nodeWidth(traveling.mod),
        h: rects.get(traveling.mod.id)?.h ?? EST_NODE_H,
      });
    } else if (remoteFieldWasActive.current) {
      remoteFieldWasActive.current = false;
      releaseDots();
    }
    // remoteFieldKey fingerprints the traveling ghosts; the callbacks are
    // stable enough (they only touch refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteFieldKey, liftedId]);

  // --- free drop (positions) via the shared DndContext --------------------

  useDndMonitor({
    onDragStart: (event) => {
      const data = event.active.data.current;
      if (data?.type === "task" && inBlock.has(String(data.taskId))) {
        const id = String(data.taskId);
        setLiftedId(id);
        setSelectedEdge(null);
        // Dots lean away from the picked-up card immediately.
        cancelDotAnimations();
        const rect = rects.get(id);
        if (rect) updateDots(rect);
        // Seed the air-hockey paddle at the pick-up point.
        const a = event.activatorEvent as Partial<PointerEvent> | null;
        if (a && typeof a.clientX === "number" && typeof a.clientY === "number") {
          setLocalPaddleFrac(boardFrac(a.clientX, a.clientY));
        }
      }
    },
    onDragMove: (event) => {
      if (!liftedId) return;
      setDragDelta({ x: event.delta.x, y: event.delta.y });
      const rect = rects.get(liftedId);
      if (rect) {
        updateDots({
          ...rect,
          x: rect.x + event.delta.x,
          y: rect.y + event.delta.y,
        });
      }
      // The pointer (dnd capture swallows pointermove, so reconstruct it).
      const activator = event.activatorEvent as Partial<PointerEvent> | null;
      const px =
        activator && typeof activator.clientX === "number"
          ? activator.clientX + event.delta.x
          : null;
      const py =
        activator && typeof activator.clientY === "number"
          ? activator.clientY + event.delta.y
          : null;
      // The paddle always follows the pointer — it's the game's input source.
      if (px !== null && py !== null) setLocalPaddleFrac(boardFrac(px, py));
      // While a game owns the drag, don't broadcast the wandering task as a
      // flying ghost / cursor — the paddle rides the game channel instead.
      if (gameActiveRef.current) return;
      // The group watches the card fly in real time…
      sendLiveDrag({ x: event.delta.x, y: event.delta.y }, true);
      if (px !== null && py !== null) sendLiveCursor(px, py);
    },
    onDragEnd: (event) => {
      const id = liftedId;
      // A game owned this drag: the task never really moved (it was a paddle).
      // Reset the peers' ghost to its origin and leave the stored position be.
      if (gameActiveRef.current) {
        sendLiveDrag({ x: 0, y: 0 }, false);
        setLiftedId(null);
        setDragDelta(null);
        setLocalPaddleFrac(null);
        releaseDots();
        return;
      }
      // Final frame BEFORE clearing lift state (sendLiveDrag reads liftedId).
      sendLiveDrag({ x: event.delta.x, y: event.delta.y }, false);
      setLiftedId(null);
      setDragDelta(null);
      setLocalPaddleFrac(null);
      releaseDots();
      if (!id || !boardSize) return;
      // Dropped on a block diamond → the MapView moves it between blocks.
      if (event.over?.data.current?.type === "block") return;
      const mod = modules.find((m) => m.id === id);
      const pos = positions.get(id);
      if (!mod || !pos) return;
      const w = nodeWidth(mod);
      const usableW = Math.max(boardSize.w - w - PAD * 2, 1);
      const usableH = Math.max(boardSize.h - EST_NODE_H - PAD * 2, 1);
      const fx = (pos.x + event.delta.x - PAD) / usableW;
      const fy = (pos.y + event.delta.y - PAD) / usableH;
      onSetPosition(id, Math.min(1, Math.max(0, fx)), Math.min(1, Math.max(0, fy)));
      // The card settles onto the board with a spring where it landed.
      setJustDroppedId(id);
      later(() => setJustDroppedId((cur) => (cur === id ? null : cur)), 320);
    },
    onDragCancel: () => {
      sendLiveDrag({ x: 0, y: 0 }, false);
      setLiftedId(null);
      setDragDelta(null);
      setLocalPaddleFrac(null);
      releaseDots();
    },
  });

  // --- dependency edges ----------------------------------------------------

  const edges: Edge[] = [];
  for (const mod of modules) {
    for (const depId of mod.dependsOn) {
      if (!inBlock.has(depId)) continue;
      const dep = project.modules.find((m) => m.id === depId);
      if (dep) {
        edges.push({
          sourceId: depId,
          targetId: mod.id,
          done: dep.status === "done",
        });
      }
    }
  }

  const flashReject = (id: string) => {
    setRejectedId(id);
    later(() => setRejectedId(null), 600);
  };

  const flashConnect = (nodeId: string, edgeKey: string) => {
    setFlashId(nodeId);
    setRecentEdgeKey(edgeKey);
    later(() => setFlashId(null), 700);
    later(() => setRecentEdgeKey(null), 1100);
  };

  const localPoint = (e: { clientX: number; clientY: number }): Point => {
    const base = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - base.left, y: e.clientY - base.top };
  };

  // --- double-click to place a new task -----------------------------------

  /** Node footprint at default importance — the placed task's top-left. */
  const draftNodeW = Math.round(
    NODE_BASE_WIDTH * importanceScale(IMPORTANCE_DEFAULT),
  );

  const openDraft = (point: Point) => {
    draftHandled.current = false;
    setSelectedEdge(null);
    setDraftValue("");
    setDraft(point);
  };

  const cancelDraft = () => {
    draftHandled.current = true;
    setDraft(null);
    setDraftValue("");
  };

  const commitDraft = () => {
    if (draftHandled.current) return;
    draftHandled.current = true;
    const point = draft;
    const title = draftValue.trim();
    setDraft(null);
    setDraftValue("");
    if (!point || !boardSize || !title) return;
    const usableW = Math.max(boardSize.w - draftNodeW - PAD * 2, 1);
    const usableH = Math.max(boardSize.h - EST_NODE_H - PAD * 2, 1);
    const fx = Math.min(1, Math.max(0, (point.x - PAD) / usableW));
    const fy = Math.min(1, Math.max(0, (point.y - PAD) / usableH));
    onAddTaskAt(title, fx, fy);
  };

  const validTargetsFor = (
    sourceId: string,
    direction: PortDrag["direction"],
  ): Set<string> => {
    const source = modules.find((m) => m.id === sourceId);
    const valid = new Set<string>();
    if (!source) return valid;
    for (const other of modules) {
      if (other.id === sourceId) continue;
      if (direction === "out") {
        // other would depend on source
        if (other.dependsOn.includes(sourceId)) continue;
        if (wouldCreateCycle(project, other.id, sourceId)) continue;
      } else {
        // source would depend on other
        if (source.dependsOn.includes(other.id)) continue;
        if (wouldCreateCycle(project, sourceId, other.id)) continue;
      }
      valid.add(other.id);
    }
    return valid;
  };

  const nearestValid = (point: Point, validIds: Set<string>): string | null => {
    let best: string | null = null;
    let bestDist = SNAP_RADIUS;
    for (const id of validIds) {
      const rect = rectFor(id);
      if (!rect) continue;
      // Distance to the RECT (0 when inside) — wide nodes must attract from
      // their edges, not from their far-away center.
      const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.w));
      const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.h));
      const dist = Math.hypot(dx, dy);
      if (dist === 0) return id;
      if (dist < bestDist) {
        bestDist = dist;
        best = id;
      }
    }
    return best;
  };

  const startPortDrag = (
    sourceId: string,
    direction: PortDrag["direction"],
    e: ReactPointerEvent,
  ) => {
    // The port must never start a node drag or a click-to-open.
    e.stopPropagation();
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already released — the drag just won't track.
    }
    setSelectedEdge(null);
    setPortDrag({
      sourceId,
      direction,
      ...localPoint(e),
      validIds: validTargetsFor(sourceId, direction),
      snapId: null,
    });
  };

  const movePortDrag = (e: ReactPointerEvent) => {
    setPortDrag((prev) => {
      if (!prev) return prev;
      const point = localPoint(e);
      return { ...prev, ...point, snapId: nearestValid(point, prev.validIds) };
    });
  };

  const endPortDrag = (e: ReactPointerEvent) => {
    const drag = portDrag;
    setPortDrag(null);
    if (!drag) return;
    // Swallow the click the browser synthesizes right after this pointerup
    // (depending on capture it can land on the source OR the target node).
    suppressOpen.current = true;
    later(() => {
      suppressOpen.current = false;
    }, 300);
    const point = localPoint(e);
    let targetId = drag.snapId;
    if (!targetId) {
      for (const [id, rect] of rects) {
        if (
          point.x >= rect.x &&
          point.x <= rect.x + rect.w &&
          point.y >= rect.y &&
          point.y <= rect.y + rect.h &&
          id !== drag.sourceId
        ) {
          targetId = id;
          break;
        }
      }
    }
    if (!targetId) return;
    if (!drag.validIds.has(targetId)) {
      flashReject(targetId);
      return;
    }
    if (drag.direction === "out") {
      // target now depends on source
      onToggleDependency(targetId, drag.sourceId);
      flashConnect(targetId, `${drag.sourceId}->${targetId}`);
    } else {
      // source now depends on target
      onToggleDependency(drag.sourceId, targetId);
      flashConnect(drag.sourceId, `${targetId}->${drag.sourceId}`);
    }
  };

  const removeSelectedEdge = () => {
    if (!selectedEdge) return;
    onToggleDependency(selectedEdge.targetId, selectedEdge.sourceId);
    setSelectedEdge(null);
  };

  // --- geometry ------------------------------------------------------------

  const curve = (x1: number, y1: number, x2: number, y2: number): string => {
    const bend = Math.max(24, Math.abs(x2 - x1) * 0.4);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  };

  const edgePath = (edge: Edge): string | null => {
    const s = rectFor(edge.sourceId);
    const t = rectFor(edge.targetId);
    if (!s || !t) return null;
    return curve(s.x + s.w, s.y + s.h / 2, t.x, t.y + t.h / 2);
  };

  const edgeMidpoint = (edge: Edge) => {
    const s = rectFor(edge.sourceId);
    const t = rectFor(edge.targetId);
    if (!s || !t) return null;
    return {
      x: (s.x + s.w + t.x) / 2,
      y: (s.y + s.h / 2 + (t.y + t.h / 2)) / 2,
    };
  };

  const tempLine = (() => {
    if (!portDrag) return null;
    const s = rectFor(portDrag.sourceId);
    if (!s) return null;
    const snap = portDrag.snapId ? rectFor(portDrag.snapId) : null;
    if (portDrag.direction === "out") {
      const end: Point = snap
        ? { x: snap.x, y: snap.y + snap.h / 2 }
        : { x: portDrag.x, y: portDrag.y };
      return {
        d: curve(s.x + s.w, s.y + s.h / 2, end.x, end.y),
        tip: end,
      };
    }
    const start: Point = snap
      ? { x: snap.x + snap.w, y: snap.y + snap.h / 2 }
      : { x: portDrag.x, y: portDrag.y };
    return {
      d: curve(start.x, start.y, s.x, s.y + s.h / 2),
      tip: start,
    };
  })();

  const selectedMid = selectedEdge ? edgeMidpoint(selectedEdge) : null;

  // Memoized so the ~1k circle refs only re-run when the board resizes —
  // NOT on every drag-move re-render.
  const dotField = useMemo(() => {
    if (!boardSize) return null;
    const circles = [];
    for (let y = DOT_SPACING / 2; y < boardSize.h; y += DOT_SPACING) {
      for (let x = DOT_SPACING / 2; x < boardSize.w; x += DOT_SPACING) {
        const key = `${x}:${y}`;
        circles.push(
          <circle
            key={key}
            cx={x}
            cy={y}
            r={1.1}
            fill="rgba(29, 28, 23, 0.14)"
            className="corkboard-dot"
            ref={(el) => {
              if (el) {
                dots.current.set(key, {
                  el,
                  x,
                  y,
                  dx: 0,
                  dy: 0,
                  hidden: false,
                });
              } else {
                dots.current.delete(key);
              }
            }}
          />,
        );
      }
    }
    return circles;
  }, [boardSize]);

  // Dated tasks get a vertical guide at their center — bottom of the board up
  // to a name + date label at the top. rectFor keeps it glued during drags.
  const dueMarkers = modules.flatMap((mod) => {
    if (!mod.dueDate) return [];
    const rect = rectFor(mod.id);
    if (!rect) return [];
    return [
      {
        id: mod.id,
        x: rect.x + rect.w / 2,
        title: mod.title || "Sin título",
        // "12 mar 2026" → "12 mar": the year is noise on the board.
        date: formatShort(mod.dueDate).replace(/ \d{4}$/, ""),
      },
    ];
  });

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      onClick={() => setSelectedEdge(null)}
      onDoubleClick={(e) => {
        // Only empty board space — nodes/edges are children with pointer events,
        // the dot/svg layers are pointer-events-none (never the target).
        if (e.target !== e.currentTarget || !boardSize) return;
        openDraft(localPoint(e));
      }}
      // Teammates see this pointer glide over the board (throttled upstream).
      onPointerMove={(e) => sendLiveCursor(e.clientX, e.clientY)}
      onPointerLeave={() => room?.sendCursor(null)}
    >
      {/* Dot field: real SVG dots so they can make room for the traveling
          card and spring back home on drop. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {dotField}
      </svg>

      {modules.length === 0 && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <InlineAddTask
            onAdd={onAddTask}
            label="Primera tarea del bloque"
            triggerClassName="flex items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-4 py-3 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
            inputClassName="w-60 rounded-xl border border-accent bg-surface px-4 py-3 text-xs font-medium text-ink outline-none ring-2 ring-accent/25 placeholder:text-muted-2"
          />
        </div>
      )}

      {/* Double-click draft: a task-sized name field pinned where you clicked. */}
      {draft && (
        <input
          ref={draftInputRef}
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelDraft();
            }
          }}
          onBlur={commitDraft}
          onClick={(e) => e.stopPropagation()}
          placeholder="Nombre de la tarea…"
          aria-label="Nombre de la nueva tarea"
          style={{ left: draft.x, top: draft.y, width: draftNodeW }}
          className="absolute z-40 rounded-lg border border-l-[3px] border-accent bg-surface px-2.5 py-2 text-xs font-medium text-ink shadow-raised outline-none ring-2 ring-accent/25 placeholder:text-muted-2"
        />
      )}

      {/* Edges under the nodes; paths stay clickable via pointer-events. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <marker
            id={`arrow-${blockFlow.block.id}`}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--color-line-strong)" />
          </marker>
          <marker
            id={`arrow-live-${blockFlow.block.id}`}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--color-accent)" />
          </marker>
        </defs>
        {/* Date guides live UNDER the dependency curves. */}
        {boardSize &&
          dueMarkers.map((m) => (
            <line
              key={`due-${m.id}`}
              x1={m.x}
              y1={34}
              x2={m.x}
              y2={boardSize.h}
              stroke="var(--color-line-strong)"
              strokeWidth={1}
              strokeDasharray="2 4"
              opacity={0.85}
            />
          ))}
        {edges.map((edge) => {
          const d = edgePath(edge);
          if (!d) return null;
          const key = `${edge.sourceId}->${edge.targetId}`;
          const isSelected =
            selectedEdge?.sourceId === edge.sourceId &&
            selectedEdge?.targetId === edge.targetId;
          const isRecent = recentEdgeKey === key;
          return (
            <g key={key}>
              {/* Wide invisible hit area */}
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                className="pointer-events-auto cursor-pointer"
                style={{ pointerEvents: "stroke" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEdge(isSelected ? null : edge);
                }}
              />
              <path
                d={d}
                fill="none"
                markerEnd={`url(#arrow-${isSelected || isRecent ? `live-${blockFlow.block.id}` : blockFlow.block.id})`}
                stroke={
                  isSelected || isRecent
                    ? "var(--color-accent)"
                    : "var(--color-line-strong)"
                }
                strokeWidth={isSelected || isRecent ? 2 : 1.5}
                opacity={edge.done && !isSelected && !isRecent ? 0.45 : 1}
              />
            </g>
          );
        })}
        {tempLine && (
          <>
            <path
              d={tempLine.d}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={1.75}
              strokeDasharray="6 5"
              markerEnd={`url(#arrow-live-${blockFlow.block.id})`}
              className="edge-marching"
            />
            <circle
              cx={tempLine.tip.x}
              cy={tempLine.tip.y}
              r={8}
              fill="var(--color-accent)"
              opacity={0.14}
            />
            <circle
              cx={tempLine.tip.x}
              cy={tempLine.tip.y}
              r={3}
              fill="var(--color-accent)"
            />
          </>
        )}
      </svg>

      {/* Name + date on top of each date guide — travels with the task. */}
      {dueMarkers.map((m) => (
        <div
          key={`due-label-${m.id}`}
          aria-hidden
          className="pointer-events-none absolute top-1 w-32 -translate-x-1/2 text-center"
          style={{ left: m.x }}
        >
          <p className="truncate text-[10px] font-medium leading-tight text-ink-2">
            {m.title}
          </p>
          <p className="text-[10px] leading-tight text-muted">{m.date}</p>
        </div>
      ))}

      {/* Remove button for the selected edge */}
      {selectedEdge && selectedMid && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            removeSelectedEdge();
          }}
          aria-label="Quitar dependencia"
          className="absolute z-20 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-muted shadow-raised transition-colors hover:text-danger"
          style={{ left: selectedMid.x, top: selectedMid.y }}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {/* Pinned nodes */}
      {boardSize &&
        modules.map((mod) => {
          const entry = flow.byId.get(mod.id);
          const pos = positions.get(mod.id);
          if (!entry || !pos) return null;
          return (
            <CorkNode
              key={mod.id}
              project={project}
              entry={entry}
              inBlock={inBlock}
              position={pos}
              ghost={isGhost(mod)}
              lifted={liftedId === mod.id}
              remoteLifted={remoteGhostById.has(mod.id)}
              justDropped={justDroppedId === mod.id}
              rejected={rejectedId === mod.id}
              flashing={flashId === mod.id}
              portDrag={portDrag}
              registerRef={(el) => {
                if (el) nodeRefs.current.set(mod.id, el);
                else nodeRefs.current.delete(mod.id);
              }}
              onOpen={() => {
                if (suppressOpen.current || gameActiveRef.current) return;
                onOpen(mod.id);
              }}
              onPortDown={(direction, e) => startPortDrag(mod.id, direction, e)}
              onPortMove={movePortDrag}
              onPortUp={endPortDrag}
            />
          );
        })}

      {/* Tasks flying in a teammate's hand — the ghost card follows their
          broadcast position; the origin node hides meanwhile (remoteLifted).
          The "moving" treatment (name tag, tilt, owner-tinted halo) shows ONLY
          while they are actively dragging: the moment they let go the card
          settles as a plain task at rest, so no move animation lingers — and a
          teammate reorganising in another view (which never broadcasts an
          active map drag) shows nothing here at all. */}
      {remoteGhosts.map(({ drag, mod, point, dragger }) => {
        const color = dragger ? colorForKey(dragger.colorKey) : null;
        const moving = drag.active;
        return (
          <div
            key={`remote-drag:${mod.id}`}
            className="pointer-events-none absolute z-40 transition-[left,top] duration-[110ms] ease-linear"
            style={{ left: point.x, top: point.y }}
          >
            {moving && dragger && color && (
              <span
                className="absolute -top-4 left-1 z-10 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none shadow-sm"
                style={{ backgroundColor: color.bg, color: color.ink }}
              >
                {firstNameOf(dragger.name)}
              </span>
            )}
            {/* Same shape as the task itself (CorkNodeStatic): a rounded,
                owner-tinted card — never a boxy outline. The halo is a soft
                colored shadow that follows the card's curve. */}
            <div
              className={cn(
                "rounded-lg transition-transform duration-200",
                moving && "rotate-[1deg] scale-[1.03]",
              )}
              style={
                color && moving
                  ? {
                      boxShadow: `0 0 0 2px ${color.bg}55, 0 14px 30px -12px ${color.bg}`,
                    }
                  : undefined
              }
            >
              <CorkNodeStatic project={project} module={mod} lifted={moving} />
            </div>
          </div>
        );
      })}

      {/* Teammates' pointers on THIS block's board, in their member color. */}
      {boardSize &&
        remoteCursors.map((cursor) => {
          const member = project.members.find((m) => m.id === cursor.memberId);
          if (!member) return null;
          const color = colorForKey(member.colorKey);
          return (
            <div
              key={`cursor:${cursor.tabId}`}
              className="pointer-events-none absolute z-50 transition-[left,top] duration-100 ease-linear"
              style={{
                left: cursor.fx * boardSize.w,
                top: cursor.fy * boardSize.h,
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                aria-hidden
                className="-translate-x-[2px] -translate-y-[2px] drop-shadow-sm"
              >
                <path
                  d="M5.5 3.2 L19 11.3 L12.6 12.8 L9.4 18.9 Z"
                  fill={color.bg}
                  stroke="#fff"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
              <span
                className="ml-3 -mt-0.5 block w-fit whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none shadow-sm"
                style={{ backgroundColor: color.bg, color: color.ink }}
              >
                {firstNameOf(member.name)}
              </span>
            </div>
          );
        })}

      {/* Air-hockey easter egg — cloud only, needs the live room + a measured
          board. Inert (renders nothing) until two players hold + hold still. */}
      {room && boardSize && (
        <AirHockeyLayer
          room={room}
          blockId={blockId}
          boardSize={boardSize}
          project={project}
          drags={drags}
          localPaddle={localPaddleFrac}
          reducedMotion={reducedMotion}
          onActiveChange={handleGameActiveChange}
        />
      )}
    </div>
  );
}

/** "Diego Molina" → "Diego" (cursor/ghost labels stay short). */
function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function stateGlyph(entry: ModuleFlow, waitingColor: string | null) {
  if (entry.state === "done") {
    return <Check className="h-3.5 w-3.5 shrink-0 text-done" strokeWidth={3} />;
  }
  const style = waitingColor ? { color: waitingColor } : undefined;
  return entry.state === "locked" ? (
    <Lock className="h-3.5 w-3.5 shrink-0 text-muted" style={style} />
  ) : (
    <LockOpen className="h-3.5 w-3.5 shrink-0 text-muted" style={style} />
  );
}

function CorkNode({
  project,
  entry,
  inBlock,
  position,
  ghost,
  lifted,
  remoteLifted,
  justDropped,
  rejected,
  flashing,
  portDrag,
  registerRef,
  onOpen,
  onPortDown,
  onPortMove,
  onPortUp,
}: {
  project: Project;
  entry: ModuleFlow;
  inBlock: Set<string>;
  position: Point;
  ghost: boolean;
  lifted: boolean;
  /** A teammate is dragging this task right now — its ghost is the visible one. */
  remoteLifted: boolean;
  justDropped: boolean;
  rejected: boolean;
  flashing: boolean;
  portDrag: PortDrag | null;
  registerRef: (el: HTMLElement | null) => void;
  onOpen: () => void;
  onPortDown: (direction: "out" | "in", e: ReactPointerEvent) => void;
  onPortMove: (e: ReactPointerEvent) => void;
  onPortUp: (e: ReactPointerEvent) => void;
}) {
  const mod = entry.module;
  // One-shot halo when a TEAMMATE just edited this task (cloud realtime).
  const { remoteGlow } = useProject();
  const glowTs = remoteGlow.get(mod.id);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `node:${mod.id}`,
    data: { type: "task", taskId: mod.id },
    disabled: ghost || remoteLifted,
  });
  // A completed drag must not fire the click-to-open that follows pointerup.
  const draggedRef = useRef(false);
  useEffect(() => {
    if (isDragging) draggedRef.current = true;
  }, [isDragging]);

  const scale = importanceScale(mod.importance);
  const owner = project.members.find((m) => mod.assigneeIds.includes(m.id));
  const ownerColor = owner ? colorForKey(owner.colorKey) : null;
  const waiting = entry.waitingMemberIds[0]
    ? project.members.find((m) => m.id === entry.waitingMemberIds[0])
    : null;
  const waitingColor = waiting ? colorForKey(waiting.colorKey).bg : null;

  // Connection-drag context: is this node a candidate right now?
  const targeting = portDrag !== null && portDrag.sourceId !== mod.id;
  const isValidTarget = targeting && portDrag!.validIds.has(mod.id);
  const isSnapped = targeting && portDrag!.snapId === mod.id;
  const isPortSource = portDrag?.sourceId === mod.id;

  // Deps living in OTHER blocks can't be drawn as edges here — a compact
  // chip stands in for each one.
  const externalDeps = mod.dependsOn
    .filter((id) => !inBlock.has(id))
    .map((id) => project.modules.find((m) => m.id === id))
    .filter((m): m is ProjectModule => Boolean(m));

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        registerRef(el);
      }}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        onOpen();
      }}
      style={{
        left: position.x,
        top: position.y,
        width: nodeWidth(mod),
        borderLeftColor: ownerColor?.bg ?? "var(--color-line-strong)",
        // Owner tint painted OVER the opaque surface — the card must never
        // be see-through (dots pass UNDER tasks, not through them).
        backgroundImage: ownerColor
          ? `linear-gradient(0deg, ${ownerColor.bg}0F, ${ownerColor.bg}0F)`
          : undefined,
        fontSize: 12 * scale,
        padding: `${8 * scale}px ${10 * scale}px`,
      }}
      className={cn(
        "group/node absolute rounded-lg border border-line border-l-[3px] bg-surface text-left shadow-card transition-[box-shadow,opacity,transform] duration-300 ease-[var(--ease-spring)]",
        ghost
          ? "cursor-pointer opacity-25 hover:opacity-60"
          : "cursor-grab touch-none active:cursor-grabbing",
        // The origin hides fully while its card travels (the overlay is the
        // visible one) — no faint "transparent task" left behind. Same rule
        // when the card travels in a TEAMMATE's hand.
        lifted && "z-30 opacity-0",
        remoteLifted && "pointer-events-none opacity-0",
        !lifted && isDragging && "z-30",
        justDropped && "animate-settle",
        rejected && "!border-danger",
        flashing && "node-flash",
        isValidTarget && !isSnapped && "ring-1 ring-accent/40",
        isSnapped && "z-20 scale-[1.03] shadow-raised ring-2 ring-accent",
        targeting && !isValidTarget && "opacity-40 saturate-50",
      )}
    >
      {glowTs !== undefined && !remoteLifted && (
        <span
          key={glowTs}
          aria-hidden
          className="remote-glow-overlay"
          style={
            {
              "--glow-color": ownerColor?.bg ?? "var(--color-accent)",
            } as CSSProperties
          }
        />
      )}
      <span className="flex items-center" style={{ gap: 6 * scale }}>
        <DocTypeBadge docType={mod.docType} />
        <span
          className={cn(
            "min-w-0 flex-1 font-medium leading-snug",
            mod.status === "done" ? "text-muted line-through" : "text-ink",
          )}
        >
          <span className="line-clamp-2">{mod.title || "Sin título"}</span>
        </span>
        {stateGlyph(entry, waitingColor)}
      </span>

      {externalDeps.length > 0 && (
        <span className="mt-1.5 flex flex-wrap gap-1">
          {externalDeps.map((dep) => {
            const depOwner = project.members.find((m) =>
              dep.assigneeIds.includes(m.id),
            );
            const depColor = depOwner ? colorForKey(depOwner.colorKey) : null;
            return (
              <span
                key={dep.id}
                title={dep.title || "Sin título"}
                style={
                  depColor
                    ? {
                        backgroundColor: depColor.bg + "14",
                        borderColor: depColor.bg + "33",
                      }
                    : undefined
                }
                className="inline-flex max-w-full items-center truncate rounded border border-line bg-surface-2 px-1 py-px text-[10px] text-ink-2"
              >
                {dep.status === "done" ? (
                  <Check className="mr-0.5 h-2.5 w-2.5 shrink-0 text-done" />
                ) : (
                  <Lock className="mr-0.5 h-2.5 w-2.5 shrink-0 text-muted" />
                )}
                <span className="truncate">{dep.title || "Sin título"}</span>
              </span>
            );
          })}
        </span>
      )}

      {/* Ports: left = "depende de" (drag to pick a prerequisite),
          right = "bloquea a" (drag onto the task this one unlocks). */}
      {!ghost && (
        <>
          <span
            onPointerDown={(e) => onPortDown("in", e)}
            onPointerMove={onPortMove}
            onPointerUp={onPortUp}
            onClick={(e) => e.stopPropagation()}
            aria-hidden
            title="Arrastra para añadir una dependencia"
            className={cn(
              "absolute -left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 cursor-crosshair touch-none rounded-full border-2 border-line-strong bg-surface transition-all hover:scale-125 hover:border-accent hover:bg-accent-soft",
              isPortSource && portDrag?.direction === "in"
                ? "scale-125 border-accent bg-accent-soft opacity-100"
                : isSnapped && portDrag?.direction === "out"
                  ? "border-accent bg-accent-soft opacity-100"
                  : "opacity-0 group-hover/node:opacity-100",
            )}
          />
          <span
            onPointerDown={(e) => onPortDown("out", e)}
            onPointerMove={onPortMove}
            onPointerUp={onPortUp}
            onClick={(e) => e.stopPropagation()}
            aria-hidden
            title="Arrastra hasta la tarea que desbloquea"
            className={cn(
              "absolute -right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 cursor-crosshair touch-none rounded-full border-2 border-line-strong bg-surface transition-all hover:scale-125 hover:border-accent hover:bg-accent-soft",
              isPortSource && portDrag?.direction === "out"
                ? "scale-125 border-accent bg-accent-soft opacity-100"
                : isSnapped && portDrag?.direction === "in"
                  ? "border-accent bg-accent-soft opacity-100"
                  : "opacity-0 group-hover/node:opacity-100",
            )}
          />
        </>
      )}
    </div>
  );
}

/** Overlay visual while a node travels (DragOverlay keeps it unclipped). */
export function CorkNodeStatic({
  project,
  module,
  lifted = true,
}: {
  project: Project;
  module: ProjectModule;
  /** The pick-up "lift" animation. Off for a settled (dropped) ghost so it
   *  reads as the task at rest, not a card mid-flight. */
  lifted?: boolean;
}) {
  const scale = importanceScale(module.importance);
  const owner = project.members.find((m) => module.assigneeIds.includes(m.id));
  const ownerColor = owner ? colorForKey(owner.colorKey) : null;
  return (
    <div
      style={{
        width: nodeWidth(module),
        borderLeftColor: ownerColor?.bg ?? "var(--color-line-strong)",
        // Same opaque tint as CorkNode — the traveling card covers the dots.
        backgroundImage: ownerColor
          ? `linear-gradient(0deg, ${ownerColor.bg}0F, ${ownerColor.bg}0F)`
          : undefined,
        fontSize: 12 * scale,
        padding: `${8 * scale}px ${10 * scale}px`,
      }}
      className={cn(
        "cursor-grabbing rounded-lg border border-line border-l-[3px] bg-surface shadow-pop",
        lifted && "animate-lift",
      )}
    >
      <span className="flex items-center" style={{ gap: 6 * scale }}>
        <DocTypeBadge docType={module.docType} />
        <span className="min-w-0 flex-1 font-medium leading-snug text-ink">
          <span className="line-clamp-2">{module.title || "Sin título"}</span>
        </span>
      </span>
    </div>
  );
}
