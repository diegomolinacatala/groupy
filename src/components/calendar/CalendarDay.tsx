"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { ModuleChip } from "./ModuleChip";
import type { ProjectModule } from "@/lib/data/types";
import { cn } from "@/lib/utils/cn";

interface CalendarDayProps {
  iso: string;
  dayNum: number;
  inMonth: boolean;
  isToday: boolean;
  modules: ProjectModule[];
  lockedIds: Set<string>;
  onOpenModule: (id: string) => void;
  onQuickAdd: (iso: string) => void;
}

export function CalendarDay({
  iso,
  dayNum,
  inMonth,
  isToday,
  modules,
  lockedIds,
  onOpenModule,
  onQuickAdd,
}: CalendarDayProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${iso}`,
    data: { date: iso },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/day relative flex min-h-[108px] flex-col gap-1 border-b border-r border-line p-1.5 transition-colors",
        !inMonth && "bg-surface-2/40",
        isOver && "bg-accent-soft/70 ring-1 ring-inset ring-accent/40",
      )}
    >
      <div className="flex items-center justify-between px-0.5">
        <span
          className={cn(
            "grid h-6 w-6 place-items-center rounded-full text-xs font-medium",
            isToday
              ? "bg-accent text-accent-ink"
              : inMonth
                ? "text-ink-2"
                : "text-muted-2",
          )}
        >
          {dayNum}
        </span>
        <button
          type="button"
          onClick={() => onQuickAdd(iso)}
          aria-label="Añadir módulo este día"
          className="grid h-5 w-5 place-items-center rounded-md text-muted opacity-0 transition-opacity hover:bg-surface-3 hover:text-ink group-hover/day:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {modules.map((module) => (
          <ModuleChip
            key={module.id}
            module={module}
            locked={lockedIds.has(module.id)}
            onOpen={() => onOpenModule(module.id)}
          />
        ))}
      </div>
    </div>
  );
}
