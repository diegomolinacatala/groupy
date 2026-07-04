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

/** Payload on every sortable chip; container droppables carry `containerId` only. */
export interface ChipDragData {
  taskId: string;
  containerId: string;
}

function ChipInner({
  module,
  importance,
  color,
  dragging,
}: {
  module: ProjectModule;
  importance: number;
  color?: MemberColor;
  dragging?: boolean;
}) {
  const scale = importanceScale(importance);
  // Importance is rendered purely as size — the number itself never shows.
  // The chip hugs its text (width = whatever the title needs), so importance
  // reads as font + padding scale; ragged widths are the point.
  const style: CSSProperties = {
    width: "fit-content",
    maxWidth: "100%",
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
        !color && "border-line bg-surface",
        dragging ? "shadow-pop" : "shadow-card",
      )}
      style={style}
    >
      <DocTypeBadge docType={module.docType} />
      <span
        className={cn(
          "min-w-0 font-medium break-words",
          module.status === "done" ? "text-muted line-through" : "text-ink",
        )}
      >
        {module.title || "Sin título"}
      </span>
    </span>
  );
}

/** Overlay/preview chip — no listeners, picked up with the lift animation. */
export function TaskChipStatic({
  module,
  color,
}: {
  module: ProjectModule;
  color?: MemberColor;
}) {
  return (
    <span className="animate-pick block w-fit cursor-grabbing">
      <ChipInner
        module={module}
        importance={module.importance}
        color={color}
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
  color?: MemberColor;
  onOpen: () => void;
  onCommitImportance: (value: number) => void;
}

export function SortableTaskChip({
  module,
  containerId,
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
    // Bottom-LEFT corner: pulling outward (left or down) grows the chip.
    // Dominant axis, so pure-horizontal and diagonal drags step alike.
    const delta = Math.abs(dx) >= Math.abs(dy) ? -dx : dy;
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
        "group relative block w-fit max-w-full cursor-grab touch-none select-none active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
    >
      <ChipInner
        module={module}
        importance={preview ?? module.importance}
        color={color}
      />
      {/* Resize handle: the bottom-left corner of the chip drawn THICKER
          (like a wall), always visible — drag it outward to grow the task. */}
      <span
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={cancelResize}
        onLostPointerCapture={cancelResize}
        onClick={(e) => e.stopPropagation()}
        aria-hidden
        style={{
          borderColor:
            preview !== null
              ? "var(--color-accent)"
              : color?.bg ?? "var(--color-line-strong)",
        }}
        className={cn(
          "absolute -bottom-px -left-px h-4 w-4 cursor-nesw-resize touch-none rounded-bl-lg border-b-[3px] border-l-[3px] transition-opacity",
          preview !== null ? "opacity-100" : "opacity-60 group-hover:opacity-100",
        )}
      />
    </button>
  );
}
