"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useDraggable } from "@dnd-kit/core";
import { Check, Lock, LockOpen, Plus, X } from "lucide-react";
import type { BlockFlow, ModuleFlow, ProjectFlow } from "@/lib/data/flow";
import { wouldCreateCycle } from "@/lib/data/flow";
import type { Project, ProjectModule } from "@/lib/data/types";
import { DocTypeBadge } from "@/components/ui/DocTypeBadge";
import { colorForKey } from "@/lib/utils/colors";
import { cn } from "@/lib/utils/cn";

// The flowchart INSIDE one block: task nodes in dependency layers, task→task
// edges as measured SVG curves. Dragging from a node's out-port onto another
// node creates a dependency; clicking an edge exposes its remove button.
// Only task→task edges live here — block ordering is drawn by the parent.

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Edge {
  sourceId: string;
  targetId: string;
  done: boolean;
}

interface PortDrag {
  sourceId: string;
  x: number;
  y: number;
}

interface BlockGraphProps {
  project: Project;
  flow: ProjectFlow;
  blockFlow: BlockFlow;
  /** Ownership rule: whether this session may edit `target.dependsOn`. */
  canEditDeps: (target: ProjectModule) => boolean;
  onToggleDependency: (targetId: string, depId: string) => void;
  onOpen: (id: string) => void;
  onAddTask: () => void;
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

export function BlockGraph({
  project,
  flow,
  blockFlow,
  canEditDeps,
  onToggleDependency,
  onOpen,
  onAddTask,
}: BlockGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [rects, setRects] = useState<Map<string, Rect>>(new Map());
  const [portDrag, setPortDrag] = useState<PortDrag | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [rejectedId, setRejectedId] = useState<string | null>(null);
  const rejectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const modules = blockFlow.modules;
  const inBlock = new Set(modules.map((m) => m.id));
  const layers = layersOf(modules);

  // Signature of everything that moves nodes around, so measurement re-runs
  // exactly when the layout can change.
  const layoutKey = modules
    .map((m) => `${m.id}:${m.dependsOn.join(",")}:${m.title.length}`)
    .join("|");

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
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
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [layoutKey]);

  const edges: Edge[] = [];
  for (const mod of modules) {
    for (const depId of mod.dependsOn) {
      if (!inBlock.has(depId)) continue;
      const dep = project.modules.find((m) => m.id === depId);
      if (dep) {
        edges.push({ sourceId: depId, targetId: mod.id, done: dep.status === "done" });
      }
    }
  }

