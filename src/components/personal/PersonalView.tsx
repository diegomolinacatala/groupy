"use client";

import { useState, type CSSProperties } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
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
import { Check, Lock, LockOpen, Map as MapIcon } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import {
  blockingMembers,
  buildProjectFlow,
  type ModuleFlow,
  type ProjectFlow,
} from "@/lib/data/flow";
import {
  importanceScale,
  type Project,
  type ProjectModule,
  type TeamMember,
} from "@/lib/data/types";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { DocTypeBadge } from "@/components/ui/DocTypeBadge";
import { InlineAddTask } from "@/components/ui/InlineAddTask";
import { colorForKey } from "@/lib/utils/colors";
import {
  daysBetweenISO,
  deadlineLabel,
  formatShort,
  todayISO,
} from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

function byOrder(a: ProjectModule, b: ProjectModule): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.createdAt.localeCompare(b.createdAt);
}

const firstName = (member: TeamMember): string =>
  member.name.trim().split(/\s+/)[0] || member.name;

/** "Alba", "Alba y Bruno", "Alba, Bruno y Carla". */
const nameList = (names: string[]): string =>
  names.length <= 1
    ? names[0] ?? ""
    : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;

/** Softened size-by-importance for list rows — the philosophy, whispered. */
const rowScale = (importance: number): number =>
  1 + (importanceScale(importance) - 1) * 0.5;

