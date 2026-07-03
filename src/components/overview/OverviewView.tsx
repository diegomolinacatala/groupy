"use client";

import { Lock } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import { lockedModuleIds } from "@/lib/data/flow";
import { StatCard } from "./StatCard";
import { InlineText } from "@/components/ui/InlineText";
import { DateField } from "@/components/ui/DateField";
import { Segmented } from "@/components/ui/Segmented";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import {
  MODULE_TYPE_META,
  type ProjectStatus,
} from "@/lib/data/types";
import { daysUntil, deadlineLabel } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "Activo" },
  { value: "in_review", label: "En revisión" },
  { value: "closed", label: "Cerrado" },
];

export function OverviewView() {
  const { project, updateProject } = useProject();
  const { openModule } = useDashboardUi();
  const { modules, members } = project;

  const done = modules.filter((m) => m.status === "done").length;
  const inProgress = modules.filter((m) => m.status === "in_progress").length;
  const overdue = modules.filter(
    (m) => m.status !== "done" && (daysUntil(m.dueDate) ?? 1) < 0,
  ).length;
  const percent = modules.length === 0 ? 0 : Math.round((done / modules.length) * 100);
  const daysLeft = daysUntil(project.dueDate);

  const upcoming = modules
    .filter((m) => m.dueDate && m.status !== "done")
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
    .slice(0, 6);

  const lockedIds = lockedModuleIds(project);

  return (
    <div className="flex h-full flex-col gap-5 p-4 md:p-6">
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-card lg:grid-cols-4">
        <StatCard label="Módulos" value={modules.length} detail="en el plan" />
        <div className="border-l border-line">
          <StatCard
            label="Completados"
            value={`${percent}%`}
            detail={`${done} de ${modules.length}`}
          />
        </div>
        <div className="border-t border-line lg:border-l lg:border-t-0">
          <StatCard label="En curso" value={inProgress} detail="ahora mismo" />
        </div>
        <div className="border-l border-t border-line lg:border-t-0">
          {overdue > 0 ? (
            <StatCard
              label="Retrasados"
              value={overdue}
              detail="necesitan atención"
              tone="danger"
            />
          ) : (
            <StatCard
              label="Entrega"
              value={daysLeft ?? "—"}
              detail="días restantes"
            />
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Project details */}
        <section className="lg:col-span-3">
          <div className="flex h-full flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h3 className="type-overline">Detalles del proyecto</h3>

            <Field label="Descripción">
              <InlineText
                value={project.description}
                onCommit={(description) => updateProject({ description })}
                placeholder="¿De qué va el proyecto?"
                multiline
                ariaLabel="Descripción del proyecto"
                className="-ml-1.5 rounded-lg bg-surface-2/50 text-sm text-ink-2"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Inicio">
                <DateField
                  value={project.startDate}
                  onChange={(startDate) => updateProject({ startDate })}
                  ariaLabel="Fecha de inicio"
                  className="w-full"
                />
              </Field>
              <Field label="Entrega">
                <DateField
                  value={project.dueDate}
                  onChange={(dueDate) => updateProject({ dueDate })}
                  ariaLabel="Fecha de entrega"
                  className="w-full"
                />
              </Field>
            </div>

            <Field label="Estado">
              <Segmented
                options={STATUS_OPTIONS}
                value={project.status}
                onChange={(status) => updateProject({ status })}
                size="sm"
              />
            </Field>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-muted">Progreso general</span>
                <span className="font-semibold text-ink">{percent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Team contribution */}
        <section className="lg:col-span-2">
          <div className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h3 className="type-overline">Contribución del equipo</h3>

            {members.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                Añade miembros para ver su reparto.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {members.map((member) => {
                  const assigned = modules.filter((m) =>
                    m.assigneeIds.includes(member.id),
                  );
                  const memberDone = assigned.filter(
                    (m) => m.status === "done",
                  ).length;
                  const ratio =
                    assigned.length === 0
                      ? 0
                      : Math.round((memberDone / assigned.length) * 100);
                  return (
                    <div key={member.id} className="flex items-center gap-3">
                      <Avatar member={member} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="truncate font-medium text-ink">
                            {member.name}
                          </span>
                          <span className="shrink-0 text-muted">
                            {memberDone}/{assigned.length}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-accent/80"
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Upcoming deadlines */}
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h3 className="type-overline mb-3">Próximos vencimientos</h3>
        {upcoming.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            No hay módulos pendientes con fecha. ¡Buen trabajo!
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {upcoming.map((module) => {
              const meta = MODULE_TYPE_META[module.type];
              const assignees = members.filter((m) =>
                module.assigneeIds.includes(m.id),
              );
              const late = (daysUntil(module.dueDate) ?? 1) < 0;
              return (
                <li key={module.id}>
                  <button
                    type="button"
                    onClick={() => openModule(module.id)}
                    className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-surface-2/60"
                  >
                    <Badge
                      label={meta.label}
                      color={meta.color}
                      soft={meta.soft}
                      dot={false}
                    />
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      {lockedIds.has(module.id) && (
                        <Lock
                          className="h-3.5 w-3.5 shrink-0 text-muted"
                          aria-label="Bloqueada por dependencias"
                        />
                      )}
                      <span className="min-w-0 truncate text-sm font-medium text-ink">
                        {module.title || "Sin título"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        late ? "font-medium text-danger" : "text-muted",
                      )}
                    >
                      {deadlineLabel(module.dueDate)}
                    </span>
                    <AvatarStack members={assignees} size="xs" max={3} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
