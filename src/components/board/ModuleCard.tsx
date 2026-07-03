"use client";

import { useDraggable } from "@dnd-kit/core";
import { CalendarClock, Lock } from "lucide-react";
import { AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import {
  MODULE_TYPE_META,
  type ProjectModule,
  type TeamMember,
} from "@/lib/data/types";
import { daysUntil, deadlineLabel } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

function CardInner({
  module,
  members,
  dragging,
  locked,
}: {
  module: ProjectModule;
  members: TeamMember[];
  dragging?: boolean;
  locked?: boolean;
}) {
  const meta = MODULE_TYPE_META[module.type];
  const assignees = members.filter((m) => module.assigneeIds.includes(m.id));
  const doneItems = module.checklist.filter((c) => c.done).length;
  const overdue =
    module.status !== "done" && (daysUntil(module.dueDate) ?? 1) < 0;

  return (
    <div
      className={cn(
        "rounded-xl border p-3 text-left transition-shadow",
        locked
          ? "border-dashed border-line-strong bg-surface-2/40"
          : "border-line bg-surface",
        dragging ? "shadow-pop" : !locked && "shadow-card hover:border-line-strong",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge label={meta.label} color={meta.color} soft={meta.soft} />
        <span className="flex items-center gap-1.5">
          {module.checklist.length > 0 && (
            <span className="shrink-0 text-xs text-muted">
              {doneItems}/{module.checklist.length}
            </span>
          )}
          {locked && (
            <Lock
              className="h-3.5 w-3.5 shrink-0 text-muted"
              aria-label="Bloqueada por dependencias"
            />
          )}
        </span>
      </div>
      <p
        className={cn(
          "text-sm font-medium leading-snug",
          module.status === "done" && "text-muted line-through",
          locked ? "text-ink-2" : "text-ink",
        )}
      >
        {module.title || "Sin título"}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
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
        <AvatarStack members={assignees} size="xs" max={3} />
      </div>
    </div>
  );
}

export function ModuleCardStatic({
  module,
  members,
  locked,
}: {
  module: ProjectModule;
  members: TeamMember[];
  locked?: boolean;
}) {
  return <CardInner module={module} members={members} locked={locked} dragging />;
}

interface ModuleCardProps {
  module: ProjectModule;
  members: TeamMember[];
  locked?: boolean;
  onOpen: () => void;
}

export function ModuleCard({ module, members, locked, onOpen }: ModuleCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: module.id,
    data: { type: "module" },
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      className={cn(
        "block w-full cursor-grab touch-none active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
    >
      <CardInner module={module} members={members} locked={locked} />
    </button>
  );
}
