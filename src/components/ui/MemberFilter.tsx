"use client";

import { Avatar } from "./Avatar";
import { cn } from "@/lib/utils/cn";
import type { TeamMember } from "@/lib/data/types";

interface MemberFilterProps {
  members: TeamMember[];
  /** Selected member id; null = todo el equipo. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Member claimed by this session (cloud) — labelled "tú". */
  currentMemberId?: string | null;
}

/** Avatar row to focus the flow/map views on one member. */
export function MemberFilter({
  members,
  value,
  onChange,
  currentMemberId = null,
}: MemberFilterProps) {
  if (members.length === 0) return null;

  return (
    <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-card">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
          value === null
            ? "bg-ink text-canvas"
            : "text-muted hover:bg-surface-2 hover:text-ink",
        )}
      >
        Todos
      </button>
      {members.map((member) => {
        const active = value === member.id;
        const isSelf = member.id === currentMemberId;
        return (
          <button
            key={member.id}
            type="button"
            onClick={() => onChange(active ? null : member.id)}
            title={isSelf ? `${member.name} (tú)` : member.name}
            aria-pressed={active}
            className={cn(
              "rounded-full transition-all",
              active
                ? "ring-2 ring-accent ring-offset-1 ring-offset-surface"
                : "opacity-70 hover:opacity-100",
            )}
          >
            <Avatar member={member} size="sm" />
          </button>
        );
      })}
    </div>
  );
}
