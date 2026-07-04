"use client";

import { UserPlus } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { MemberCard } from "./MemberCard";

export function TeamView() {
  const { project, addMember } = useProject();

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="type-display text-2xl">Equipo</h2>
          <p className="text-sm text-muted">
            {project.members.length}{" "}
            {project.members.length === 1 ? "miembro" : "miembros"} · edita
            cualquier dato al vuelo.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {project.members.map((member) => (
          <MemberCard key={member.id} member={member} />
        ))}

        <button
          type="button"
          onClick={() => addMember()}
          className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong bg-surface/40 text-muted transition-colors hover:border-accent hover:bg-accent-soft/40 hover:text-accent"
        >
          <UserPlus className="h-6 w-6" />
          <span className="text-sm font-medium">Añadir miembro</span>
        </button>
      </div>
    </div>
  );
}