  const flashReject = (id: string) => {
    if (rejectTimer.current) clearTimeout(rejectTimer.current);
    setRejectedId(id);
    rejectTimer.current = setTimeout(() => setRejectedId(null), 600);
  };

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const base = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - base.left, y: e.clientY - base.top };
  };

  const startPortDrag = (sourceId: string, e: ReactPointerEvent) => {
    // The port must never start a node drag or a click-to-open.
    e.stopPropagation();
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already released — the drag just won't track.
    }
    setSelectedEdge(null);
    setPortDrag({ sourceId, ...localPoint(e) });
  };

  const movePortDrag = (e: ReactPointerEvent) => {
    setPortDrag((prev) => (prev ? { ...prev, ...localPoint(e) } : prev));
  };

  const endPortDrag = (sourceId: string, e: ReactPointerEvent) => {
    setPortDrag(null);
    const point = localPoint(e);
    let targetId: string | null = null;
    for (const [id, rect] of rects) {
      if (
        point.x >= rect.x &&
        point.x <= rect.x + rect.w &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.h
      ) {
        targetId = id;
        break;
      }
    }
    if (!targetId || targetId === sourceId) return;
    const target = project.modules.find((m) => m.id === targetId);
    if (!target) return;
    if (target.dependsOn.includes(sourceId)) return; // already linked
    if (!canEditDeps(target) || wouldCreateCycle(project, targetId, sourceId)) {
      flashReject(targetId);
      return;
    }
    onToggleDependency(targetId, sourceId);
  };

  const removeSelectedEdge = () => {
    if (!selectedEdge) return;
    const target = project.modules.find((m) => m.id === selectedEdge.targetId);
    if (!target) return;
    if (!canEditDeps(target)) {
      flashReject(selectedEdge.targetId);
      setSelectedEdge(null);
      return;
    }
    onToggleDependency(selectedEdge.targetId, selectedEdge.sourceId);
    setSelectedEdge(null);
  };

  const edgePath = (edge: Edge): string | null => {
    const s = rects.get(edge.sourceId);
    const t = rects.get(edge.targetId);
    if (!s || !t) return null;
    const x1 = s.x + s.w;
    const y1 = s.y + s.h / 2;
    const x2 = t.x;
    const y2 = t.y + t.h / 2;
    const bend = Math.max(24, Math.abs(x2 - x1) * 0.4);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  };

  const edgeMidpoint = (edge: Edge) => {
    const s = rects.get(edge.sourceId);
    const t = rects.get(edge.targetId);
    if (!s || !t) return null;
    return {
      x: (s.x + s.w + t.x) / 2,
      y: (s.y + s.h / 2 + (t.y + t.h / 2)) / 2,
    };
  };

  const tempPath = (() => {
    if (!portDrag) return null;
    const s = rects.get(portDrag.sourceId);
    if (!s) return null;
    const x1 = s.x + s.w;
    const y1 = s.y + s.h / 2;
    const bend = Math.max(24, Math.abs(portDrag.x - x1) * 0.4);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${portDrag.x - bend} ${portDrag.y}, ${portDrag.x} ${portDrag.y}`;
  })();

  const selectedMid = selectedEdge ? edgeMidpoint(selectedEdge) : null;

  if (modules.length === 0) {
    return (
      <button
        type="button"
        onClick={onAddTask}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-6 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <Plus className="h-3.5 w-3.5" />
        Tarea
      </button>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div
        ref={containerRef}
        className="relative w-max min-w-full"
        onClick={() => setSelectedEdge(null)}
      >
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
          </defs>
          {edges.map((edge) => {
            const d = edgePath(edge);
            if (!d) return null;
            const isSelected =
              selectedEdge?.sourceId === edge.sourceId &&
              selectedEdge?.targetId === edge.targetId;
            return (
              <g key={`${edge.sourceId}->${edge.targetId}`}>
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
                  markerEnd={`url(#arrow-${blockFlow.block.id})`}
                  stroke={
                    isSelected
                      ? "var(--color-accent)"
                      : "var(--color-line-strong)"
                  }
                  strokeWidth={isSelected ? 2 : 1.5}
                  opacity={edge.done && !isSelected ? 0.45 : 1}
                />
              </g>
            );
          })}
          {tempPath && (
            <path
              d={tempPath}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          )}
        </svg>

        {/* Remove button for the selected edge */}
        {selectedEdge && selectedMid && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeSelectedEdge();
            }}
            aria-label="Quitar dependencia"
            className="absolute z-10 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-muted shadow-raised transition-colors hover:text-danger"
            style={{ left: selectedMid.x, top: selectedMid.y }}
          >
            <X className="h-3 w-3" />
          </button>
        )}

        {/* Nodes in dependency layers */}
        <div className="flex items-start gap-10 p-1">
          {layers.map((layer, index) => (
            <div key={index} className="flex flex-col gap-3">
              {layer.map((mod) => {
                const entry = flow.byId.get(mod.id);
                if (!entry) return null;
                return (
                  <TaskNode
                    key={mod.id}
                    project={project}
                    entry={entry}
                    inBlock={inBlock}
                    rejected={rejectedId === mod.id}
                    registerRef={(el) => {
                      if (el) nodeRefs.current.set(mod.id, el);
                      else nodeRefs.current.delete(mod.id);
                    }}
                    onOpen={() => onOpen(mod.id)}
                    onPortDown={(e) => startPortDrag(mod.id, e)}
                    onPortMove={movePortDrag}
                    onPortUp={(e) => endPortDrag(mod.id, e)}
                  />
                );
              })}
            </div>
          ))}
          <button
            type="button"
            onClick={onAddTask}
            aria-label="Añadir tarea al bloque"
            className="mt-1 grid h-9 w-9 shrink-0 place-items-center self-start rounded-lg border border-dashed border-line-strong text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
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

