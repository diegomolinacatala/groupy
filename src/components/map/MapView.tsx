"use client";

import { useMemo, useState } from "react";
import { Check, Lock, MousePointerClick, Package } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import { buildProjectFlow, orderedDeliverables } from "@/lib/data/flow";
import { Avatar } from "@/components/ui/Avatar";
import { MemberFilter } from "@/components/ui/MemberFilter";
import { TaskSquare } from "./TaskSquare";
import { MiniFlowchart } from "./MiniFlowchart";
import type { ProjectModule, TeamMember } from "@/lib/data/types";
import { cn } from "@/lib/utils/cn";

const NO_DATE = "9999-12-31";

function byFlowDate(a: ProjectModule, b: ProjectModule): number {
  const dateA = a.dueDate ?? NO_DATE;
  const dateB = b.dueDate ?? NO_DATE;
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;
  return a.order - b.order;
}

/**
 * Dependency map: one row of coloured squares per member (their tasks in
 * flow order), plus the entregas row. Selecting a square opens the mini
 * flowchart with its prerequisites and dependents.
 */
export function MapView() {
  const { project, currentMemberId } = useProject();
  const { openModule, focusMemberId, setFocusMemberId } = useDashboardUi();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const flow = useMemo(() => buildProjectFlow(project), [project]);
  const deliverables = useMemo(() => orderedDeliverables(project), [project]);

  const tasksOf = (member: TeamMember | null): ProjectModule[] =>
    project.modules
      .filter(
        (m) =>
          m.type !== "milestone" &&
          (member
            ? m.assigneeIds.includes(member.id)
            : m.assigneeIds.length === 0),
      )
      .sort(byFlowDate);

  const visibleMembers = focusMemberId
    ? project.members.filter((m) => m.id === focusMemberId)
    : project.members;
  const rows: { member: TeamMember | null; tasks: ProjectModule[] }[] =
    visibleMembers.map((member) => ({ member, tasks: tasksOf(member) }));
  const unassigned = tasksOf(null);
  if (!focusMemberId && unassigned.length > 0) {
    rows.push({ member: null, tasks: unassigned });
  }

  const selected = selectedId ? flow.byId.get(selectedId) : null;

  return (
    <div className="flex h-full flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="type-display text-2xl">Mapa de dependencias</h2>
          <p className="text-sm text-muted">
            Cada cuadrado es una tarea; el candado pequeño lleva el color de
            quien está esperando a que se complete.
          </p>
        </div>
        <MemberFilter
          members={project.members}
          value={focusMemberId}
          onChange={setFocusMemberId}
          currentMemberId={currentMemberId}
        />
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4 shadow-card md:p-5">
        {/* Entregas row */}
        {deliverables.length > 0 && (
          <div className="mb-4 flex items-center gap-4 border-b border-line pb-4">
            <span className="flex w-36 shrink-0 items-center gap-2 text-xs font-medium text-muted md:w-44">
              <Package className="h-4 w-4" />
              Entregas
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {deliverables.map((deliverable) => {
                const entry = flow.byId.get(deliverable.id);
                const isSelected = selectedId === deliverable.id;
                return (
                  <button
                    key={deliverable.id}
                    type="button"
                    onClick={() => setSelectedId(deliverable.id)}
                    title={`${deliverable.title || "Sin título"} · ${
                      entry?.state === "done"
                        ? "Entregada"
                        : entry?.state === "available"
                          ? "Lista para entregar"
                          : "En preparación"
                    }`}
                    aria-pressed={isSelected}
                    className={cn(
                      "grid h-9 w-9 rotate-45 place-items-center rounded-md border transition-all",
                      isSelected
                        ? "scale-105 ring-2 ring-accent ring-offset-2 ring-offset-surface"
                        : "hover:scale-105",
                      entry?.state === "done"
                        ? "border-milestone bg-milestone text-white"
                        : entry?.state === "available"
                          ? "border-milestone bg-milestone-soft"
                          : "border-dashed border-line-strong bg-surface-2/60",
                    )}
                  >
                    <span className="-rotate-45">
                      {entry?.state === "done" ? (
                        <Check className="h-4 w-4" strokeWidth={3} />
                      ) : entry?.state === "locked" ? (
                        <Lock className="h-3.5 w-3.5 text-muted" />
                      ) : (
                        <Package
                          className="h-3.5 w-3.5"
                          style={{ color: "var(--color-milestone)" }}
                        />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Member rows */}
        <div className="flex flex-col gap-3.5">
          {rows.map(({ member, tasks }) => (
            <div key={member?.id ?? "unassigned"} className="flex items-center gap-4">
              <span className="flex w-36 shrink-0 items-center gap-2 md:w-44">
                {member ? (
                  <>
                    <Avatar member={member} size="sm" />
                    <span className="min-w-0 truncate text-sm font-medium text-ink">
                      {member.name}
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-medium text-muted">
                    Sin asignar
                  </span>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-2.5 py-0.5">
                {tasks.length === 0 ? (
                  <span className="text-xs text-muted-2">Sin tareas</span>
                ) : (
                  tasks.map((task) => {
                    const entry = flow.byId.get(task.id);
                    if (!entry) return null;
                    return (
                      <TaskSquare
                        key={task.id}
                        flow={entry}
                        member={member}
                        members={project.members}
                        selected={selectedId === task.id}
                        onSelect={() =>
                          setSelectedId(selectedId === task.id ? null : task.id)
                        }
                      />
                    );
                  })
                )}
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="py-4 text-center text-sm text-muted">
              Añade miembros y tareas para ver el mapa.
            </p>
          )}
        </div>
      </div>

      {/* Detail: mini flowchart */}
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card md:p-5">
        {selected ? (
          <MiniFlowchart
            flow={flow}
            centerId={selected.module.id}
            members={project.members}
            onSelect={(id) => setSelectedId(id)}
            onOpen={openModule}
          />
        ) : (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <MousePointerClick className="h-4 w-4" />
            Selecciona una tarea o una entrega para ver de qué depende y qué
            desbloquea.
          </p>
        )}
      </section>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded border border-ink-2 bg-ink-2/20" />
          Disponible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="grid h-3.5 w-3.5 place-items-center rounded border border-dashed border-line-strong">
            <Lock className="h-2 w-2" />
          </span>
          Bloqueada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="grid h-3.5 w-3.5 place-items-center rounded bg-ink-2 text-white">
            <Check className="h-2 w-2" strokeWidth={3} />
          </span>
          Hecha
        </span>
        <span className="flex items-center gap-1.5">
          <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-danger text-white">
            <Lock className="h-2 w-2" />
          </span>
          Alguien espera esta tarea (color de quien espera)
        </span>
      </div>
    </div>
  );
}
