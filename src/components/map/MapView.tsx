"use client";

import { Fragment, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRight, Check, Plus, Trash2, Wand2 } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import { buildProjectFlow, orderedBlocks, type BlockFlow } from "@/lib/data/flow";
import { BLOCK_MODE_META, type ProjectModule, type TeamMember } from "@/lib/data/types";
import { InlineText } from "@/components/ui/InlineText";
import { Segmented } from "@/components/ui/Segmented";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils/cn";
import { Corkboard, CorkNodeStatic, autoLayoutFractions } from "./Corkboard";

// The map: a centered rail of DIAMONDS — one per BLOQUE — and exactly ONE
// block open below as a free-drop corkboard (no stacked scrolling). Click a
// diamond to switch block; drag a diamond to reorder the chain; drop a task
// ON a diamond to move it between blocks. The "Mis tareas" scope fades
// everyone else's tasks; edits (deps, positions) are open to the whole team.

type MapScope = "team" | "mine";

export function MapView() {
  const {
    project,
    currentMemberId,
    setCurrentMember,
    toggleDependency,
    setModuleBlock,
    setModulePosition,
    addBlock,
    updateBlock,
    deleteBlock,
    reorderBlocks,
    addModule,
  } = useProject();
  const { openModule } = useDashboardUi();
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [scope, setScope] = useState<MapScope>("team");
  const [activeTask, setActiveTask] = useState<ProjectModule | null>(null);
  const [blockDragging, setBlockDragging] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const flow = buildProjectFlow(project);
  const blocks = orderedBlocks(project);
  // Rail order ≠ raw order: the "En orden" chain reads first (with its →
  // connectors) and every "Independiente" block jumps to the OTHER side of
  // the chain, past a divider — it is not a link of that list.
  const railFlows = [
    ...flow.blocks.filter((b) => b.block.mode === "sequence"),
    ...flow.blocks.filter((b) => b.block.mode === "independent"),
  ];
  // Derived, never stale: a deleted selection falls back to the first block.
  const activeFlow =
    flow.blocks.find((b) => b.block.id === selectedBlockId) ??
    flow.blocks[0] ??
    null;

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "task") {
      setActiveTask(project.modules.find((m) => m.id === data.taskId) ?? null);
    }
    if (data?.type === "block") setBlockDragging(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    setBlockDragging(false);
    const { active, over } = event;
    if (!over) return;
    const data = active.data.current;

    if (data?.type === "block") {
      if (active.id === over.id) return;
      // Reorder against what the user SEES (the rail), then persist that
      // order globally — independents simply stay grouped at the end.
      const ids = railFlows.map((b) => b.block.id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from < 0 || to < 0) return;
      ids.splice(to, 0, ...ids.splice(from, 1));
      reorderBlocks(ids);
      return;
    }

    // Task dropped on a diamond → change block. Free repositioning inside
    // the board is committed by the Corkboard's own drag monitor.
    if (data?.type === "task" && over.data.current?.type === "block") {
      const mod = project.modules.find((m) => m.id === data.taskId);
      const blockId = String(over.id);
      if (mod && mod.blockId !== blockId) setModuleBlock(mod.id, blockId);
    }
  };

  const handleAddBlock = () => {
    setSelectedBlockId(addBlock());
  };

  const handleAddTask = () => {
    if (!activeFlow) return;
    const id = addModule({ blockId: activeFlow.block.id });
    openModule(id);
  };

  // "Ordenar": reset the open block's tasks to a left→right depth layout.
  const handleAutoLayout = () => {
    if (!activeFlow) return;
    for (const [id, { fx, fy }] of autoLayoutFractions(activeFlow.modules)) {
      setModulePosition(id, fx, fy);
    }
  };

  const needsIdentity = scope === "mine" && !currentMemberId;

  return (
    <DndContext
      // Stable id: dnd-kit's auto ids differ between server and client
      // (hydration mismatch on the cloud dashboard).
      id="map-dnd"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveTask(null);
        setBlockDragging(false);
      }}
    >
      <div className="flex h-full flex-col gap-3 p-4 md:p-6">
        {/* Title · diamond rail (centered) · scope */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <h2 className="type-display text-2xl">Mapa</h2>

          <div className="order-3 w-full md:order-none md:w-auto md:justify-self-center">
            <DiamondRail
              flow={railFlows}
              activeBlockId={activeFlow?.block.id ?? null}
              taskDragging={activeTask !== null}
              blockDragging={blockDragging}
              onSelect={setSelectedBlockId}
              onAddBlock={handleAddBlock}
            />
          </div>

          <div className="md:justify-self-end">
            <Segmented
              size="sm"
              options={[
                { value: "team", label: "Equipo" },
                { value: "mine", label: "Mis tareas" },
              ]}
              value={scope}
              onChange={(value) => setScope(value)}
            />
          </div>
        </div>

        {activeFlow && (
          <BlockBar
            blockFlow={activeFlow}
            canDelete={blocks.length > 1}
            onRename={(name) => updateBlock(activeFlow.block.id, { name })}
            onToggleMode={() =>
              updateBlock(activeFlow.block.id, {
                mode:
                  activeFlow.block.mode === "sequence"
                    ? "independent"
                    : "sequence",
              })
            }
            onDelete={() => {
              if (
                window.confirm(
                  "¿Eliminar el bloque? Sus tareas pasan al primero.",
                )
              ) {
                deleteBlock(activeFlow.block.id);
              }
            }}
            onAddTask={handleAddTask}
            onAutoLayout={handleAutoLayout}
          />
        )}

        {/* Exactly one block open — the corkboard fills what's left. */}
        <div
          className={cn(
            "relative min-h-[340px] flex-1 overflow-hidden rounded-2xl border bg-surface shadow-card transition-colors",
            activeFlow?.state === "waiting"
              ? "border-dashed border-line-strong"
              : "border-line",
          )}
        >
          {needsIdentity ? (
            <IdentityPrompt
              members={project.members}
              onPick={setCurrentMember}
            />
          ) : (
            activeFlow && (
              <Corkboard
                key={activeFlow.block.id}
                project={project}
                flow={flow}
                blockFlow={activeFlow}
                ghostMemberId={scope === "mine" ? currentMemberId : null}
                onToggleDependency={toggleDependency}
                onSetPosition={setModulePosition}
                onOpen={openModule}
                onAddTask={handleAddTask}
              />
            )
          )}
        </div>
      </div>

      {/* The traveling card lives in a portal so the board never clips it. */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <CorkNodeStatic project={project} module={activeTask} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// --- Diamond rail -----------------------------------------------------------

function DiamondRail({
  flow,
  activeBlockId,
  taskDragging,
  blockDragging,
  onSelect,
  onAddBlock,
}: {
  /** Rail order: the sequence chain first, independents after the divider. */
  flow: BlockFlow[];
  activeBlockId: string | null;
  taskDragging: boolean;
  /** Diamonds only TRANSFORM while sorting — static connectors between them
   *  would point at nothing, so they hide for the duration of the drag. */
  blockDragging: boolean;
  onSelect: (id: string) => void;
  onAddBlock: () => void;
}) {
  const connectorFor = (blockFlow: BlockFlow, index: number) => {
    if (index === 0) return null;
    const prev = flow[index - 1];
    // → only INSIDE the sequence chain; the chain→independents boundary is a
    // divider (an independent block is never a link of the list).
    if (
      blockFlow.block.mode === "sequence" &&
      prev.block.mode === "sequence"
    ) {
      return (
        <ArrowRight
          aria-hidden
          className={cn(
            "h-3 w-3 shrink-0 text-muted-2 transition-opacity",
            blockDragging && "opacity-0",
          )}
        />
      );
    }
    if (
      blockFlow.block.mode === "independent" &&
      prev.block.mode === "sequence"
    ) {
      return (
        <span
          aria-hidden
          className={cn(
            "mx-1.5 h-6 w-px shrink-0 rounded-full bg-line-strong/70 transition-opacity",
            blockDragging && "opacity-0",
          )}
        />
      );
    }
    return <span aria-hidden className="w-2 shrink-0" />;
  };

  return (
    <div className="flex items-center justify-center gap-1 overflow-x-auto px-1 py-1">
      <SortableContext
        items={flow.map((b) => b.block.id)}
        strategy={horizontalListSortingStrategy}
      >
        {flow.map((blockFlow, index) => (
          <Fragment key={blockFlow.block.id}>
            {connectorFor(blockFlow, index)}
            <Diamond
              blockFlow={blockFlow}
              active={blockFlow.block.id === activeBlockId}
              taskDragging={taskDragging}
              onSelect={() => onSelect(blockFlow.block.id)}
            />
          </Fragment>
        ))}
      </SortableContext>

      <button
        type="button"
        onClick={onAddBlock}
        aria-label="Añadir bloque"
        title="Añadir bloque"
        className="group relative ml-2 grid h-11 w-11 shrink-0 place-items-center"
      >
        <span
          aria-hidden
          className="absolute h-7 w-7 rotate-45 rounded-[8px] border border-dashed border-line-strong bg-transparent transition-all duration-200 group-hover:border-accent group-hover:bg-accent-soft/40"
        />
        <Plus className="relative h-3.5 w-3.5 text-muted transition-colors group-hover:text-accent" />
      </button>
    </div>
  );
}

function Diamond({
  blockFlow,
  active,
  taskDragging,
  onSelect,
}: {
  blockFlow: BlockFlow;
  active: boolean;
  taskDragging: boolean;
  onSelect: () => void;
}) {
  const { block, state, modules, doneCount } = blockFlow;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: block.id, data: { type: "block" } });

  const complete = state === "complete";
  const highlight = taskDragging && isOver;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex w-[4.25rem] shrink-0 flex-col items-center",
        isDragging && "z-10 opacity-60",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={onSelect}
        aria-label={`Abrir el bloque ${block.name || "sin nombre"}`}
        title={block.name || "Sin nombre"}
        className="group relative grid h-11 w-11 touch-none place-items-center outline-none"
      >
        <span
          aria-hidden
          className={cn(
            "absolute h-8 w-8 rotate-45 rounded-[9px] border transition-all duration-200",
            active
              ? "border-ink bg-ink shadow-raised"
              : complete
                ? "border-done/40 bg-done-soft group-hover:border-done"
                : "border-line-strong bg-surface group-hover:border-ink/50",
            state === "waiting" && !active && "border-dashed opacity-60",
            highlight && "scale-110 border-accent ring-2 ring-accent/30",
            !highlight && active && "scale-110",
            !highlight && !active && "group-hover:scale-105",
          )}
        />
        <span
          className={cn(
            "relative text-[10px] font-semibold tabular-nums leading-none",
            active ? "text-canvas" : complete ? "text-done" : "text-muted",
          )}
        >
          {complete && !active ? (
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          ) : (
            `${doneCount}/${modules.length}`
          )}
        </span>
      </button>
      <span
        className={cn(
          "mt-1 w-full truncate text-center text-[11px] leading-tight",
          active ? "font-medium text-ink" : "text-muted",
        )}
      >
        {block.name || "Sin nombre"}
      </span>
    </div>
  );
}

