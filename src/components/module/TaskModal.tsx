"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Lock,
  LockOpen,
  Plus,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import {
  buildProjectFlow,
  orderedBlocks,
  wouldCreateCycle,
} from "@/lib/data/flow";
import {
  DOC_TYPES,
  DOC_TYPE_META,
  IMPORTANCE_MAX,
  importanceScale,
  type ModuleStatus,
  type Project,
  type ProjectModule,
} from "@/lib/data/types";
import { InlineText } from "@/components/ui/InlineText";
import { Segmented } from "@/components/ui/Segmented";
import { DateField } from "@/components/ui/DateField";
import { Field } from "@/components/ui/Field";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { AssigneePicker } from "@/components/ui/AssigneePicker";
import { Popover } from "@/components/ui/Popover";
import { DocTypeBadge } from "@/components/ui/DocTypeBadge";
import { colorForKey } from "@/lib/utils/colors";
import { deadlineLabel, formatShort } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

// The task view, everywhere: clicking any task in any view opens this popup.
// The task itself sits in the middle as a big card; what it DEPENDS ON hangs
// to its left, what it BLOCKS to its right (click a chip to travel the
// graph), and the remaining options live below.

const STATUS_OPTIONS: { value: ModuleStatus; label: string }[] = [
  { value: "todo", label: "Pendiente" },
  { value: "in_progress", label: "En curso" },
  { value: "done", label: "Hecha" },
];

const pickerChip = (active: boolean) =>
  cn(
    "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
    active
      ? "border-ink bg-ink text-canvas"
      : "border-line bg-surface text-ink-2 hover:border-line-strong",
  );

/** Stable −2.7°…+2.7° per id — the "slightly untidy pile" in the pickers. */
function jitterDeg(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 7) - 3) * 0.9;
}

