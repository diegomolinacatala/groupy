"use client";

import { colorForKey, initialsFromName } from "@/lib/utils/colors";
import { cn } from "@/lib/utils/cn";
import type { TeamMember } from "@/lib/data/types";

const SIZES = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
} as const;

interface AvatarProps {
  member: Pick<TeamMember, "name" | "colorKey" | "isCoordinator">;
  size?: keyof typeof SIZES;
  ring?: boolean;
  title?: string;
}

export function Avatar({ member, size = "md", ring, title }: AvatarProps) {
  const color = colorForKey(member.colorKey);
  return (
    <span
      title={title ?? member.name}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-full font-semibold",
        SIZES[size],
        ring && "ring-2 ring-white",
      )}
      style={{ backgroundColor: color.bg, color: color.ink }}
    >
      {initialsFromName(member.name)}
    </span>
  );
}

interface AvatarStackProps {
  members: TeamMember[];
  size?: keyof typeof SIZES;
  max?: number;
}

export function AvatarStack({ members, size = "sm", max = 4 }: AvatarStackProps) {
  if (members.length === 0) return null;
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((m) => (
        <Avatar key={m.id} member={m} size={size} ring />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-surface-3 font-semibold text-muted ring-2 ring-white",
            SIZES[size],
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
