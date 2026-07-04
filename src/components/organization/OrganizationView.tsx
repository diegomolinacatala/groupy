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
import { RotateCcw, Scale } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import {
  clampImportance,
  type ProjectModule,
  type TeamMember,
} from "@/lib/data/types";
import { Avatar } from "@/components/ui/Avatar";
import { InlineAddTask } from "@/components/ui/InlineAddTask";
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

/** Fisher–Yates — a fresh order every call (the "aleatorio" in the deal). */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Deals `tasks` across members so everyone lands with a similar WORK VOLUME —
 * the sum of task importance, i.e. sizes AND count together. Largest tasks
 * first, each to whoever carries the least so far (the classic greedy that
 * balances near-perfectly), seeded with each member's `baseLoad` (work already
 * on their plate) and random tie-breaks so repeat clicks give a fresh, fair
 * deal. Returns taskId → memberId.
 */
function distributeByWeight(
  tasks: ProjectModule[],
  memberIds: string[],
  baseLoad: Map<string, number>,
): Map<string, string> {
  const assignment = new Map<string, string>();
  if (memberIds.length === 0) return assignment;
  const load = new Map(memberIds.map((id) => [id, baseLoad.get(id) ?? 0]));
  const ordered = shuffle(tasks).sort(
    (a, b) => clampImportance(b.importance) - clampImportance(a.importance),
  );
  for (const task of ordered) {
    let best = memberIds[0];
    let bestLoad = Infinity;
    for (const id of shuffle(memberIds)) {
      const current = load.get(id) ?? 0;
      if (current < bestLoad) {
        bestLoad = current;
        best = id;
      }
    }
    assignment.set(task.id, best);
    load.set(best, (load.get(best) ?? 0) + clampImportance(task.importance));
  }
  return assignment;
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

  const handleAdd = (title: string, assigneeId?: string) => {
    addModule({ title, ...(assigneeId ? { assigneeId } : {}) });
  };

  // "Reiniciar reparto": every task goes back to the strip so the team can
  // re-deal who does what from scratch.
  const assignedCount = project.modules.filter(
    (m) => m.assigneeIds.length > 0,
  ).length;
  const handleResetAssignments = () => {
    if (assignedCount === 0) return;
    if (!window.confirm("¿Devolver todas las tareas a «Sin asignar»?")) return;
    for (const mod of project.modules) {
      if (mod.assigneeIds.length > 0) assignToMember(mod.id, null);
    }
  };

  // "Repartir por peso": deal the unassigned tasks out so every member ends
  // with a similar work volume (weighted by importance), on top of whatever
  // they already carry. Reset first for a full re-deal from scratch.
  const handleDistributeByWeight = () => {
    if (unassigned.length === 0 || project.members.length === 0) return;
    const baseLoad = new Map(
      project.members.map((member) => [
        member.id,
        project.modules
          .filter((mod) => mod.assigneeIds.includes(member.id))
          .reduce((sum, mod) => sum + clampImportance(mod.importance), 0),
      ]),
    );
    const deal = distributeByWeight(
      unassigned,
      project.members.map((member) => member.id),
      baseLoad,
    );
    for (const [taskId, memberId] of deal) assignToMember(taskId, memberId);
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
          canReset={assignedCount > 0}
          onReset={handleResetAssignments}
          canDistribute={unassigned.length > 0 && project.members.length > 0}
          onDistribute={handleDistributeByWeight}
          onOpen={openModule}
          onCommitImportance={setImportance}
          onAdd={(title) => handleAdd(title)}
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
              onAdd={(title) => handleAdd(title, member.id)}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeModule && active ? (
          <TaskChipStatic
            module={activeModule}
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
  canReset,
  onReset,
  canDistribute,
  onDistribute,
  onOpen,
  onCommitImportance,
  onAdd,
}: {
  modules: ProjectModule[];
  canReset: boolean;
  onReset: () => void;
  canDistribute: boolean;
  onDistribute: () => void;
  onOpen: (id: string) => void;
  onCommitImportance: (id: string, value: number) => void;
  onAdd: (title: string) => void;
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
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="type-overline">Sin asignar</p>
        <div className="flex items-center gap-1">
          {canDistribute && (
            <button
              type="button"
              onClick={onDistribute}
              title="Repartir las tareas sin asignar por peso, para que todos tengan un volumen de trabajo similar"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <Scale className="h-3.5 w-3.5" />
              Repartir por peso
            </button>
          )}
          {canReset && (
            <button
              type="button"
              onClick={onReset}
              title="Devolver todas las tareas a «Sin asignar»"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reiniciar reparto
            </button>
          )}
        </div>
      </div>
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
              onOpen={() => onOpen(mod.id)}
              onCommitImportance={(v) => onCommitImportance(mod.id, v)}
            />
          ))}
          <InlineAddTask
            onAdd={onAdd}
            label="Tarea"
            triggerClassName="inline-flex items-center gap-1 rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
            inputClassName="w-44 rounded-lg border border-accent bg-surface px-3 py-1.5 text-xs font-medium text-ink outline-none ring-2 ring-accent/25 placeholder:text-muted-2"
          />
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
  onAdd: (title: string) => void;
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
              color={color}
              onOpen={() => onOpen(mod.id)}
              onCommitImportance={(v) => onCommitImportance(mod.id, v)}
            />
          ))}
          <InlineAddTask
            onAdd={onAdd}
            ariaLabel={`Añadir tarea a ${member.name}`}
            triggerClassName="mt-auto grid h-8 place-items-center rounded-lg border border-dashed border-transparent text-muted-2 transition-colors hover:border-line-strong hover:text-ink"
            inputClassName="mt-auto w-full rounded-lg border border-accent bg-surface px-2.5 py-1.5 text-xs font-medium text-ink outline-none ring-2 ring-accent/25 placeholder:text-muted-2"
          />
        </div>
      </SortableContext>
    </section>
  );
}
