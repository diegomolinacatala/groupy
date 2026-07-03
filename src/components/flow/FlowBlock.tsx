"use client";

import { Check, Inbox, Lock, Package, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { FlowTaskCard } from "./FlowTaskCard";
import type { DeliverableBlock, ProjectFlow } from "@/lib/data/flow";
import type { TeamMember } from "@/lib/data/types";
import { deadlineLabel } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

interface FlowBlockProps {
  block: DeliverableBlock;
  index: number;
  flow: ProjectFlow;
  members: TeamMember[];
  /** null = todo el equipo. */
  focusMemberId: string | null;
  onOpenModule: (id: string) => void;
  onAdvanceModule: (id: string) => void;
  onDeliver: (milestoneId: string) => void;
  onAddTask: (deliverableId: string | null) => void;
}

/**
 * One entrega block in the flow view: the milestone header (with its own
 * lock/ready/delivered state) plus the tasks assigned to it.
 */
export function FlowBlock({
  block,
  index,
  flow,
  members,
  focusMemberId,
  onOpenModule,
  onAdvanceModule,
  onDeliver,
  onAddTask,
}: FlowBlockProps) {
  const { deliverable, modules } = block;
  const milestoneFlow = deliverable ? flow.byId.get(deliverable.id) : null;

  const doneCount = modules.filter((m) => m.status === "done").length;
  const visible = focusMemberId
    ? modules.filter((m) => m.assigneeIds.includes(focusMemberId))
    : modules;
  const hiddenCount = modules.length - visible.length;

  const milestoneState = !milestoneFlow
    ? null
    : milestoneFlow.state === "done"
      ? "delivered"
      : milestoneFlow.state === "available"
        ? "ready"
        : "preparing";

  return (
    <section className="relative pl-8">
      {/* Timeline rail */}
      <span
        aria-hidden
        className="absolute left-[9px] top-8 bottom-0 w-px bg-line"
      />
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1.5 grid h-5 w-5 place-items-center rounded-full border-2",
          milestoneState === "delivered"
            ? "border-done bg-done text-white"
            : milestoneState === "ready"
              ? "border-milestone bg-milestone-soft text-milestone"
              : "border-line-strong bg-surface text-muted",
        )}
      >
        {milestoneState === "delivered" ? (
          <Check className="h-3 w-3" strokeWidth={3} />
        ) : deliverable ? (
          <Package className="h-2.5 w-2.5" />
        ) : (
          <Inbox className="h-2.5 w-2.5" />
        )}
      </span>

      {/* Block header */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-3">
        {deliverable ? (
          <>
            <button
              type="button"
              onClick={() => onOpenModule(deliverable.id)}
              className="group flex min-w-0 items-baseline gap-2.5 text-left"
            >
              <span className="type-overline shrink-0">
                Entrega {index + 1}
              </span>
              <span className="type-display truncate text-lg text-ink group-hover:underline">
                {deliverable.title || "Sin título"}
              </span>
            </button>
            <span className="text-xs text-muted">
              {deadlineLabel(deliverable.dueDate)}
              {modules.length > 0 &&
                ` · ${doneCount}/${modules.length} tareas`}
            </span>

            {milestoneState === "delivered" && (
              <Badge
                label="Entregada"
                color="var(--color-done)"
                soft="var(--color-done-soft)"
              />
            )}
            {milestoneState === "preparing" && (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <Lock className="h-3 w-3" />
                En preparación
              </span>
            )}
            {milestoneState === "ready" && (
              <button
                type="button"
                onClick={() => onDeliver(deliverable.id)}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-xs font-medium text-canvas transition-colors hover:bg-ink-hover"
              >
                <Check className="h-3 w-3" />
                Marcar entregada
              </button>
            )}
          </>
        ) : (
          <>
            <span className="type-display text-lg text-ink">Sin entrega</span>
            <span className="text-xs text-muted">
              Tareas sueltas, fuera de los bloques
            </span>
          </>
        )}
      </header>

      {/* Tasks */}
      <div className="grid gap-2.5 pb-8 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((module) => {
          const entry = flow.byId.get(module.id);
          if (!entry) return null;
          return (
            <FlowTaskCard
              key={module.id}
              flow={entry}
              members={members}
              onOpen={() => onOpenModule(module.id)}
              onAdvance={() => onAdvanceModule(module.id)}
            />
          );
        })}
        <button
          type="button"
          onClick={() => onAddTask(deliverable?.id ?? null)}
          className="flex min-h-16 items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-3 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          Añadir tarea
        </button>
      </div>

      {focusMemberId && hiddenCount > 0 && (
        <p className="-mt-6 pb-6 text-xs text-muted-2">
          {hiddenCount === 1
            ? "1 tarea más de otros miembros"
            : `${hiddenCount} tareas más de otros miembros`}
        </p>
      )}
    </section>
  );
}