export function PersonalView() {
  const {
    project,
    currentMemberId,
    setCurrentMember,
    setModuleStatus,
    reorderModules,
    addModule,
  } = useProject();
  const { openModule, setView } = useDashboardUi();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const me = currentMemberId;
  const flow = buildProjectFlow(project);

  const mine = me
    ? project.modules
        .filter((m) => m.assigneeIds.includes(me) && m.status !== "done")
        .sort(byOrder)
        .map((m) => flow.byId.get(m.id))
        .filter((f): f is ModuleFlow => f !== undefined)
    : [];
  const available = mine
    .filter((f) => f.state === "available")
    .map((f) => f.module);
  const locked = mine.filter((f) => f.state === "locked");

  const activeModule = activeId
    ? available.find((m) => m.id === activeId) ?? null
    : null;

  const handleDragStart = (event: DragStartEvent) =>
    setActiveId(String(event.active.id));

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const draggedId = String(active.id);
    const overId = String(over.id);
    const subset = available.map((m) => m.id);
    const from = subset.indexOf(draggedId);
    const to = subset.indexOf(overId);
    if (from < 0 || to < 0) return;
    // Rebuild the FULL order so tasks outside this list keep their slots:
    // drop the dragged id and re-insert it next to its new sibling.
    const full = [...project.modules]
      .sort(byOrder)
      .map((m) => m.id)
      .filter((id) => id !== draggedId);
    const anchor = full.indexOf(overId);
    if (anchor < 0) return;
    full.splice(from < to ? anchor + 1 : anchor, 0, draggedId);
    reorderModules(full);
  };

  const advance = (mod: ProjectModule) =>
    setModuleStatus(mod.id, mod.status === "todo" ? "in_progress" : "done");

  const handleNewTask = (title: string) => {
    if (!me) return;
    addModule({ title, assigneeId: me });
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-5xl items-start gap-8">
        <div className="flex min-w-0 max-w-2xl flex-1 flex-col gap-6">
          <h2 className="type-display text-2xl">Personal</h2>

          {!me ? (
            <IdentityPicker
              members={project.members}
              onPick={setCurrentMember}
            />
          ) : (
            <DndContext
              // Stable id: dnd-kit's auto ids differ between server and client
              // (hydration mismatch on the cloud dashboard).
              id="personal-dnd"
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveId(null)}
            >
              <section className="flex flex-col gap-3">
                <SectionHeading label="Disponibles" count={available.length} />
                {available.length === 0 ? (
                  <EmptyLine text="Nada disponible." />
                ) : (
                  <SortableContext
                    items={available.map((m) => m.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex flex-col gap-2">
                      {available.map((mod) => (
                        <SortableAvailableCard
                          key={mod.id}
                          module={mod}
                          onOpen={() => openModule(mod.id)}
                          onAdvance={() => advance(mod)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <SectionHeading label="Bloqueadas" />
                {locked.length === 0 ? (
                  <EmptyLine text="Nada bloqueado." />
                ) : (
                  <div className="flex flex-col gap-2">
                    {locked.map((entry) => (
                      <LockedCard
                        key={entry.module.id}
                        entry={entry}
                        members={project.members}
                        me={me}
                        onOpen={() => openModule(entry.module.id)}
                      />
                    ))}
                  </div>
                )}
              </section>

              <DragOverlay dropAnimation={null}>
                {activeModule ? (
                  <div className="animate-pick cursor-grabbing">
                    <AvailableCardBody module={activeModule} overlay />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {me && (
          <PersonalRail
            project={project}
            flow={flow}
            me={me}
            onOpen={openModule}
            onNewTask={handleNewTask}
            onGoMap={() => setView("map")}
          />
        )}
      </div>
    </div>
  );
}

// --- Side rail: the critical numbers, at a glance ---------------------------

function PersonalRail({
  project,
  flow,
  me,
  onOpen,
  onNewTask,
  onGoMap,
}: {
  project: Project;
  flow: ProjectFlow;
  me: string;
  onOpen: (id: string) => void;
  onNewTask: (title: string) => void;
  onGoMap: () => void;
}) {
  const myTasks = project.modules.filter((m) => m.assigneeIds.includes(me));
  const myDone = myTasks.filter((m) => m.status === "done").length;

  // My pending tasks someone else is waiting on — the free-rider mirror.
  const holdingUp = myTasks
    .filter((m) => m.status !== "done")
    .map((m) => flow.byId.get(m.id))
    .filter((f): f is ModuleFlow => f !== undefined)
    .map((f) => ({
      module: f.module,
      waiters: project.members.filter(
        (member) =>
          member.id !== me && f.waitingMemberIds.includes(member.id),
      ),
    }))
    .filter((h) => h.waiters.length > 0);

  const nextDue = myTasks
    .filter((m) => m.status !== "done" && m.dueDate)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))[0];

  // Time already burned, as a fraction of the project window.
  const timeFraction = (() => {
    if (!project.startDate || !project.dueDate) return null;
    const total = daysBetweenISO(project.startDate, project.dueDate);
    if (total <= 0) return null;
    const gone = daysBetweenISO(project.startDate, todayISO());
    return Math.min(1, Math.max(0, gone / total));
  })();

  return (
    <aside className="sticky top-6 hidden w-72 shrink-0 flex-col gap-3 lg:flex">
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <p className="type-overline">Entrega</p>
        {project.dueDate ? (
          <>
            <p className="type-display mt-1.5 text-xl">
              {deadlineLabel(project.dueDate)}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {formatShort(project.dueDate)}
            </p>
            {timeFraction !== null && (
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-ink transition-[width] duration-500"
                  style={{ width: `${Math.round(timeFraction * 100)}%` }}
                />
              </div>
            )}
            {nextDue && (
              <button
                type="button"
                onClick={() => onOpen(nextDue.id)}
                className="mt-3 block w-full truncate text-left text-xs text-muted transition-colors hover:text-ink"
              >
                Tu siguiente: «{nextDue.title || "Sin título"}» ·{" "}
                {deadlineLabel(nextDue.dueDate)}
              </button>
            )}
          </>
        ) : (
          <p className="mt-1.5 text-sm text-muted">Sin fecha de entrega.</p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div className="flex items-baseline justify-between">
          <p className="type-overline">Tu avance</p>
          <span className="text-xs tabular-nums text-muted">
            {myDone}/{myTasks.length}
          </span>
        </div>
        {myTasks.length > 0 ? (
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.round((myDone / myTasks.length) * 100)}%`,
                backgroundColor: "var(--color-done)",
              }}
            />
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-muted">Sin tareas asignadas.</p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <p className="type-overline">Te esperan</p>
        {holdingUp.length === 0 ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
            <Check className="h-3.5 w-3.5 text-done" />
            Nadie espera tus tareas.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5">
            {holdingUp.map(({ module, waiters }) => (
              <button
                key={module.id}
                type="button"
                onClick={() => onOpen(module.id)}
                className="rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-2"
                style={{ marginInline: -8 }}
              >
                <span
                  className="font-medium"
                  style={{ color: colorForKey(waiters[0].colorKey).bg }}
                >
                  {nameList(waiters.map(firstName))}
                </span>{" "}
                <span className="text-ink-2">
                  {waiters.length === 1 ? "espera" : "esperan"} «
                  {module.title || "Sin título"}»
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <InlineAddTask
          onAdd={onNewTask}
          label="Nueva tarea para mí"
          placeholder="Nombre de la tarea…"
          triggerClassName="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
          inputClassName="w-full rounded-xl border border-accent bg-surface px-3 py-2 text-xs font-medium text-ink outline-none ring-2 ring-accent/25 placeholder:text-muted-2"
        />
        <button
          type="button"
          onClick={onGoMap}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-2 shadow-card transition-colors hover:border-line-strong hover:bg-surface-2"
        >
          <MapIcon className="h-3.5 w-3.5" />
          Ver el mapa
        </button>
      </div>
    </aside>
  );
}

// --- List pieces -------------------------------------------------------------

function SectionHeading({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="type-overline">{label}</h3>
      {count !== undefined && (
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2">
          {count}
        </span>
      )}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-xs text-muted">
      {text}
    </p>
  );
}

function IdentityPicker({
  members,
  onPick,
}: {
  members: TeamMember[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="type-overline">¿Quién eres?</p>
      <div className="flex flex-col gap-2">
        {members.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => onPick(member.id)}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left shadow-card transition-colors hover:border-line-strong hover:bg-surface-2"
          >
            <Avatar member={member} size="sm" />
            <span className="text-sm font-medium text-ink">{member.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AvailableCardBody({
  module,
  onAdvance,
  overlay,
}: {
  module: ProjectModule;
  onAdvance?: () => void;
  overlay?: boolean;
}) {
  const started = module.status === "in_progress";
  const scale = rowScale(module.importance);
  const style: CSSProperties = {
    fontSize: 14 * scale,
    paddingBlock: 8 * scale,
  };
  return (
    <div
      style={style}
      className={cn(
        "flex items-center gap-2.5 rounded-xl border border-line bg-surface pl-3.5 pr-2 transition-shadow",
        overlay ? "shadow-pop" : "shadow-card hover:border-line-strong",
      )}
    >
      <LockOpen className="h-3.5 w-3.5 shrink-0 text-muted" />
      <DocTypeBadge docType={module.docType} />
      <span className="min-w-0 flex-1 truncate font-medium text-ink">
        {module.title || "Sin título"}
      </span>
      {module.dueDate && (
        <span className="shrink-0 text-xs text-muted">
          {deadlineLabel(module.dueDate)}
        </span>
      )}
      <Button
        size="sm"
        variant={started ? "primary" : "secondary"}
        className="shrink-0"
        // Keep the button out of the drag gesture and the card's onClick.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onAdvance?.();
        }}
      >
        {started ? "Hecha" : "Empezar"}
      </Button>
    </div>
  );
}

function SortableAvailableCard({
  module,
  onOpen,
  onAdvance,
}: {
  module: ProjectModule;
  onOpen: () => void;
  onAdvance: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: module.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cn(
        "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
    >
      <AvailableCardBody module={module} onAdvance={onAdvance} />
    </div>
  );
}

function LockedCard({
  entry,
  members,
  me,
  onOpen,
}: {
  entry: ModuleFlow;
  members: TeamMember[];
  me: string;
  onOpen: () => void;
}) {
  const mod = entry.module;
  const scale = rowScale(mod.importance);
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ fontSize: 14 * scale, paddingBlock: 9 * scale }}
      className="rounded-xl border border-dashed border-line-strong bg-surface-2/40 pl-3.5 pr-3 text-left transition-colors hover:border-line-strong hover:bg-surface-2/70"
    >
      <span className="flex items-center gap-2.5">
        <Lock className="h-3.5 w-3.5 shrink-0 text-muted" />
        <DocTypeBadge docType={mod.docType} />
        <span className="min-w-0 flex-1 truncate font-medium text-ink-2">
          {mod.title || "Sin título"}
        </span>
      </span>
      <LockedNotice entry={entry} members={members} me={me} />
    </button>
  );
}

function LockedNotice({
  entry,
  members,
  me,
}: {
  entry: ModuleFlow;
  members: TeamMember[];
  me: string;
}) {
  if (entry.blockers.length > 0) {
    const people = blockingMembers(entry, members, me);
    if (people.length > 0) {
      const names = people.map(firstName);
      const text =
        names.length === 1
          ? `${names[0]} está bloqueando`
          : names.length === 2
            ? `${names[0]} y ${names[1]} están bloqueando`
            : `${names[0]} y ${names.length - 1} más están bloqueando`;
      return (
        <span
          className="mt-1 block pl-6 text-xs font-medium"
          style={{ color: colorForKey(people[0].colorKey).bg }}
        >
          {text}
        </span>
      );
    }
    // The pending prerequisite is mine (or unassigned) — name the task.
    return (
      <span className="mt-1 block truncate pl-6 text-xs text-muted">
        Espera a «{entry.blockers[0].title || "Sin título"}»
      </span>
    );
  }
  if (entry.waitingForBlock) {
    return (
      <span className="mt-1 block truncate pl-6 text-xs text-muted">
        Espera al bloque «{entry.waitingForBlock.name}»
      </span>
    );
  }
  return null;
}
