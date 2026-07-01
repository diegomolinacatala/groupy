"use client";

import { Check, UserPlus } from "lucide-react";
import { Popover } from "./Popover";
import { Avatar } from "./Avatar";
import { cn } from "@/lib/utils/cn";
import type { TeamMember } from "@/lib/data/types";
import type { ReactNode } from "react";

interface AssigneePickerProps {
  members: TeamMember[];
  selectedIds: string[];
  onToggle: (memberId: string) => void;
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode;
  align?: "start" | "end";
}

export function AssigneePicker({
  members,
  selectedIds,
  onToggle,
  trigger,
  align = "start",
}: AssigneePickerProps) {
  return (
    <Popover trigger={trigger} align={align} className="w-60">
      {() => (
        <div className="max-h-72 overflow-y-auto">
          {members.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-3 py-6 text-center">
              <UserPlus className="h-5 w-5 text-muted-2" />
              <p className="text-xs text-muted">
                Añade miembros en la pestaña Equipo.
              </p>
            </div>
          ) : (
            members.map((member) => {
              const selected = selectedIds.includes(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => onToggle(member.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2",
                    selected && "bg-accent-soft/60",
                  )}
                >
                  <Avatar member={member} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {member.name}
                  </span>
                  {selected && <Check className="h-4 w-4 text-accent" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </Popover>
  );
}
