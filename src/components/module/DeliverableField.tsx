"use client";

import { Check, ChevronDown, Package } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { orderedDeliverables } from "@/lib/data/flow";
import type { Project, ProjectModule } from "@/lib/data/types";
import { cn } from "@/lib/utils/cn";

interface DeliverableFieldProps {
  project: Project;
  module: ProjectModule;
  onChange: (deliverableId: string | null) => void;
}

/** Picker assigning a module to one of the project's entregas (milestones). */
export function DeliverableField({
  project,
  module,
  onChange,
}: DeliverableFieldProps) {
  const deliverables = orderedDeliverables(project).filter(
    (d) => d.id !== module.id,
  );
  const current = deliverables.find((d) => d.id === module.deliverableId);

  if (deliverables.length === 0) {
    return (
      <p className="text-xs text-muted-2">
        No hay entregas todavía — crea un módulo de tipo «Entrega» para agrupar
        tareas en bloques.
      </p>
    );
  }

  return (
    <Popover
      className="w-64"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 text-sm transition-colors hover:border-line-strong"
        >
          <span
            className={cn(
              "flex min-w-0 items-center gap-2",
              current ? "text-ink" : "text-muted",
            )}
          >
            <Package
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: "var(--color-milestone)" }}
            />
            <span className="truncate">
              {current ? current.title || "Sin título" : "Sin entrega"}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
        </button>
      )}
    >
      {(close) => (
        <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              close();
            }}
            className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-muted transition-colors hover:bg-surface-2"
          >
            Sin entrega
            {!current && <Check className="h-4 w-4 text-accent" />}
          </button>
          {deliverables.map((deliverable, index) => (
            <button
              key={deliverable.id}
              type="button"
              onClick={() => {
                onChange(deliverable.id);
                close();
              }}
              className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-2"
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="type-overline shrink-0">{index + 1}</span>
                <span className="truncate">
                  {deliverable.title || "Sin título"}
                </span>
              </span>
              {current?.id === deliverable.id && (
                <Check className="h-4 w-4 shrink-0 text-accent" />
              )}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
