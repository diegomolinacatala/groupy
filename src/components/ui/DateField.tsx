"use client";

import { cn } from "@/lib/utils/cn";

interface DateFieldProps {
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
  ariaLabel?: string;
}

/** Native date input — zero-friction, matches our "yyyy-mm-dd" storage. */
export function DateField({
  value,
  onChange,
  className,
  ariaLabel,
}: DateFieldProps) {
  return (
    <input
      type="date"
      aria-label={ariaLabel}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={cn(
        "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink outline-none transition-colors focus:border-accent",
        className,
      )}
    />
  );
}
