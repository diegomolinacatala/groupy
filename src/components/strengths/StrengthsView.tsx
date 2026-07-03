"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { Avatar } from "@/components/ui/Avatar";
import type { TeamMember } from "@/lib/data/types";
import { cn } from "@/lib/utils/cn";

// Personal strengths, one card per member. In cloud mode each person edits
// only their own row; the local demo (single device) can edit everyone's.

export function StrengthsView() {
  const { project, mode, currentMemberId, setMemberStrengths } = useProject();

  const canEdit = (member: TeamMember) =>
    mode === "local" || member.id === currentMemberId;

  return (
    <div className="flex h-full flex-col gap-5 p-4 md:p-6">
      <h2 className="type-display text-2xl">Fortalezas</h2>

      <div className="grid max-w-4xl gap-3 md:grid-cols-2">
        {project.members.map((member) => (
          <MemberStrengthsCard
            key={member.id}
            member={member}
            editable={canEdit(member)}
            onChange={(strengths) => setMemberStrengths(member.id, strengths)}
          />
        ))}
      </div>
    </div>
  );
}

function MemberStrengthsCard({
  member,
  editable,
  onChange,
}: {
  member: TeamMember;
  editable: boolean;
  onChange: (strengths: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value || member.strengths.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...member.strengths, value]);
    setDraft("");
  };

  const removeAt = (index: number) =>
    onChange(member.strengths.filter((_, i) => i !== index));

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <header className="mb-3 flex items-center gap-2.5">
        <Avatar member={member} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">
            {member.name}
          </span>
          {member.role && (
            <span className="block truncate text-xs text-muted">
              {member.role}
            </span>
          )}
        </span>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {member.strengths.map((strength, index) => (
          <span
            key={strength}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-line bg-surface-2/60 py-1 text-xs font-medium text-ink-2",
              editable ? "pl-3 pr-1" : "px-3",
            )}
          >
            {strength}
            {editable && (
              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label={`Quitar ${strength}`}
                className="grid h-5 w-5 place-items-center rounded-full text-muted transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {member.strengths.length === 0 && !editable && (
          <span className="py-1 text-xs text-muted-2">Sin declarar</span>
        )}
      </div>

      {editable && (
        <div className="mt-3 flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Añadir fortaleza"
            aria-label={`Añadir fortaleza a ${member.name}`}
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none transition-colors placeholder:text-muted-2 focus:border-accent"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            aria-label="Añadir"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink transition-colors hover:bg-surface-2 disabled:opacity-30"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
    </section>
  );
}
