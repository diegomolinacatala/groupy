"use client";

import { useState } from "react";
import { Plus, Trash2, UserPlus, X } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import { SlideOver } from "@/components/ui/SlideOver";
import { InlineText } from "@/components/ui/InlineText";
import { Segmented } from "@/components/ui/Segmented";
import { DateField } from "@/components/ui/DateField";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { AssigneePicker } from "@/components/ui/AssigneePicker";
import {
  MODULE_TYPE_META,
  type ModuleStatus,
  type ModuleType,
} from "@/lib/data/types";
import { cn } from "@/lib/utils/cn";

const TYPE_OPTIONS: { value: ModuleType; label: string }[] = [
  { value: "task", label: "Tarea" },
  { value: "milestone", label: "Hito" },
  { value: "objective", label: "Objetivo" },
];

const STATUS_OPTIONS: { value: ModuleStatus; label: string }[] = [
  { value: "todo", label: "Pendiente" },
  { value: "in_progress", label: "En curso" },
  { value: "done", label: "Hecho" },
];

export function ModuleEditor() {
  const {
    project,
    updateModule,
    deleteModule,
    toggleAssignee,
    addChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
  } = useProject();
  const { editingModuleId, closeModule } = useDashboardUi();
  const [checklistDraft, setChecklistDraft] = useState("");

  const activeModule =
    project.modules.find((m) => m.id === editingModuleId) ?? null;
  const open = Boolean(activeModule);

  const handleDelete = () => {
    if (!activeModule) return;
    if (window.confirm("¿Eliminar este módulo?")) {
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

  const typeMeta = activeModule ? MODULE_TYPE_META[activeModule.type] : null;
  const assignees = activeModule
    ? project.members.filter((m) => activeModule.assigneeIds.includes(m.id))
    : [];
  const checklistDone = activeModule
    ? activeModule.checklist.filter((c) => c.done).length
    : 0;

  return (
    <SlideOver open={open} onClose={closeModule}>
      {activeModule && typeMeta && (
        <>
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <Badge
              label={typeMeta.label}
              color={typeMeta.color}
              soft={typeMeta.soft}
            />
            <div className="flex items-center gap-1">
              <IconButton label="Eliminar módulo" tone="danger" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
              <IconButton label="Cerrar" onClick={closeModule}>
                <X className="h-5 w-5" />
              </IconButton>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <InlineText
              value={activeModule.title}
              onCommit={(title) => updateModule(activeModule.id, { title })}
              placeholder="Título del módulo"
              ariaLabel="Título del módulo"
              className="-ml-1.5 text-lg font-semibold"
            />

            <div className="mt-4 flex flex-col gap-4">
              <Field label="Tipo">
                <Segmented
                  options={TYPE_OPTIONS}
                  value={activeModule.type}
                  onChange={(type) => updateModule(activeModule.id, { type })}
                  size="sm"
                />
              </Field>

              <Field label="Estado">
                <Segmented
                  options={STATUS_OPTIONS}
                  value={activeModule.status}
                  onChange={(status) =>
                    updateModule(activeModule.id, { status })
                  }
                  size="sm"
                />
              </Field>

              <Field label="Fecha de entrega">
                <DateField
                  value={activeModule.dueDate}
                  onChange={(dueDate) =>
                    updateModule(activeModule.id, { dueDate })
                  }
                  ariaLabel="Fecha de entrega del módulo"
                  className="w-full"
                />
              </Field>

              <Field label="Responsables">
                <div className="flex flex-wrap items-center gap-2">
                  {assignees.map((member) => (
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

              <Field label="Descripción">
                <InlineText
                  value={activeModule.description}
                  onCommit={(description) =>
                    updateModule(activeModule.id, { description })
                  }
                  placeholder="Añade detalles, enlaces o notas…"
                  multiline
                  ariaLabel="Descripción del módulo"
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
                    <div key={item.id} className="group flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateChecklistItem(activeModule.id, item.id, {
                            done: !item.done,
                          })
                        }
                        aria-label={item.done ? "Marcar pendiente" : "Marcar hecho"}
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
                          updateChecklistItem(activeModule.id, item.id, { text })
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
        </>
      )}
    </SlideOver>
  );
}
