"use client";

import { Fragment, useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Tooltip explaining why the option is disabled. */
  disabledReason?: string;
  /** Extra label classes while this option is selected (e.g. a status tint). */
  activeClassName?: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  /** Equal-width segments filling the container (iOS style). */
  stretch?: boolean;
  className?: string;
}

// iOS-style segmented control: an inset track with a raised thumb that
// SLIDES to the selected segment. Hairline dividers separate the options
// and fade out next to the selection, like Apple's.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  stretch = false,
  className,
}: SegmentedProps<T>) {
  const thumbId = useId();
  const reducedMotion = useReducedMotion();
  const activeIndex = options.findIndex((option) => option.value === value);

  return (
    <div
      className={cn(
        "rounded-[10px] bg-surface-3/70 p-0.5",
        stretch ? "flex w-full" : "inline-flex",
        size === "sm" ? "text-[13px]" : "text-sm",
        className,
      )}
    >
      {options.map((option, index) => {
        const active = index === activeIndex;
        // A divider touching the thumb disappears (the Apple detail).
        const dividerHidden =
          activeIndex === index || activeIndex === index - 1;
        return (
          <Fragment key={option.value}>
            {index > 0 && (
              <span
                aria-hidden
                className={cn(
                  "my-auto h-[55%] w-px shrink-0 rounded-full bg-line-strong transition-opacity duration-200",
                  dividerHidden && "opacity-0",
                )}
              />
            )}
            <button
              type="button"
              aria-pressed={active}
              disabled={option.disabled}
              title={option.disabled ? option.disabledReason : undefined}
              onClick={() => onChange(option.value)}
              className={cn(
                "relative rounded-lg px-3 font-medium transition-colors duration-150",
                size === "sm" ? "py-1" : "py-1.5",
                stretch && "flex-1",
                active ? "text-ink" : "text-muted hover:text-ink",
                active && option.activeClassName,
                option.disabled &&
                  "cursor-not-allowed text-muted-2 hover:text-muted-2",
              )}
            >
              {active && (
                <motion.span
                  layoutId={thumbId}
                  aria-hidden
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 520, damping: 42 }
                  }
                  className="absolute inset-0 rounded-lg border border-line bg-surface shadow-card"
                />
              )}
              <span className="relative z-10 whitespace-nowrap">
                {option.label}
              </span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
