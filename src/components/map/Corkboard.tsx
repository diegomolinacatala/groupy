"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useDndMonitor, useDraggable } from "@dnd-kit/core";
import { Check, Lock, LockOpen, X } from "lucide-react";
import type { BlockFlow, ModuleFlow, ProjectFlow } from "@/lib/data/flow";
import { wouldCreateCycle } from "@/lib/data/flow";
import {
  IMPORTANCE_DEFAULT,
  importanceScale,
  type Project,
  type ProjectModule,
} from "@/lib/data/types";
import { formatShort } from "@/lib/utils/dates";
import { DocTypeBadge } from "@/components/ui/DocTypeBadge";
import { InlineAddTask } from "@/components/ui/InlineAddTask";
import { colorForKey } from "@/lib/utils/colors";
import { cn } from "@/lib/utils/cn";

// The corkboard INSIDE one block: tasks are pinned wherever you drop them
// (Mac-desktop style, positions persist as board fractions), dependencies are
// measured SVG curves. Dragging a port onto another node creates a
// dependency — with magnetic snapping and live highlighting of valid
// targets; clicking an edge exposes its remove button. Everyone can edit
// everything here; cycles are the only hard rule.

const PAD = 10;
/** Base card width at default importance — scaled by `importanceScale`. */
const NODE_BASE_WIDTH = 172;
const EST_NODE_H = 60;
/** Cursor-to-node distance at which a connection snaps on. */
const SNAP_RADIUS = 56;

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
}

export function nodeWidth(module: ProjectModule): number {
  return Math.round(NODE_BASE_WIDTH * importanceScale(module.importance));
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
 * Board fractions (0–1) that lay a block out left→right by dependency depth:
 * one column per layer, tasks stacked within it. Not a fancy graph layout —
 * it just makes the arrows read left-to-right. Used by the "Ordenar" reset.
 */
export function autoLayoutFractions(
  modules: ProjectModule[],
): Map<string, { fx: number; fy: number }> {
  const layers = layersOf(modules);
  const cols = Math.max(layers.length, 1);
  const out = new Map<string, { fx: number; fy: number }>();
  layers.forEach((layer, l) => {
    const rows = layer.length;
    const fx = cols === 1 ? 0.06 : (l / (cols - 1)) * 0.86 + 0.04;
    layer.forEach((mod, i) => {
      const fy = rows === 1 ? 0.14 : (i / (rows - 1)) * 0.74 + 0.1;
      out.set(mod.id, { fx, fy });
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
  // The task just dropped on the board — plays a one-shot spring "settle" in
  // place (no fly-in), then clears so the animation can replay on the next drop.
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);
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

  // --- measurement -------------------------------------------------------

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measureBoard = () =>
      setBoardSize({ w: container.clientWidth, h: container.clientHeight });
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
    return rect;
  };

  // --- free drop (positions) via the shared DndContext --------------------

  useDndMonitor({
    onDragStart: (event) => {
      const data = event.active.data.current;
      if (data?.type === "task" && inBlock.has(String(data.taskId))) {
        setLiftedId(String(data.taskId));
        setSelectedEdge(null);
      }
    },
    onDragMove: (event) => {
      if (liftedId) setDragDelta({ x: event.delta.x, y: event.delta.y });
    },
    onDragEnd: (event) => {
      const id = liftedId;
      setLiftedId(null);
      setDragDelta(null);
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
      setLiftedId(null);
      setDragDelta(null);
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
    >
      {/* Base dot grid — static; the card's own lift is the drag feedback. */}
      <div
        aria-hidden
        className="corkboard-dots pointer-events-none absolute inset-0"
      />

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
              justDropped={justDroppedId === mod.id}
              rejected={rejectedId === mod.id}
              flashing={flashId === mod.id}
              portDrag={portDrag}
              registerRef={(el) => {
                if (el) nodeRefs.current.set(mod.id, el);
                else nodeRefs.current.delete(mod.id);
              }}
              onOpen={() => {
                if (suppressOpen.current) return;
                onOpen(mod.id);
              }}
              onPortDown={(direction, e) => startPortDrag(mod.id, direction, e)}
              onPortMove={movePortDrag}
              onPortUp={endPortDrag}
            />
          );
        })}
    </div>
  );
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
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `node:${mod.id}`,
    data: { type: "task", taskId: mod.id },
    disabled: ghost,
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
        backgroundColor: ownerColor ? ownerColor.bg + "0F" : undefined,
        fontSize: 12 * scale,
        padding: `${8 * scale}px ${10 * scale}px`,
      }}
      className={cn(
        "group/node absolute rounded-lg border border-line border-l-[3px] bg-surface text-left shadow-card transition-[box-shadow,opacity,transform] duration-300 ease-[var(--ease-spring)]",
        ghost
          ? "cursor-pointer opacity-25 hover:opacity-60"
          : "cursor-grab touch-none active:cursor-grabbing",
        // The origin hides fully while its card travels (the overlay is the
        // visible one) — no faint "transparent task" left behind.
        lifted && "z-30 opacity-0",
        !lifted && isDragging && "z-30",
        justDropped && "animate-settle",
        rejected && "!border-danger",
        flashing && "node-flash",
        isValidTarget && !isSnapped && "ring-1 ring-accent/40",
        isSnapped && "z-20 scale-[1.03] shadow-raised ring-2 ring-accent",
        targeting && !isValidTarget && "opacity-40 saturate-50",
      )}
    >
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
}: {
  project: Project;
  module: ProjectModule;
}) {
  const scale = importanceScale(module.importance);
  const owner = project.members.find((m) => module.assigneeIds.includes(m.id));
  const ownerColor = owner ? colorForKey(owner.colorKey) : null;
  return (
    <div
      style={{
        width: nodeWidth(module),
        borderLeftColor: ownerColor?.bg ?? "var(--color-line-strong)",
        backgroundColor: ownerColor ? ownerColor.bg + "0F" : undefined,
        fontSize: 12 * scale,
        padding: `${8 * scale}px ${10 * scale}px`,
      }}
      className="animate-lift cursor-grabbing rounded-lg border border-line border-l-[3px] bg-surface shadow-pop"
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
