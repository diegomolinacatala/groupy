"use client";

import { useDraggable } from "@dnd-kit/core";
import { Lock } from "lucide-react";
import { MODULE_TYPE_META, type ProjectModule } from "@/lib/data/types";
import { cn } from "@/lib/utils/cn";

function ChipInner({
  module,
  dragging,
  locked,
}: {
  module: ProjectModule;
  dragging?: boolean;
  locked?: boolean;
}) {
  const meta = MODULE_TYPE_META[module.type];
  const done = module.status === "done";
  return (
    <div
      style={{ borderLeftColor: meta.color, backgroundColor: meta.soft }}
      className={cn(
        "flex items-center gap-1 rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight",
        dragging ? "shadow-pop" : "hover:brightness-[0.98]",
        locked && "opacity-75",
      )}
    >
      {locked && (
        <Lock
          className="h-3 w-3 shrink-0 text-muted"
          aria-label="Bloqueada por dependencias"
        />
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
  locked,
}: {
  module: ProjectModule;
  locked?: boolean;
}) {
  return <ChipInner module={module} locked={locked} dragging />;
}

interface ModuleChipProps {
  module: ProjectModule;
  locked?: boolean;
  onOpen: () => void;
}

export function ModuleChip({ module, locked, onOpen }: ModuleChipProps) {
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
      <ChipInner module={module} locked={locked} />
    </button>
  );
}
