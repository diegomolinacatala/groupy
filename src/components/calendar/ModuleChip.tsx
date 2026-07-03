"use client";

import { useDraggable } from "@dnd-kit/core";
import { Lock } from "lucide-react";
import type { ProjectModule, TeamMember } from "@/lib/data/types";
import { colorForKey } from "@/lib/utils/colors";
import { cn } from "@/lib/utils/cn";

function ChipInner({
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
  const done = module.status === "done";
  // Coloured by its first assignee — the member colour is the app's shared
  // visual language; unassigned tasks stay neutral.
  const owner = members.find((m) => module.assigneeIds.includes(m.id));
  const color = owner ? colorForKey(owner.colorKey) : null;

  return (
    <div
      style={{
        borderLeftColor: color?.bg ?? "var(--color-line-strong)",
        backgroundColor: color ? color.bg + "14" : "var(--color-surface-2)",
      }}
      className={cn(
        "flex items-center gap-1 rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight",
        dragging ? "shadow-pop" : "hover:brightness-[0.98]",
        locked && "opacity-75",
      )}
    >
      {locked && (
        <Lock className="h-3 w-3 shrink-0 text-muted" aria-label="Bloqueada" />
      )}
      {module.status === "in_progress" && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: "var(--color-progress)" }}
        />
      )}
      <span
        className={cn(
          "truncate font-medium text-ink",
          done && "text-muted line-through",
        )}
      >
        {module.title || "Sin título"}
      </span>
    </div>
  );
}

/** Static visual, used inside the DragOverlay while dragging. */
export function ModuleChipStatic({
  module,
  members,
  locked,
}: {
  module: ProjectModule;
  members: TeamMember[];
  locked?: boolean;
}) {
  return <ChipInner module={module} members={members} locked={locked} dragging />;
}

interface ModuleChipProps {
  module: ProjectModule;
  members: TeamMember[];
  locked?: boolean;
  onOpen: () => void;
}

export function ModuleChip({ module, members, locked, onOpen }: ModuleChipProps) {
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
        "block w-full cursor-grab touch-none rounded-md transition-opacity active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
    >
      <ChipInner module={module} members={members} locked={locked} />
    </button>
  );
}
