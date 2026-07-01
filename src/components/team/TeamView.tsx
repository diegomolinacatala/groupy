"use client";

import { UserPlus } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { MemberCard } from "./MemberCard";
import type { TeamMember } from "@/lib/data/types";

export function TeamView() {
  const { project, addMember, updateMember } = useProject();

  const handleToggleCoordinator = (target: TeamMember) => {
    const enabling = !target.isCoordinator;
    // Keep a single coordinator: enabling one clears the others.
    for (const member of project.members) {
      const shouldBe = enabling && member.id === target.id;
      if (member.isCoordinator !== shouldBe) {
        updateMember(member.id, { isCoordinator: shouldBe });
      }
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Equipo</h2>
          <p className="text-sm text-muted">
            {project.members.length}{" "}
            {project.members.length === 1 ? "miembro" : "miembros"} · edita
            cualquier dato al vuelo.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {project.members.map((member) => (
          <MemberCard
            key={member.id}
            member={member}
            onToggleCoordinator={handleToggleCoordinator}
          />
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
