"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { ModuleCard } from "./ModuleCard";
import { IconButton } from "@/components/ui/IconButton";
import {
  MODULE_STATUS_META,
  type ModuleStatus,
  type ProjectModule,
  type TeamMember,
} from "@/lib/data/types";
import { cn } from "@/lib/utils/cn";

interface BoardColumnProps {
  status: ModuleStatus;
  modules: ProjectModule[];
  members: TeamMember[];
  lockedIds: Set<string>;
  onOpenModule: (id: string) => void;
  onAdd: (status: ModuleStatus) => void;
}

export function BoardColumn({
  status,
  modules,
  members,
  lockedIds,
  onOpenModule,
  onAdd,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${status}`,
    data: { status },
  });
  const meta = MODULE_STATUS_META[status];

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
          <span className="text-sm font-semibold text-ink">{meta.label}</span>
          <span className="text-xs font-medium text-muted">
            {modules.length}
          </span>
        </div>
        <IconButton label="Añadir aquí" size="sm" onClick={() => onAdd(status)}>
          <Plus className="h-4 w-4" />
        </IconButton>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 rounded-2xl border border-line bg-surface-2/50 p-2 transition-colors",
          isOver && "border-accent/50 bg-accent-soft/50",
        )}
      >
        {modules.map((module) => (
          <ModuleCard
            key={module.id}
            module={module}
            members={members}
            locked={lockedIds.has(module.id)}
            onOpen={() => onOpenModule(module.id)}
          />
        ))}
        {modules.length === 0 && (
          <button
            type="button"
            onClick={() => onAdd(status)}
            className="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-xs text-muted transition-colors hover:border-accent hover:text-accent"
          >
            Sin tareas
          </button>
        )}
      </div>
    </div>
  );
}
