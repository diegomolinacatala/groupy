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
import {
  ArrowRight,
  Check,
  Columns3,
  Lock,
  LockOpen,
  Map as MapIcon,
} from "lucide-react";
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

// Principal — your home in the project. Greets you by name, puts THE next
// thing to do front and center (the "Ahora" hero card), queues the rest
// below it (drag to reorder — the top of the queue is the hero), keeps
// blocked work visible but quiet, and mirrors the critical numbers in a
// slim right rail. Without an identity (local demo) it asks once, one click.

function byOrder(a: ProjectModule, b: ProjectModule): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.createdAt.localeCompare(b.createdAt);
}

const firstName = (name: string): string =>
  name.trim().split(/\s+/)[0] || name;

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

  const me = project.members.find((m) => m.id === currentMemberId) ?? null;

  if (!me) {
    return <IdentityGate members={project.members} onPick={setCurrentMember} />;
  }

  const flow = buildProjectFlow(project);
  const mine = project.modules
    .filter((m) => m.assigneeIds.includes(me.id))
    .sort(byOrder);
  const pendingFlows = mine
    .filter((m) => m.status !== "done")
    .map((m) => flow.byId.get(m.id))
    .filter((f): f is ModuleFlow => f !== undefined);
  const available = pendingFlows
    .filter((f) => f.state === "available")
    .map((f) => f.module);
  const locked = pendingFlows.filter((f) => f.state === "locked");
  const doneCount = mine.length - pendingFlows.length;
  const allDone = mine.length > 0 && pendingFlows.length === 0;

  const hero = available[0] ?? null;
  const queue = available.slice(1);

  const activeModule = activeId
    ? available.find((m) => m.id === activeId) ?? null
    : null;

  const summary =
    mine.length === 0
      ? "Aún no tienes tareas asignadas."
      : allDone
        ? `Tus ${mine.length} tareas están hechas. Buen trabajo.`
        : [
            `${available.length} ${available.length === 1 ? "disponible" : "disponibles"}`,
            locked.length > 0
              ? `${locked.length} bloqueada${locked.length === 1 ? "" : "s"}`
              : null,
            `${doneCount} de ${mine.length} hechas`,
          ]
            .filter(Boolean)
            .join(" · ");

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

  const handleNewTask = (title: string) =>
    addModule({ title, assigneeId: me.id });

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto w-full max-w-5xl">
        <header>
          <p className="type-overline">Principal</p>
          <h2 className="type-display mt-1 text-3xl text-ink">
            Hola, {firstName(me.name)}
          </h2>
          <p className="mt-1.5 text-sm text-muted">{summary}</p>
        </header>

        <div className="mt-7 flex items-start gap-8">
          <div className="flex min-w-0 max-w-2xl flex-1 flex-col gap-7">
            {mine.length === 0 ? (
              <EmptyAssigned
                onGoOrganization={() => setView("organization")}
                onNewTask={handleNewTask}
              />
            ) : allDone ? (
              <AllDone count={mine.length} />
            ) : (
              <DndContext
                // Stable id: dnd-kit's auto ids differ between server and
                // client (hydration mismatch on the cloud dashboard).
                id="personal-dnd"
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveId(null)}
              >
                <section className="flex flex-col gap-3">
                  <SectionHeading label="Ahora" />
                  {hero === null ? (
                    <EmptyLine text="Nada disponible ahora mismo — tus tareas esperan a otras." />
                  ) : (
                    <SortableContext
                      items={available.map((m) => m.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="flex flex-col gap-2.5">
                        <SortableTask
                          key={hero.id}
                          module={hero}
                          hero
                          me={me}
                          onOpen={() => openModule(hero.id)}
                          onAdvance={() => advance(hero)}
                        />
                        {queue.length > 0 && (
                          <>
                            <SectionHeading
                              label="A continuación"
                              className="mt-3"
                            />
                            {queue.map((mod) => (
                              <SortableTask
                                key={mod.id}
                                module={mod}
                                me={me}
                                onOpen={() => openModule(mod.id)}
                                onAdvance={() => advance(mod)}
                              />
                            ))}
                          </>
                        )}
                      </div>
                    </SortableContext>
                  )}
                </section>

                {locked.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <SectionHeading label="Bloqueadas" count={locked.length} />
                    <div className="flex flex-col gap-2">
                      {locked.map((entry) => (
                        <LockedCard
                          key={entry.module.id}
                          entry={entry}
                          members={project.members}
                          me={me.id}
                          onOpen={() => openModule(entry.module.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                <DragOverlay dropAnimation={null}>
                  {activeModule ? (
                    <div className="animate-pick cursor-grabbing">
                      <TaskRowBody module={activeModule} overlay />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>

          <PersonalRail
            project={project}
            flow={flow}
            me={me}
            onOpen={openModule}
            onNewTask={handleNewTask}
            onGoMap={() => setView("map")}
            onGoOrganization={() => setView("organization")}
          />
        </div>
      </div>
    </div>
  );
}

// --- Identity gate (local demo, first visit) --------------------------------

function IdentityGate({
  members,
  onPick,
}: {
  members: TeamMember[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex justify-center p-6 pt-[9vh]">
      <div className="animate-rise w-full max-w-md">
        <p className="type-overline mb-3">Principal</p>
        <h2 className="type-display text-3xl leading-[1.1] text-ink">
          ¿Quién eres?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Toca tu nombre para ver tu parte del proyecto. Podrás cambiar de
          persona desde arriba a la derecha.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => onPick(member.id)}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left shadow-card transition-colors hover:border-line-strong hover:bg-surface-2"
            >
              <Avatar member={member} size="md" />
              <span className="flex-1 text-[15px] font-medium text-ink">
                {member.name}
              </span>
              <span className="text-xs font-medium text-accent">Soy yo</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Main column pieces ------------------------------------------------------

function SectionHeading({
  label,
  count,
  className,
}: {
  label: string;
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
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

function EmptyAssigned({
  onGoOrganization,
  onNewTask,
}: {
  onGoOrganization: () => void;
  onNewTask: (title: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-line-strong bg-surface/50 px-6 py-8 text-center">
      <h3 className="type-display text-xl text-ink">Sin tareas todavía</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
        Repartid el trabajo arrastrando en Organización, o crea aquí una tarea
        solo para ti.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" onClick={onGoOrganization}>
          <Columns3 className="h-4 w-4" />
          Repartir el trabajo
        </Button>
        <InlineAddTask
          onAdd={onNewTask}
          label="Nueva tarea para mí"
          triggerClassName="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong px-4 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent"
          inputClassName="h-10 w-56 rounded-xl border border-accent bg-surface px-3 text-sm font-medium text-ink outline-none ring-2 ring-accent/25 placeholder:text-muted-2"
        />
      </div>
    </section>
  );
}

function AllDone({ count }: { count: number }) {
  return (
    <section className="rounded-2xl border border-line bg-surface px-6 py-8 text-center shadow-card">
      <span
        className="mx-auto grid h-11 w-11 place-items-center rounded-full"
        style={{
          backgroundColor: "var(--color-done-soft)",
          color: "var(--color-done)",
        }}
      >
        <Check className="h-5 w-5" strokeWidth={3} />
      </span>
      <h3 className="type-display mt-3 text-xl text-ink">Todo hecho</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
        Tus {count} tareas están terminadas. Echa un vistazo al mapa por si
        puedes desatascar a alguien.
      </p>
    </section>
  );
}

/** Sortable wrapper: the same drag/click shell for the hero and the queue. */
function SortableTask({
  module,
  me,
  hero = false,
  onOpen,
  onAdvance,
}: {
  module: ProjectModule;
  me: TeamMember;
  hero?: boolean;
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
      {hero ? (
        <NowCardBody module={module} me={me} onAdvance={onAdvance} />
      ) : (
        <TaskRowBody module={module} onAdvance={onAdvance} />
      )}
    </div>
  );
}

/** The hero: your next task, big and unmissable, with THE button. */
function NowCardBody({
  module,
  me,
  onAdvance,
}: {
  module: ProjectModule;
  me: TeamMember;
  onAdvance: () => void;
}) {
  const started = module.status === "in_progress";
  const color = colorForKey(me.colorKey);
  const stepsDone = module.checklist.filter((c) => c.done).length;

  return (
    <div
      style={{ borderLeftColor: color.bg, backgroundColor: color.bg + "0D" }}
      className="rounded-2xl border border-line border-l-4 p-4 shadow-card transition-shadow hover:shadow-raised md:p-5"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <DocTypeBadge docType={module.docType} className="mt-1" />
            <h4 className="min-w-0 text-lg font-semibold leading-snug text-ink md:text-xl">
              {module.title || "Sin título"}
            </h4>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span
              className={cn(started && "font-medium")}
              style={started ? { color: "var(--color-progress)" } : undefined}
            >
              {started ? "En curso" : "Lista para empezar"}
            </span>
            {module.dueDate && <span>{deadlineLabel(module.dueDate)}</span>}
            {module.checklist.length > 0 && (
              <span className="tabular-nums">
                {stepsDone}/{module.checklist.length} pasos
              </span>
            )}
          </div>
        </div>
        <Button
          variant="primary"
          className="shrink-0"
          // Keep the button out of the drag gesture and the card's onClick.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onAdvance();
          }}
        >
          {started ? (
            <>
              Marcar hecha
              <Check className="h-4 w-4" />
            </>
          ) : (
            <>
              Empezar
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/** Compact queue row (also the drag overlay body). */
function TaskRowBody({
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
      {onAdvance && (
        <Button
          size="sm"
          variant={started ? "primary" : "secondary"}
          className="shrink-0"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onAdvance();
          }}
        >
          {started ? "Hecha" : "Empezar"}
        </Button>
      )}
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
      const names = people.map((p) => firstName(p.name));
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

// --- Side rail: the critical numbers, at a glance ---------------------------

function PersonalRail({
  project,
  flow,
  me,
  onOpen,
  onNewTask,
  onGoMap,
  onGoOrganization,
}: {
  project: Project;
  flow: ProjectFlow;
  me: TeamMember;
  onOpen: (id: string) => void;
  onNewTask: (title: string) => void;
  onGoMap: () => void;
  onGoOrganization: () => void;
}) {
  const myTasks = project.modules.filter((m) => m.assigneeIds.includes(me.id));
  const myDone = myTasks.filter((m) => m.status === "done").length;
  const percent =
    myTasks.length === 0 ? 0 : Math.round((myDone / myTasks.length) * 100);

  // My pending tasks someone else is waiting on — the free-rider mirror.
  const holdingUp = myTasks
    .filter((m) => m.status !== "done")
    .map((m) => flow.byId.get(m.id))
    .filter((f): f is ModuleFlow => f !== undefined)
    .map((f) => ({
      module: f.module,
      waiters: project.members.filter(
        (member) =>
          member.id !== me.id && f.waitingMemberIds.includes(member.id),
      ),
    }))
    .filter((h) => h.waiters.length > 0);

  const unassignedCount = project.modules.filter(
    (m) => m.assigneeIds.length === 0,
  ).length;

  // Share of the project window already spent — the pressure gauge.
  const timeFraction = (() => {
    if (!project.startDate || !project.dueDate) return null;
    const total = daysBetweenISO(project.startDate, project.dueDate);
    if (total <= 0) return null;
    const gone = daysBetweenISO(project.startDate, todayISO());
    return Math.min(1, Math.max(0, gone / total));
  })();

  return (
    <aside className="sticky top-6 hidden w-72 shrink-0 flex-col gap-3 lg:flex">
      {project.dueDate && (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div className="flex items-baseline justify-between gap-2">
            <p className="type-overline">Entrega</p>
            <span className="text-xs text-muted">
              {formatShort(project.dueDate)}
            </span>
          </div>
          <p className="type-display mt-1 text-2xl text-ink">
            {deadlineLabel(project.dueDate)}
          </p>
          {timeFraction !== null && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-ink transition-[width] duration-500"
                style={{ width: `${Math.round(timeFraction * 100)}%` }}
              />
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div className="flex items-baseline justify-between">
          <p className="type-overline">Tu avance</p>
          <span className="text-xs tabular-nums text-muted">
            {myDone}/{myTasks.length}
          </span>
        </div>
        {myTasks.length > 0 ? (
          <>
            <p className="type-display mt-1 text-2xl text-ink">{percent}%</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${percent}%`,
                  backgroundColor: "var(--color-done)",
                }}
              />
            </div>
          </>
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
                  {nameList(waiters.map((w) => firstName(w.name)))}
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
        {unassignedCount > 0 && (
          <button
            type="button"
            onClick={onGoOrganization}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-2 shadow-card transition-colors hover:border-line-strong hover:bg-surface-2"
          >
            <Columns3 className="h-3.5 w-3.5" />
            Repartir {unassignedCount} sin asignar
          </button>
        )}
      </div>
    </aside>
  );
}