function TaskNode({
  project,
  entry,
  inBlock,
  rejected,
  registerRef,
  onOpen,
  onPortDown,
  onPortMove,
  onPortUp,
}: {
  project: Project;
  entry: ModuleFlow;
  inBlock: Set<string>;
  rejected: boolean;
  registerRef: (el: HTMLElement | null) => void;
  onOpen: () => void;
  onPortDown: (e: ReactPointerEvent) => void;
  onPortMove: (e: ReactPointerEvent) => void;
  onPortUp: (e: ReactPointerEvent) => void;
}) {
  const mod = entry.module;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `node:${mod.id}`,
    data: { type: "task", taskId: mod.id },
  });

  const owner = project.members.find((m) => mod.assigneeIds.includes(m.id));
  const ownerColor = owner ? colorForKey(owner.colorKey) : null;
  const waiting = entry.waitingMemberIds[0]
    ? project.members.find((m) => m.id === entry.waitingMemberIds[0])
    : null;
  const waitingColor = waiting ? colorForKey(waiting.colorKey).bg : null;

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
        onOpen();
      }}
      style={{
        borderLeftColor: ownerColor?.bg ?? "var(--color-line-strong)",
        backgroundColor: ownerColor ? ownerColor.bg + "0F" : undefined,
      }}
      className={cn(
        "group/node relative w-44 cursor-grab touch-none rounded-lg border border-line border-l-[3px] bg-surface px-2.5 py-2 text-left shadow-card transition-colors active:cursor-grabbing",
        rejected && "!border-danger",
        isDragging && "opacity-30",
      )}
    >
      <span className="flex items-center gap-1.5">
        <DocTypeBadge docType={mod.docType} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-xs font-medium",
            mod.status === "done" ? "text-muted line-through" : "text-ink",
          )}
        >
          {mod.title || "Sin título"}
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

      {/* Ports: left = in (visual), right = out (drag to link) */}
      <span
        aria-hidden
        className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-line-strong bg-surface opacity-0 transition-opacity group-hover/node:opacity-100"
      />
      <span
        onPointerDown={onPortDown}
        onPointerMove={onPortMove}
        onPointerUp={onPortUp}
        aria-hidden
        className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 cursor-crosshair touch-none rounded-full border border-line-strong bg-surface opacity-0 transition-colors hover:border-accent hover:bg-accent-soft group-hover/node:opacity-100"
      />
    </div>
  );
}

/** Overlay visual while a node is dragged between blocks. */
export function TaskNodeStatic({
  project,
  module,
}: {
  project: Project;
  module: ProjectModule;
}) {
  const owner = project.members.find((m) => module.assigneeIds.includes(m.id));
  const ownerColor = owner ? colorForKey(owner.colorKey) : null;
  return (
    <div
      style={{
        borderLeftColor: ownerColor?.bg ?? "var(--color-line-strong)",
        backgroundColor: ownerColor ? ownerColor.bg + "0F" : undefined,
      }}
      className="w-44 cursor-grabbing rounded-lg border border-line border-l-[3px] bg-surface px-2.5 py-2 shadow-pop"
    >
      <span className="flex items-center gap-1.5">
        <DocTypeBadge docType={module.docType} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
          {module.title || "Sin título"}
        </span>
      </span>
    </div>
  );
}
