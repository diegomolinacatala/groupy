"use client";

import { useState } from "react";
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
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import type { ProjectModule, TeamMember } from "@/lib/data/types";
import { Avatar } from "@/components/ui/Avatar";
import { colorForKey } from "@/lib/utils/colors";
import { cn } from "@/lib/utils/cn";
import {
  SortableTaskChip,
  TaskChipStatic,
  type ChipDragData,
} from "./TaskChip";

// Reparto del trabajo: a strip of unassigned tasks on top, one column per
// member below. Dragging a chip into a column assigns the task to that
// person (single-owner semantics); dragging back to the strip clears it.
// Chip size = importance, edited with the corner resize handle.

const STRIP = "strip";

function byOrder(a: ProjectModule, b: ProjectModule): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.createdAt.localeCompare(b.createdAt);
}

export function OrganizationView() {
  const {
    project,
    assignToMember,
    setImportance,
    reorderModules,
    addModule,
  } = useProject();
  const { openModule } = useDashboardUi();
  const [active, setActive] = useState<ChipDragData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const unassigned = project.modules
    .filter((m) => m.assigneeIds.length === 0)
    .sort(byOrder);
  const tasksOf = (member: TeamMember) =>
    project.modules
      .filter((m) => m.assigneeIds.includes(member.id))
      .sort(byOrder);

  const activeModule = active
    ? project.modules.find((m) => m.id === active.taskId) ?? null
    : null;

  const handleAdd = (assigneeId?: string) => {
    const id = addModule(assigneeId ? { assigneeId } : undefined);
    openModule(id);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as ChipDragData | undefined;
    if (data) setActive(data);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActive(null);
    const { active: dragged, over } = event;
    const data = dragged.data.current as ChipDragData | undefined;
    if (!data || !over) return;
    const overData = over.data.current as
      | (Partial<ChipDragData> & { containerId: string })
      | undefined;
    if (!overData?.containerId) return;

    if (overData.containerId !== data.containerId) {
      assignToMember(
        data.taskId,
        overData.containerId === STRIP ? null : overData.containerId,
      );
      return;
    }

    // Same container: reorder. Rebuild the FULL order so tasks outside this
    // list keep their slots relative to each other.
    const overTaskId = overData.taskId;
    if (!overTaskId || overTaskId === data.taskId) return;
    const full = [...project.modules]
      .sort(byOrder)
      .map((m) => m.id)
      .filter((id) => id !== data.taskId);
    const anchor = full.indexOf(overTaskId);
    if (anchor < 0) return;
    const before =
      [...project.modules].sort(byOrder).findIndex((m) => m.id === data.taskId) <=
      [...project.modules].sort(byOrder).findIndex((m) => m.id === overTaskId);
    full.splice(before ? anchor + 1 : anchor, 0, data.taskId);
    reorderModules(full);
  };

  return (
    <DndContext
      // Stable id: dnd-kit's auto ids differ between server and client
      // (hydration mismatch on the cloud dashboard).
      id="org-dnd"
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="flex h-full flex-col gap-5 p-4 md:p-6">
        <h2 className="type-display text-2xl">Organización</h2>

        {/* Strip: unassigned tasks, name only, sized by importance */}
        <StripZone
          modules={unassigned}
          onOpen={openModule}
          onCommitImportance={setImportance}
          onAdd={() => handleAdd()}
        />

        {/* One column per member */}
        <div
          className="grid flex-1 items-start gap-3"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          }}
        >
          {project.members.map((member) => (
            <MemberColumn
              key={member.id}
              member={member}
              modules={tasksOf(member)}
              onOpen={openModule}
              onCommitImportance={setImportance}
              onAdd={() => handleAdd(member.id)}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeModule && active ? (
          <TaskChipStatic
            module={activeModule}
            variant={active.containerId === STRIP ? "strip" : "column"}
            color={
              active.containerId === STRIP
                ? undefined
                : colorForKey(
                    project.members.find((m) => m.id === active.containerId)
                      ?.colorKey ?? "",
                  )
            }
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function StripZone({
  modules,
  onOpen,
  onCommitImportance,
  onAdd,
}: {
  modules: ProjectModule[];
  onOpen: (id: string) => void;
  onCommitImportance: (id: string, value: number) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `container:${STRIP}`,
    data: { containerId: STRIP },
  });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "rounded-2xl border border-line bg-surface p-3 shadow-card transition-shadow md:p-4",
        isOver && "ring-2 ring-accent/30",
      )}
    >
      <p className="type-overline mb-2.5">Sin asignar</p>
      <SortableContext
        items={modules.map((m) => `${STRIP}::${m.id}`)}
        strategy={rectSortingStrategy}
      >
        <div className="flex flex-wrap items-center gap-2">
          {modules.map((mod) => (
            <SortableTaskChip
              key={mod.id}
              module={mod}
              containerId={STRIP}
              variant="strip"
              onOpen={() => onOpen(mod.id)}
              onCommitImportance={(v) => onCommitImportance(mod.id, v)}
            />
          ))}
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            Tarea
          </button>
        </div>
      </SortableContext>
    </section>
  );
}

function MemberColumn({
  member,
  modules,
  onOpen,
  onCommitImportance,
  onAdd,
}: {
  member: TeamMember;
  modules: ProjectModule[];
  onOpen: (id: string) => void;
  onCommitImportance: (id: string, value: number) => void;
  onAdd: () => void;
}) {
  const color = colorForKey(member.colorKey);
  const { setNodeRef, isOver } = useDroppable({
    id: `container:${member.id}`,
    data: { containerId: member.id },
  });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex min-h-44 flex-col rounded-2xl border p-2.5 transition-shadow",
        isOver && "ring-2 ring-accent/30",
      )}
      style={{
        backgroundColor: color.bg + "0D",
        borderColor: color.bg + "26",
      }}
    >
      <header className="mb-2.5 flex items-center gap-2 px-1">
        <Avatar member={member} size="sm" />
        <span className="min-w-0 truncate text-sm font-medium text-ink">
          {member.name}
        </span>
        <span className="ml-auto text-xs tabular-nums text-muted">
          {modules.length > 0 ? modules.length : ""}
        </span>
      </header>

      <SortableContext
        items={modules.map((m) => `${member.id}::${m.id}`)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-1 flex-col gap-2">
          {modules.map((mod) => (
            <SortableTaskChip
              key={mod.id}
              module={mod}
              containerId={member.id}
              variant="column"
              color={color}
              onOpen={() => onOpen(mod.id)}
              onCommitImportance={(v) => onCommitImportance(mod.id, v)}
            />
          ))}
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Añadir tarea a ${member.name}`}
            className="mt-auto grid h-8 place-items-center rounded-lg border border-dashed border-transparent text-muted-2 transition-colors hover:border-line-strong hover:text-ink"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </SortableContext>
    </section>
  );
}
