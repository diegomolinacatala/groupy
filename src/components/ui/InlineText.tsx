"use client";

import { cn } from "@/lib/utils/cn";

interface InlineTextProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Focus on mount — for "type right away" flows (e.g. a just-created task). */
  autoFocus?: boolean;
}

const autoGrow = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};

/**
 * Text that reads as plain content but edits in place — the low-friction
 * editing primitive used across the panel. Uncontrolled (keyed on `value`) so
 * external updates re-seed it without a sync effect. Commits on blur / Enter.
 */
export function InlineText({
  value,
  onCommit,
  placeholder,
  multiline = false,
  ariaLabel,
  className,
  autoFocus = false,
}: InlineTextProps) {
  const commit = (next: string) => {
    if (next !== value) onCommit(next);
  };

  const base = cn(
    "editable w-full bg-transparent px-1.5 py-1 outline-none placeholder:text-muted-2",
    className,
  );

  if (multiline) {
    return (
      <textarea
        key={value}
        ref={autoGrow}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        defaultValue={value}
        placeholder={placeholder}
        rows={1}
        onInput={(e) => autoGrow(e.currentTarget)}
        onBlur={(e) => commit(e.currentTarget.value)}
        className={cn(base, "resize-none")}
      />
    );
  }

  return (
    <input
      key={value}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      defaultValue={value}
      placeholder={placeholder}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
      className={base}
    />
  );
}
