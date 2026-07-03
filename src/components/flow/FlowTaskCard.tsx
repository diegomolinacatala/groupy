"use client";

import { CalendarClock, Check, Lock, Play } from "lucide-react";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import type { ModuleFlow } from "@/lib/data/flow";
import type { TeamMember } from "@/lib/data/types";
import { daysUntil, deadlineLabel } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

interface FlowTaskCardProps {
  flow: ModuleFlow;
  members: TeamMember[];
  onOpen: () => void;
  /** Advance the module (todo → in_progress → done); hidden when locked. */
  onAdvance?: () => void;
  compact?: boolean;
}

function blockerCaption(flow: ModuleFlow): string {
  const first = flow.blockers[0];
  if (!first) return "";
  if (first.kind === "previous-deliverable") {
    return `Esperando la entrega anterior: «${first.module.title || "Sin título"}»`;
  }
  if (first.kind === "block-task") {
    const pending = flow.blockers.filter((b) => b.kind === "block-task").length;
    return pending === 1
      ? "Falta 1 tarea de esta entrega"
      : `Faltan ${pending} tareas de esta entrega`;
  }
  return `Esperando: «${first.module.title || "Sin título"}»`;
}

/**
 * A task inside the flow view. Locked tasks show the padlock plus who/what
 * unlocks them; available tasks expose a one-click advance action.
 */
export function FlowTaskCard({
  flow,
  members,
  onOpen,
  onAdvance,
  compact = false,
}: FlowTaskCardProps) {
  const { module, state, blockers } = flow;
  const assignees = members.filter((m) => module.assigneeIds.includes(m.id));
  const overdue = state !== "done" && (daysUntil(module.dueDate) ?? 1) < 0;
  const blockerOwners = members.filter((m) =>
    blockers.some((b) => b.module.assigneeIds.includes(m.id)),
  );
  const extraBlockers = blockers.length - 1;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group flex cursor-pointer flex-col gap-2 rounded-xl border p-3 text-left transition-all",
        compact && "min-w-56 max-w-64 shrink-0",
        state === "locked"
          ? "border-dashed border-line-strong bg-surface-2/40"
          : "border-line bg-surface shadow-card hover:border-line-strong",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full",
            state === "done" && "bg-done text-white",
            state === "available" && "border-2 border-line-strong",
            state === "locked" && "text-muted",
          )}
        >
          {state === "done" && <Check className="h-3 w-3" strokeWidth={3} />}
          {state === "locked" && <Lock className="h-3.5 w-3.5" />}
        </span>
        <p
          className={cn(
            "min-w-0 flex-1 text-sm font-medium leading-snug",
            state === "done" && "text-muted line-through",
            state === "locked" ? "text-ink-2" : "text-ink",
          )}
        >
          {module.title || "Sin título"}
        </p>
        {module.status === "in_progress" && (
          <span
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: "var(--color-progress)" }}
            title="En curso"
          />
        )}
      </div>

      {state === "locked" && blockers.length > 0 && (
        <div className="flex items-center gap-1.5 pl-7 text-xs text-muted">
          <AvatarStack members={blockerOwners} size="xs" max={2} />
          <span className="min-w-0 truncate">
            {blockerCaption(flow)}
            {extraBlockers > 0 &&
              blockers[0].kind === "direct" &&
              ` y ${extraBlockers} más`}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pl-7">
        {module.dueDate ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs",
              overdue ? "font-medium text-danger" : "text-muted",
            )}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            {deadlineLabel(module.dueDate)}
          </span>
        ) : (
          <span className="text-xs text-muted-2">Sin fecha</span>
        )}

        <div className="flex items-center gap-1.5">
          {assignees.length === 1 ? (
            <span className="flex items-center gap-1.5">
              <Avatar member={assignees[0]} size="xs" />
              <span className="max-w-24 truncate text-xs text-muted">
                {assignees[0].name.split(" ")[0]}
              </span>
            </span>
          ) : (
            <AvatarStack members={assignees} size="xs" max={3} />
          )}
          {state === "available" && onAdvance && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAdvance();
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
                module.status === "in_progress"
                  ? "bg-done/10 text-done hover:bg-done hover:text-white"
                  : "bg-surface-2 text-ink-2 hover:bg-ink hover:text-canvas",
              )}
            >
              {module.status === "in_progress" ? (
                <>
                  <Check className="h-3 w-3" /> Completar
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" /> Empezar
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
