"use client";

import { cn } from "@/lib/utils/cn";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Tooltip explaining why the option is disabled. */
  disabledReason?: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: SegmentedProps<T>) {
  return (
    <div
      className={cn(
        "inline-flex rounded-xl bg-surface-2 p-0.5",
        size === "sm" ? "text-[13px]" : "text-sm",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            title={option.disabled ? option.disabledReason : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 font-medium transition-colors duration-150",
              active
                ? "bg-surface text-ink shadow-card"
                : "text-muted hover:text-ink",
              option.disabled &&
                "cursor-not-allowed text-muted-2 hover:text-muted-2",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