// --- Active block bar ---------------------------------------------------------

function BlockBar({
  blockFlow,
  canDelete,
  onRename,
  onToggleMode,
  onDelete,
  onAddTask,
  onAutoLayout,
}: {
  blockFlow: BlockFlow;
  canDelete: boolean;
  onRename: (name: string) => void;
  onToggleMode: () => void;
  onDelete: () => void;
  onAddTask: () => void;
  onAutoLayout: () => void;
}) {
  const { block, state, modules, doneCount } = blockFlow;
  return (
    <div className="group/bar flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-xl border border-line bg-surface px-3 py-2 shadow-card">
      <InlineText
        value={block.name}
        onCommit={onRename}
        placeholder="Nombre del bloque"
        ariaLabel="Nombre del bloque"
        className="type-display -ml-1 text-lg"
      />

      <span className="text-xs tabular-nums text-muted">
        {modules.length > 0 ? `${doneCount}/${modules.length}` : ""}
      </span>

      <button
        type="button"
        onClick={onToggleMode}
        title="Cambiar el orden del bloque"
        className={cn(
          "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
          block.mode === "sequence"
            ? "border-ink/20 bg-surface-2 text-ink"
            : "border-line text-muted hover:border-line-strong hover:text-ink",
        )}
      >
        {BLOCK_MODE_META[block.mode].label}
      </button>

      {state === "waiting" && blockFlow.waitsFor && (
        <span className="text-[11px] text-muted">
          Espera a «{blockFlow.waitsFor.name}»
        </span>
      )}
      {state === "complete" && (
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
          style={{
            backgroundColor: "var(--color-done-soft)",
            color: "var(--color-done)",
          }}
        >
          Completo
        </span>
      )}

      <div className="ml-auto flex items-center gap-1">
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Eliminar el bloque ${block.name}`}
            className="rounded p-1 text-muted-2 opacity-0 transition-all hover:bg-danger-soft hover:text-danger group-hover/bar:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        {modules.length > 1 && (
          <button
            type="button"
            onClick={onAutoLayout}
            title="Ordenar las tareas de izquierda a derecha"
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Ordenar
          </button>
        )}
        <button
          type="button"
          onClick={onAddTask}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-line-strong px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          Tarea
        </button>
      </div>
    </div>
  );
}

// --- "Mis tareas" without a local identity ------------------------------------

function IdentityPrompt({
  members,
  onPick,
}: {
  members: TeamMember[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
      <p className="type-overline">¿Quién eres?</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {members.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => onPick(member.id)}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-card transition-colors hover:border-line-strong hover:bg-surface-2"
          >
            <Avatar member={member} size="sm" />
            <span className="text-sm font-medium text-ink">{member.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
