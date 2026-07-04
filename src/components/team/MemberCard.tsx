"use client";

import { Check, Trash2 } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { Avatar } from "@/components/ui/Avatar";
import { InlineText } from "@/components/ui/InlineText";
import { IconButton } from "@/components/ui/IconButton";
import { Popover } from "@/components/ui/Popover";
import { MEMBER_COLORS } from "@/lib/utils/colors";
import type { TeamMember } from "@/lib/data/types";

interface MemberCardProps {
  member: TeamMember;
}

export function MemberCard({ member }: MemberCardProps) {
  const { updateMember, deleteMember } = useProject();

  const handleDelete = () => {
    if (window.confirm(`¿Eliminar a ${member.name || "este miembro"} del equipo?`)) {
      deleteMember(member.id);
    }
  };

  return (
    <div className="relative flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <Popover
          align="start"
          className="w-auto"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-label="Cambiar color"
              className="rounded-full transition-transform hover:scale-105"
            >
              <Avatar member={member} size="lg" />
            </button>
          )}
        >
          {(close) => (
            <div className="grid grid-cols-4 gap-1.5 p-1">
              {MEMBER_COLORS.map((color) => (
                <button
                  key={color.key}
                  type="button"
                  onClick={() => {
                    updateMember(member.id, { colorKey: color.key });
                    close();
                  }}
                  aria-label={color.key}
                  className="grid h-7 w-7 place-items-center rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor: color.bg }}
                >
                  {member.colorKey === color.key && (
                    <Check className="h-3.5 w-3.5" style={{ color: color.ink }} />
                  )}
                </button>
              ))}
            </div>
          )}
        </Popover>

        <div className="min-w-0 flex-1">
          <InlineText
            value={member.name}
            onCommit={(name) => updateMember(member.id, { name })}
            placeholder="Nombre"
            ariaLabel="Nombre del miembro"
            className="-ml-1.5 text-sm font-semibold"
          />
          <InlineText
            value={member.role}
            onCommit={(role) => updateMember(member.id, { role })}
            placeholder="Rol (ej. Diseño)"
            ariaLabel="Rol del miembro"
            className="-ml-1.5 text-xs text-muted"
          />
        </div>

        <div className="flex shrink-0 items-center">
          <IconButton
            label="Eliminar miembro"
            size="sm"
            tone="danger"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <InlineText
        value={member.email}
        onCommit={(email) => updateMember(member.id, { email })}
        placeholder="correo@ejemplo.edu"
        ariaLabel="Correo del miembro"
        className="-ml-1.5 rounded-lg bg-surface-2/60 text-xs text-ink-2"
      />
    </div>
  );
}
