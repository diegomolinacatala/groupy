"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DocTypeBadge } from "@/components/ui/DocTypeBadge";
import {
  clampImportance,
  importanceScale,
  type ProjectModule,
} from "@/lib/data/types";
import type { MemberColor } from "@/lib/utils/colors";
import { cn } from "@/lib/utils/cn";

/** Diagonal/horizontal px of resize drag per importance step. */
const RESIZE_STEP_PX = 14;

/** "strip" = content-sized chip (Sin asignar); "column" = full-width card. */
export type ChipVariant = "strip" | "column";

/** Payload on every sortable chip; container droppables carry `containerId` only. */
export interface ChipDragData {
  taskId: string;
  containerId: string;
}

function ChipInner({
  module,
  importance,
  color,
  variant,
  dragging,
}: {
  module: ProjectModule;
  importance: number;
  color?: MemberColor;
  variant: ChipVariant;
  dragging?: boolean;
}) {
  const scale = importanceScale(importance);
  // Importance is rendered purely as size — the number itself never shows.
  const style: CSSProperties = {
    fontSize: 13 * scale,
    padding: `${6 * scale}px ${11 * scale}px`,
    gap: 7 * scale,
  };
  if (color) {
    style.backgroundColor = color.bg + "14";
    style.borderColor = color.bg + "26";
  }

  return (
    <span
      className={cn(
        "flex items-center rounded-lg border text-left leading-snug transition-shadow",
        variant === "column" ? "w-full" : "max-w-72",
        !color && "border-line bg-surface",
        dragging ? "shadow-pop" : "shadow-card",
      )}
      style={style}
    >
      <DocTypeBadge docType={module.docType} />
      <span
        className={cn(
          "min-w-0 font-medium",
          module.status === "done" ? "text-muted line-through" : "text-ink",
          variant === "strip" ? "truncate" : "break-words",
        )}
      >
        {module.title || "Sin título"}
      </span>
    </span>
  );
}

/** Overlay/preview chip — no listeners, always in its "lifted" state. */
export function TaskChipStatic({
  module,
  color,
  variant,
}: {
  module: ProjectModule;
  color?: MemberColor;
  variant: ChipVariant;
}) {
  return (
    <span className={cn("block cursor-grabbing", variant === "strip" && "w-fit")}>
      <ChipInner
        module={module}
        importance={module.importance}
        color={color}
        variant={variant}
        dragging
      />
    </span>
  );
}

interface SortableTaskChipProps {
  module: ProjectModule;
  /** "strip" or the member id — sortable ids are `${containerId}::${taskId}`
   *  so a multi-assignee task can appear in several columns at once. */
  containerId: string;
  variant: ChipVariant;
  color?: MemberColor;
  onOpen: () => void;
  onCommitImportance: (value: number) => void;
}

export function SortableTaskChip({
  module,
  containerId,
  variant,
  color,
  onOpen,
  onCommitImportance,
}: SortableTaskChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: `${containerId}::${module.id}`,
      data: { taskId: module.id, containerId } satisfies ChipDragData,
    });

  // Corner resize gesture: live size preview, committed on pointerup.
  const [preview, setPreview] = useState<number | null>(null);
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    base: number;
  } | null>(null);

  const valueAt = (e: PointerEvent) => {
    const g = gesture.current!;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    // Dominant axis, so pure-horizontal and diagonal drags step alike.
    const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
    return clampImportance(g.base + Math.round(delta / RESIZE_STEP_PX));
  };

  const startResize = (e: PointerEvent<HTMLSpanElement>) => {
    // The handle must never start a dnd drag or a click-to-open.
    e.stopPropagation();
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already released — the resize just won't track.
    }
    gesture.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      base: module.importance,
    };
    setPreview(module.importance);
  };

  const moveResize = (e: PointerEvent<HTMLSpanElement>) => {
    if (gesture.current?.pointerId === e.pointerId) setPreview(valueAt(e));
  };

  const endResize = (e: PointerEvent<HTMLSpanElement>) => {
    if (gesture.current?.pointerId !== e.pointerId) return;
    const value = valueAt(e);
    gesture.current = null;
    setPreview(null);
    if (value !== module.importance) onCommitImportance(value);
  };

  const cancelResize = () => {
    gesture.current = null;
    setPreview(null);
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={onOpen}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group relative block cursor-grab touch-none select-none active:cursor-grabbing",
        variant === "column" ? "w-full" : "max-w-full",
        isDragging && "opacity-30",
      )}
    >
      <ChipInner
        module={module}
        importance={preview ?? module.importance}
        color={color}
        variant={variant}
      />
      <span
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={cancelResize}
        onLostPointerCapture={cancelResize}
        onClick={(e) => e.stopPropagation()}
        aria-hidden
        className={cn(
          "absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize touch-none rounded-full border shadow-card transition-opacity",
          preview !== null
            ? "border-accent bg-accent-soft opacity-100"
            : "border-line-strong bg-surface opacity-0 group-hover:opacity-100",
        )}
      />
    </button>
  );
}
