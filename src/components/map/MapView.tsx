"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, GripVertical, Plus, Trash2 } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import { buildProjectFlow, orderedBlocks } from "@/lib/data/flow";
import type { BlockFlow, ProjectFlow } from "@/lib/data/flow";
import {
  BLOCK_MODE_META,
  type Project,
  type ProjectModule,
} from "@/lib/data/types";
import { InlineText } from "@/components/ui/InlineText";
import { cn } from "@/lib/utils/cn";
import { BlockGraph, TaskNodeStatic } from "./BlockGraph";

// One flowchart per BLOQUE. Blocks are stacked containers (grip to reorder,
// inline rename, mode toggle); the order between "En orden" blocks is drawn
// as a connector between containers — never as a padlock. Task nodes drag
// between containers to change block; ports drag to create dependencies.

export function MapView() {
  const {
    project,
    currentMemberId,
    toggleDependency,
    setModuleBlock,
    addBlock,
    updateBlock,
    deleteBlock,
    reorderBlocks,
    addModule,
  } = useProject();
  const { openModule } = useDashboardUi();
  const [activeTask, setActiveTask] = useState<ProjectModule | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const flow = useMemo(() => buildProjectFlow(project), [project]);
  const blocks = orderedBlocks(project);

  // Each person edits only the deps of THEIR OWN tasks; without a session
  // identity (local demo, nobody picked) everything is editable.
  const canEditDeps = (target: ProjectModule) =>
    !currentMemberId || target.assigneeIds.includes(currentMemberId);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "task") {
      setActiveTask(
        project.modules.find((m) => m.id === data.taskId) ?? null,
      );
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    const data = active.data.current;

    if (data?.type === "block") {
      if (active.id === over.id) return;
      const ids = blocks.map((b) => b.id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from < 0 || to < 0) return;
      ids.splice(to, 0, ...ids.splice(from, 1));
      reorderBlocks(ids);
      return;
    }

    if (data?.type === "task") {
      const overData = over.data.current;
      // Dropping on the graph zone or on the block container both count.
      const blockId =
        overData?.type === "zone"
          ? (overData.blockId as string)
          : blocks.some((b) => b.id === String(over.id))
            ? String(over.id)
            : null;
      const mod = project.modules.find((m) => m.id === data.taskId);
      if (blockId && mod && mod.blockId !== blockId) {
        setModuleBlock(mod.id, blockId);
      }
    }
  };

  return (
    <DndContext
      // Stable id: dnd-kit's auto ids differ between server and client
      // (hydration mismatch on the cloud dashboard).
      id="map-dnd"
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      <div className="flex h-full flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="type-display text-2xl">Mapa</h2>
          <button
            type="button"
            onClick={() => addBlock()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            Bloque
          </button>
        </div>

        <SortableContext
          items={blocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col">
            {flow.blocks.map((blockFlow, index) => (
              <BlockSection
                key={blockFlow.block.id}
                project={project}
                flow={flow}
                blockFlow={blockFlow}
                isFirst={index === 0}
                canDelete={blocks.length > 1}
                canEditDeps={canEditDeps}
                onRename={(name) => updateBlock(blockFlow.block.id, { name })}
                onToggleMode={() =>
                  updateBlock(blockFlow.block.id, {
                    mode:
                      blockFlow.block.mode === "sequence"
                        ? "independent"
                        : "sequence",
                  })
                }
                onDelete={() => {
                  if (window.confirm("¿Eliminar el bloque? Sus tareas pasan al primero.")) {
                    deleteBlock(blockFlow.block.id);
                  }
                }}
                onToggleDependency={toggleDependency}
                onOpen={openModule}
                onAddTask={() => {
                  const id = addModule({ blockId: blockFlow.block.id });
                  openModule(id);
                }}
              />
            ))}
          </div>
        </SortableContext>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <TaskNodeStatic project={project} module={activeTask} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function BlockSection({
  project,
  flow,
  blockFlow,
  isFirst,
  canDelete,
  canEditDeps,
  onRename,
  onToggleMode,
  onDelete,
  onToggleDependency,
  onOpen,
  onAddTask,
}: {
  project: Project;
  flow: ProjectFlow;
  blockFlow: BlockFlow;
  isFirst: boolean;
  canDelete: boolean;
  canEditDeps: (target: ProjectModule) => boolean;
  onRename: (name: string) => void;
  onToggleMode: () => void;
  onDelete: () => void;
  onToggleDependency: (targetId: string, depId: string) => void;
  onOpen: (id: string) => void;
  onAddTask: () => void;
}) {
  const { block, state, modules, doneCount } = blockFlow;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id, data: { type: "block" } });

  const { setNodeRef: setZoneRef, isOver } = useDroppable({
    id: `zone:${block.id}`,
    data: { type: "zone", blockId: block.id },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "z-10 opacity-80")}
    >
      {/* Sequence connector: the visual language for block order. */}
      {!isFirst && block.mode === "sequence" && (
        <div
          aria-hidden
          className="flex flex-col items-center py-1 text-muted-2"
        >
          <span className="h-2.5 w-px bg-line-strong" />
          <ArrowDown className="h-3.5 w-3.5" />
        </div>
      )}
      {!isFirst && block.mode !== "sequence" && <div className="h-4" />}

      <section
        className={cn(
          "group/block rounded-2xl border bg-surface shadow-card transition-all",
          state === "waiting"
            ? "border-dashed border-line-strong opacity-70"
            : "border-line",
          isOver && "ring-2 ring-accent/30",
        )}
      >
        <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-line px-3 py-2.5 md:px-4">
          <button
            type="button"
            aria-label={`Mover el bloque ${block.name}`}
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none rounded p-0.5 text-muted-2 transition-colors hover:text-ink active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>

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

          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Eliminar el bloque ${block.name}`}
              className="ml-auto rounded p-1 text-muted-2 opacity-0 transition-all hover:bg-danger-soft hover:text-danger group-hover/block:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </header>

        <div ref={setZoneRef} className="p-3 md:p-4">
          <BlockGraph
            project={project}
            flow={flow}
            blockFlow={blockFlow}
            canEditDeps={canEditDeps}
            onToggleDependency={onToggleDependency}
            onOpen={onOpen}
            onAddTask={onAddTask}
          />
        </div>
      </section>
    </div>
  );
}
