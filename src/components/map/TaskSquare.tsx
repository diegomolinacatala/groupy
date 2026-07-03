"use client";

import { Check, Lock } from "lucide-react";
import type { ModuleFlow } from "@/lib/data/flow";
import type { TeamMember } from "@/lib/data/types";
import { colorForKey } from "@/lib/utils/colors";
import { cn } from "@/lib/utils/cn";

interface TaskSquareProps {
  flow: ModuleFlow;
  /** Member whose row this square lives in (tints the square); null = sin asignar. */
  member: TeamMember | null;
  members: TeamMember[];
  selected: boolean;
  onSelect: () => void;
}

const UNASSIGNED_COLOR = { bg: "#8b8779", ink: "#ffffff" };

/**
 * One task in the dependency map: a square tinted with its owner's colour.
 * If someone else's pending work waits on this task, a small padlock badge
 * tinted with THAT member's colour appears ("te están esperando").
 */
export function TaskSquare({
  flow,
  member,
  members,
  selected,
  onSelect,
}: TaskSquareProps) {
  const { module, state, waitingMemberIds } = flow;
  const color = member ? colorForKey(member.colorKey) : UNASSIGNED_COLOR;

  // The padlock badge only matters while the task is pending, and only for
  // OTHER members waiting on it (waiting on your own chain is just the plan).
  const waiting = members.filter(
    (m) => m.id !== member?.id && waitingMemberIds.includes(m.id),
  );
  const showWaitBadge = state !== "done" && waiting.length > 0;
  const waitColor = showWaitBadge ? colorForKey(waiting[0].colorKey) : null;

  const stateLabel =
    state === "done" ? "Hecha" : state === "locked" ? "Bloqueada" : "Disponible";
  const waitingLabel =
    waiting.length > 0
      ? ` · Esperan: ${waiting.map((w) => w.name.split(" ")[0]).join(", ")}`
      : "";

  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${module.title || "Sin título"} · ${stateLabel}${waitingLabel}`}
      aria-pressed={selected}
      className={cn(
        "relative grid h-10 w-10 shrink-0 place-items-center rounded-lg border transition-all",
        selected
          ? "scale-105 ring-2 ring-accent ring-offset-2 ring-offset-canvas"
          : "hover:scale-105",
        state === "locked" && "border-dashed",
      )}
      style={{
        backgroundColor:
          state === "done"
            ? color.bg
            : state === "available"
              ? `${color.bg}33`
              : `${color.bg}14`,
        borderColor: state === "locked" ? `${color.bg}66` : color.bg,
      }}
    >
      {state === "done" && (
        <Check className="h-4 w-4" strokeWidth={3} style={{ color: color.ink }} />
      )}
      {state === "locked" && (
        <Lock className="h-3.5 w-3.5" style={{ color: color.bg }} />
      )}
      {state === "available" && module.status === "in_progress" && (
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color.bg }}
        />
      )}

      {showWaitBadge && waitColor && (
        <span
          className="absolute -bottom-1.5 -right-1.5 grid h-4.5 w-4.5 place-items-center rounded-full ring-2 ring-canvas"
          style={{ backgroundColor: waitColor.bg }}
          aria-hidden
        >
          <Lock className="h-2.5 w-2.5" style={{ color: waitColor.ink }} />
        </span>
      )}
    </button>
  );
}
