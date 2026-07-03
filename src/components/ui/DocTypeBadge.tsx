import { DOC_TYPE_META, type TaskDocType } from "@/lib/data/types";
import { cn } from "@/lib/utils/cn";

/**
 * Compact letter chip for a task's file type (W, PPT, XLS…). Renders nothing
 * when the task has no type — the icon is optional by design.
 */
export function DocTypeBadge({
  docType,
  className,
}: {
  docType: TaskDocType | null;
  className?: string;
}) {
  if (!docType) return null;
  const meta = DOC_TYPE_META[docType];
  return (
    <span
      title={meta.label}
      className={cn(
        "inline-flex h-4 shrink-0 items-center rounded border border-line bg-surface-2 px-1 font-mono text-[9px] font-semibold leading-none tracking-wide text-ink-2",
        className,
      )}
    >
      {meta.badge}
    </span>
  );
}
