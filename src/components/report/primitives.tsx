"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

// Small presentational pieces shared across the report sections. The report
// is a formal DOCUMENT, so these lean on hairlines, overlines and the serif
// display face rather than app chrome.

/** Numbered section heading: "01 · Resumen" over a hairline. */
export function ReportSectionTitle({
  index,
  title,
}: {
  index: string;
  title: string;
}) {
  return (
    <div className="mt-10 border-t border-line pt-4">
      <p className="type-overline">
        <span className="text-muted-2">{index}</span>
        <span className="mx-2 text-muted-2">·</span>
        {title}
      </p>
    </div>
  );
}

/** Big figure with an overline label — the executive numbers strip. */
export function ReportStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="type-overline">{label}</p>
      <p className="type-display mt-1 text-3xl leading-none text-ink">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Thin labeled progress bar. `color` fills the track; label sits above. */
export function ReportBar({
  label,
  percent,
  color,
  className,
}: {
  label: string;
  percent: number;
  color: string;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-ink-2">{label}</span>
        <span className="text-xs tabular-nums text-muted">{clamped}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

/** Tiny 1–10 weight gauge used in the appendix table. */
export function WeightDash({ importance }: { importance: number }) {
  const fraction = Math.min(1, Math.max(0, importance / 10));
  return (
    <span
      title={`Importancia ${importance.toFixed(1).replace(/\.0$/, "")} de 10`}
      className="inline-block h-1 w-10 overflow-hidden rounded-full bg-surface-3 align-middle"
    >
      <span
        className="block h-full rounded-full bg-ink/50"
        style={{ width: `${fraction * 100}%` }}
      />
    </span>
  );
}

/** dt/dd pair for the cover meta grid. */
export function ReportMeta({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="type-overline">{label}</dt>
      <dd className={cn("mt-1 text-sm font-medium text-ink")}>{value}</dd>
    </div>
  );
}
