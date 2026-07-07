import { DOC_TYPE_META, type TaskDocType } from "@/lib/data/types";
import { cn } from "@/lib/utils/cn";

/**
 * Compact letter chip for a task's file type (W, PPT, XLS…). Renders nothing
 * when the task has no type — the icon is optional by design.
 *
 * `scale` follows a size-by-importance context (map nodes, task chips) so the
 * badge keeps its proportion next to scaled text. Softly clamped: it must stay
 * legible on the smallest tasks and never shout on the biggest.
 */
export function DocTypeBadge({
  docType,
  className,
  scale = 1,
}: {
  docType: TaskDocType | null;
  className?: string;
  scale?: number;
}) {
  if (!docType) return null;
  const meta = DOC_TYPE_META[docType];
  const s = Math.min(Math.max(scale, 0.8), 1.6);
  return (
    <span
      title={meta.label}
      style={
        s !== 1
          ? { fontSize: 9 * s, height: 16 * s, paddingInline: 4 * s }
          : undefined
      }
      className={cn(
        "inline-flex h-4 shrink-0 items-center rounded border border-line bg-surface-2 px-1 font-mono text-[9px] font-semibold leading-none tracking-wide text-ink-2",
        className,
      )}
    >
      {meta.badge}
    </span>
  );
}