export function TaskModal() {
  const {
    project,
    updateModule,
    deleteModule,
    toggleAssignee,
    toggleDependency,
    setModuleBlock,
    setImportance,
    addChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
  } = useProject();
  const { editingModuleId, openModule, closeModule } = useDashboardUi();
  const [checklistDraft, setChecklistDraft] = useState("");

  const activeModule =
    project.modules.find((m) => m.id === editingModuleId) ?? null;
  const open = Boolean(activeModule);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModule();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, closeModule]);

  const flowEntry = activeModule
    ? buildProjectFlow(project).byId.get(activeModule.id) ?? null
    : null;
  const isLocked = flowEntry?.state === "locked";
  const blocks = orderedBlocks(project);

  const handleDelete = () => {
    if (!activeModule) return;
    if (window.confirm("¿Eliminar esta tarea?")) {
      deleteModule(activeModule.id);
      closeModule();
    }
  };

  const handleAddChecklist = () => {
    if (!activeModule) return;
    const text = checklistDraft.trim();
    if (!text) return;
    addChecklistItem(activeModule.id, text);
    setChecklistDraft("");
  };

  // Left column: prerequisites of this task. Right column: tasks waiting on it.
  const dependencies = activeModule
    ? activeModule.dependsOn
        .map((id) => project.modules.find((m) => m.id === id))
        .filter((m): m is ProjectModule => Boolean(m))
    : [];
  const dependents = flowEntry?.unlocks ?? [];

  const dependencyCandidates = activeModule
    ? project.modules.filter(
        (m) =>
          m.id !== activeModule.id &&
          !activeModule.dependsOn.includes(m.id) &&
          !wouldCreateCycle(project, activeModule.id, m.id),
      )
    : [];
  const dependentCandidates = activeModule
    ? project.modules.filter(
        (m) =>
          m.id !== activeModule.id &&
          !m.dependsOn.includes(activeModule.id) &&
          !wouldCreateCycle(project, m.id, activeModule.id),
      )
    : [];

  const checklistDone = activeModule
    ? activeModule.checklist.filter((c) => c.done).length
    : 0;

  return (
    <AnimatePresence>
      {activeModule && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 md:p-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={closeModule}
            className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", damping: 30, stiffness: 380 }}
            className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-canvas shadow-pop"
          >
            <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-3">
              <span className="type-overline">Tarea</span>
              <div className="flex items-center gap-1">
                <IconButton
                  label="Eliminar tarea"
                  tone="danger"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
                <IconButton label="Cerrar" onClick={closeModule}>
                  <X className="h-5 w-5" />
                </IconButton>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8">
              {/* Depende de ← [ LA TAREA ] → Bloquea a. The task itself is
                  the protagonist: the center column dominates the row. */}
              <div className="grid gap-x-5 gap-y-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)_minmax(0,1fr)] md:items-center">
                <div className="order-first md:order-none md:col-start-2">
                  <TaskCard project={project} module={activeModule} />
                </div>

                <div className="md:col-start-1 md:row-start-1">
                  <FlowColumn
                    project={project}
                    side="left"
                    title="Depende de"
                    empty="No depende de nada."
                    modules={dependencies}
                    candidates={dependencyCandidates}
                    addLabel="Añadir dependencia"
                    onNavigate={openModule}
                    onRemove={(id) => toggleDependency(activeModule.id, id)}
                    onAdd={(id) => toggleDependency(activeModule.id, id)}
                  />
                </div>

                <div className="md:col-start-3 md:row-start-1">
                  <FlowColumn
                    project={project}
                    side="right"
                    title="Bloquea a"
                    empty="No bloquea a ninguna."
                    modules={dependents}
                    candidates={dependentCandidates}
                    addLabel="Añadir bloqueo"
                    onNavigate={openModule}
                    onRemove={(id) => toggleDependency(id, activeModule.id)}
                    onAdd={(id) => toggleDependency(id, activeModule.id)}
                  />
                </div>
              </div>

              {isLocked && flowEntry && (
                <div
                  className="mx-auto mt-4 flex w-fit items-start gap-2 rounded-lg px-3 py-2 text-xs"
                  style={{
                    backgroundColor: "var(--color-progress-soft)",
                    color: "var(--color-progress)",
                  }}
                >
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {flowEntry.blockers.length > 0
                      ? `Espera a ${flowEntry.blockers
                          .map((b) => `«${b.title || "Sin título"}»`)
                          .join(", ")}`
                      : flowEntry.waitingForBlock
                        ? `Espera al bloque «${flowEntry.waitingForBlock.name}»`
                        : "Bloqueada"}
                  </span>
                </div>
              )}

              {/* Everything else lives below the graph. */}
              <div className="mt-7 border-t border-line pt-6">
                <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                  <Field label="Estado">
                    <Segmented
                      options={STATUS_OPTIONS.map((option) => ({
                        ...option,
                        // The padlock: a locked task can't move forward until
                        // its prerequisites are done (going back is fine).
                        disabled:
                          isLocked &&
                          option.value !== "todo" &&
                          option.value !== activeModule.status,
                        disabledReason: "Bloqueada",
                      }))}
                      value={activeModule.status}
                      onChange={(status) =>
                        updateModule(activeModule.id, { status })
                      }
                      size="sm"
                    />
                  </Field>

                  <Field label="Fecha">
                    <DateField
                      value={activeModule.dueDate}
                      onChange={(dueDate) =>
                        updateModule(activeModule.id, { dueDate })
                      }
                      ariaLabel="Fecha límite de la tarea"
                      className="w-full"
                    />
                  </Field>

                  <Field label="Bloque">
                    <div className="flex flex-wrap gap-1.5">
                      {blocks.map((block) => (
                        <button
                          key={block.id}
                          type="button"
                          onClick={() =>
                            setModuleBlock(activeModule.id, block.id)
                          }
                          className={pickerChip(
                            activeModule.blockId === block.id,
                          )}
                        >
                          {block.name || "Sin nombre"}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="Tipo">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          updateModule(activeModule.id, { docType: null })
                        }
                        className={pickerChip(activeModule.docType === null)}
                      >
                        Sin tipo
                      </button>
                      {DOC_TYPES.map((docType) => (
                        <button
                          key={docType}
                          type="button"
                          title={DOC_TYPE_META[docType].label}
                          onClick={() =>
                            updateModule(activeModule.id, { docType })
                          }
                          className={cn(
                            pickerChip(activeModule.docType === docType),
                            "font-mono",
                          )}
                        >
                          {DOC_TYPE_META[docType].badge}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="Importancia">
                    <div className="flex items-end gap-1 pt-1">
                      {Array.from({ length: IMPORTANCE_MAX }, (_, i) => {
                        const value = i + 1;
                        const active = value <= activeModule.importance;
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-label={`Importancia ${value}`}
                            onClick={() =>
                              setImportance(activeModule.id, value)
                            }
                            style={{ height: 8 + value * 1.8 }}
                            className={cn(
                              "w-4 rounded-sm border transition-colors",
                              active
                                ? "border-ink bg-ink"
                                : "border-line bg-surface-2 hover:border-line-strong",
                            )}
                          />
                        );
                      })}
                    </div>
                  </Field>

                  <Field label="Responsables">
                    <div className="flex flex-wrap items-center gap-2">
                      {project.members
                        .filter((m) =>
                          activeModule.assigneeIds.includes(m.id),
                        )
                        .map((member) => (
                          <span
                            key={member.id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-1 pr-2"
                          >
                            <Avatar member={member} size="xs" />
                            <span className="text-xs font-medium text-ink-2">
                              {member.name}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                toggleAssignee(activeModule.id, member.id)
                              }
                              aria-label={`Quitar a ${member.name}`}
                              className="text-muted transition-colors hover:text-danger"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ))}
                      <AssigneePicker
                        members={project.members}
                        selectedIds={activeModule.assigneeIds}
                        onToggle={(memberId) =>
                          toggleAssignee(activeModule.id, memberId)
                        }
                        trigger={({ toggle }) => (
                          <button
                            type="button"
                            onClick={toggle}
                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Asignar
                          </button>
                        )}
                      />
                    </div>
                  </Field>
                </div>

                <div className="mt-5 flex flex-col gap-5">
                  <Field label="Descripción">
                    <InlineText
                      value={activeModule.description}
                      onCommit={(description) =>
                        updateModule(activeModule.id, { description })
                      }
                      placeholder="Notas, enlaces…"
                      multiline
                      ariaLabel="Descripción de la tarea"
                      className="-ml-1.5 min-h-16 rounded-lg bg-surface-2/50 text-sm text-ink-2"
                    />
                  </Field>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted">
                        Checklist
                      </span>
                      {activeModule.checklist.length > 0 && (
                        <span className="text-xs text-muted">
                          {checklistDone}/{activeModule.checklist.length}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      {activeModule.checklist.map((item) => (
                        <div
                          key={item.id}
                          className="group flex items-center gap-2"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              updateChecklistItem(activeModule.id, item.id, {
                                done: !item.done,
                              })
                            }
                            aria-label={
                              item.done ? "Marcar pendiente" : "Marcar hecha"
                            }
                            className={cn(
                              "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
                              item.done
                                ? "border-done bg-done text-white"
                                : "border-line-strong hover:border-accent",
                            )}
                          >
                            {item.done && (
                              <svg
                                viewBox="0 0 12 12"
                                className="h-3 w-3"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path
                                  d="M2.5 6.5 5 9l4.5-5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                          <InlineText
                            value={item.text}
                            onCommit={(text) =>
                              updateChecklistItem(activeModule.id, item.id, {
                                text,
                              })
                            }
                            ariaLabel="Elemento de checklist"
                            className={cn(
                              "flex-1 text-sm",
                              item.done && "text-muted line-through",
                            )}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              deleteChecklistItem(activeModule.id, item.id)
                            }
                            aria-label="Quitar elemento"
                            className="text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={checklistDraft}
                        onChange={(e) => setChecklistDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddChecklist();
                          }
                        }}
                        placeholder="Añadir elemento…"
                        className="h-9 flex-1 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none transition-colors placeholder:text-muted-2 focus:border-accent"
                      />
                      <IconButton
                        label="Añadir elemento"
                        onClick={handleAddChecklist}
                      >
                        <Plus className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** The task itself, center stage — width follows importance (the philosophy). */
function TaskCard({
  project,
  module,
}: {
  project: Project;
  module: ProjectModule;
}) {
  const { updateModule } = useProject();
  const scale = importanceScale(module.importance);
  const owner = project.members.find((m) => module.assigneeIds.includes(m.id));
  const ownerColor = owner ? colorForKey(owner.colorKey) : null;
  const assignees = project.members.filter((m) =>
    module.assigneeIds.includes(m.id),
  );
  const done = module.status === "done";

  return (
    <div
      style={{
        width: `min(100%, ${Math.round(430 * scale)}px)`,
        borderLeftColor: ownerColor?.bg ?? "var(--color-line-strong)",
        backgroundColor: ownerColor ? ownerColor.bg + "0F" : undefined,
      }}
      className="mx-auto rounded-2xl border border-line border-l-[5px] bg-surface p-5 shadow-pop md:p-6"
    >
      <div className="flex items-start gap-2.5">
        <DocTypeBadge docType={module.docType} className="mt-1.5" />
        <InlineText
          value={module.title}
          onCommit={(title) => updateModule(module.id, { title })}
          placeholder="Título de la tarea"
          ariaLabel="Título de la tarea"
          className={cn(
            "-ml-1 min-w-0 flex-1 text-xl font-semibold leading-snug md:text-2xl",
            done && "text-muted line-through",
          )}
        />
        {done ? (
          <Check className="mt-1.5 h-5 w-5 shrink-0 text-done" strokeWidth={3} />
        ) : (
          <LockOpen className="mt-1.5 h-5 w-5 shrink-0 text-muted" />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted">
        {module.dueDate && (
          <span title={formatShort(module.dueDate)}>
            {deadlineLabel(module.dueDate)}
          </span>
        )}
        {module.checklist.length > 0 && (
          <span className="tabular-nums">
            {module.checklist.filter((c) => c.done).length}/
            {module.checklist.length} pasos
          </span>
        )}
        {assignees.length > 0 && (
          <span className="ml-auto">
            <AvatarStack members={assignees} size="xs" />
          </span>
        )}
      </div>
    </div>
  );
}

function FlowColumn({
  project,
  side,
  title,
  empty,
  modules,
  candidates,
  addLabel,
  onNavigate,
  onRemove,
  onAdd,
}: {
  project: Project;
  side: "left" | "right";
  title: string;
  empty: string;
  modules: ProjectModule[];
  candidates: ProjectModule[];
  addLabel: string;
  onNavigate: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (id: string) => void;
}) {
  const arrow = (
    <ArrowRight
      aria-hidden
      className="hidden h-3.5 w-3.5 shrink-0 text-muted-2 md:block"
    />
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        side === "left" ? "md:items-end" : "md:items-start",
      )}
    >
      <p className="type-overline">{title}</p>

      {modules.length === 0 && (
        <p className="text-xs text-muted-2">{empty}</p>
      )}

      {modules.map((mod) => (
        <span key={mod.id} className="flex max-w-full items-center gap-1.5">
          {side === "right" && arrow}
          <FlowChip
            project={project}
            module={mod}
            onNavigate={() => onNavigate(mod.id)}
            onRemove={() => onRemove(mod.id)}
          />
          {side === "left" && arrow}
        </span>
      ))}

      <Popover
        portal
        className="w-80"
        align={side === "left" ? "end" : "start"}
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={toggle}
            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            {addLabel}
          </button>
        )}
      >
        {(close) =>
          candidates.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted">Sin candidatas.</p>
          ) : (
            // A loose pile, not a list: each candidate keeps the chip look it
            // has everywhere else (owner tint, importance = size) with a
            // stable slight rotation.
            <div className="flex max-h-64 flex-wrap items-center gap-2 overflow-y-auto p-1.5">
              {candidates.map((candidate) => {
                const owner = project.members.find((m) =>
                  candidate.assigneeIds.includes(m.id),
                );
                const color = owner ? colorForKey(owner.colorKey) : null;
                const scale = importanceScale(candidate.importance);
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => {
                      onAdd(candidate.id);
                      close();
                    }}
                    style={{
                      fontSize: 12 * scale,
                      padding: `${5 * scale}px ${10 * scale}px`,
                      gap: 6 * scale,
                      rotate: `${jitterDeg(candidate.id)}deg`,
                      backgroundColor: color ? color.bg + "14" : undefined,
                      borderColor: color ? color.bg + "26" : undefined,
                    }}
                    className="flex max-w-full items-center rounded-lg border border-line bg-surface text-left shadow-card transition-[rotate,border-color] hover:rotate-0 hover:border-line-strong"
                  >
                    <DocTypeBadge docType={candidate.docType} />
                    <span
                      className={cn(
                        "min-w-0 font-medium leading-snug break-words",
                        candidate.status === "done"
                          ? "text-muted line-through"
                          : "text-ink",
                      )}
                    >
                      {candidate.title || "Sin título"}
                    </span>
                  </button>
                );
              })}
            </div>
          )
        }
      </Popover>
    </div>
  );
}

/** One related task: same chip look as everywhere (owner tint, importance =
 *  size). Click travels to it, the × unlinks it. */
function FlowChip({
  project,
  module,
  onNavigate,
  onRemove,
}: {
  project: Project;
  module: ProjectModule;
  onNavigate: () => void;
  onRemove: () => void;
}): ReactNode {
  const pending = module.status !== "done";
  const owner = project.members.find((m) => module.assigneeIds.includes(m.id));
  const color = owner ? colorForKey(owner.colorKey) : null;
  const scale = importanceScale(module.importance);
  return (
    <span
      style={{
        fontSize: 12 * scale,
        gap: 6 * scale,
        backgroundColor: color ? color.bg + "14" : undefined,
        borderColor: color ? color.bg + "26" : undefined,
      }}
      className="flex max-w-full items-center rounded-lg border border-line bg-surface py-1 pl-2 pr-1 shadow-card transition-colors hover:border-line-strong"
    >
      {pending ? (
        <Lock className="h-3.5 w-3.5 shrink-0 text-muted" />
      ) : (
        <Check className="h-3.5 w-3.5 shrink-0 text-done" />
      )}
      <DocTypeBadge docType={module.docType} />
      <button
        type="button"
        onClick={onNavigate}
        title="Abrir esta tarea"
        className={cn(
          "min-w-0 truncate text-left font-medium hover:underline",
          pending ? "text-ink" : "text-muted line-through",
        )}
      >
        {module.title || "Sin título"}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar «${module.title || "Sin título"}»`}
        className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-3 hover:text-danger"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
