"use client";

import { Check, Link2, Lock, Plus, X } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { wouldCreateCycle } from "@/lib/data/flow";
import { MODULE_TYPE_META, type Project, type ProjectModule } from "@/lib/data/types";
import { cn } from "@/lib/utils/cn";

interface DependencyFieldProps {
  project: Project;
  module: ProjectModule;
  onToggle: (depId: string) => void;
}

/**
 * Direct dependencies editor: chips for the current prerequisites plus a
 * picker that hides anything that would create a cycle.
 */
export function DependencyField({
  project,
  module,
  onToggle,
}: DependencyFieldProps) {
  const deps = module.dependsOn
    .map((id) => project.modules.find((m) => m.id === id))
    .filter((m): m is ProjectModule => Boolean(m));

  const candidates = project.modules.filter(
    (m) =>
      m.id !== module.id &&
      !module.dependsOn.includes(m.id) &&
      !wouldCreateCycle(project, module.id, m.id),
  );

  return (
    <div className="flex flex-col gap-2">
      {deps.length === 0 && (
        <p className="text-xs text-muted-2">
          Sin dependencias directas — no espera a ninguna otra tarea.
        </p>
      )}
      {deps.map((dep) => {
        const meta = MODULE_TYPE_META[dep.type];
        const pending = dep.status !== "done";
        return (
          <span
            key={dep.id}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/50 py-1.5 pl-2.5 pr-1.5"
          >
            {pending ? (
              <Lock className="h-3.5 w-3.5 shrink-0 text-muted" />
            ) : (
              <Check className="h-3.5 w-3.5 shrink-0 text-done" />
            )}
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: meta.color }}
              title={meta.label}
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-xs font-medium",
                pending ? "text-ink-2" : "text-muted line-through",
              )}
            >
              {dep.title || "Sin título"}
            </span>
            <button
              type="button"
              onClick={() => onToggle(dep.id)}
              aria-label={`Quitar dependencia de «${dep.title || "Sin título"}»`}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-3 hover:text-danger"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        );
      })}

      <Popover
        className="w-72"
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={toggle}
            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            Añadir dependencia
          </button>
        )}
      >
        {(close) =>
          candidates.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted">
              No hay módulos disponibles (los que crearían un ciclo se ocultan).
            </p>
          ) : (
            <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {candidates.map((candidate) => {
                const meta = MODULE_TYPE_META[candidate.type];
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => {
                      onToggle(candidate.id);
                      close();
                    }}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-surface-2"
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: meta.color }}
                      title={meta.label}
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-xs",
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
