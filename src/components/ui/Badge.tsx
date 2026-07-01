"use client";

import { cn } from "@/lib/utils/cn";

interface BadgeProps {
  label: string;
  color: string;
  soft: string;
  dot?: boolean;
  className?: string;
}

/** A soft pill used for module type / status. Colours come from token vars. */
export function Badge({ label, color, soft, dot = true, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
      style={{ backgroundColor: soft, color }}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
    </span>
  );
}
