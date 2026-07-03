"use client";

import { useDroppable } from "@dnd-kit/core";
import { Inbox } from "lucide-react";
import { ModuleChip } from "./ModuleChip";
import type { ProjectModule, TeamMember } from "@/lib/data/types";
import { cn } from "@/lib/utils/cn";

interface UnscheduledTrayProps {
  modules: ProjectModule[];
  members: TeamMember[];
  lockedIds: Set<string>;
  onOpenModule: (id: string) => void;
}

/** Home for date-less tasks; also the drop zone to "unschedule" a task. */
export function UnscheduledTray({
  modules,
  members,
  lockedIds,
  onOpenModule,
}: UnscheduledTrayProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: "day:null",
    data: { date: null },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-start gap-3 rounded-xl border border-dashed border-line-strong bg-surface p-2.5 transition-colors",
        isOver && "border-accent bg-accent-soft/60",
      )}
    >
      <span className="flex shrink-0 items-center gap-1.5 px-1 py-1 text-xs font-medium text-muted">
        <Inbox className="h-4 w-4" />
        Sin fecha
      </span>
      {modules.length === 0 ? (
        <span className="py-1.5 text-xs text-muted-2">
          Suelta aquí para quitar la fecha.
        </span>
      ) : (
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {modules.map((module) => (
            <div key={module.id} className="w-44 max-w-full">
              <ModuleChip
                module={module}
                members={members}
                locked={lockedIds.has(module.id)}
                onOpen={() => onOpenModule(module.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
