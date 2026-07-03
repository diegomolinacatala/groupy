import type { Project, ProjectModule, TeamMember } from "./types";
import { IMPORTANCE_DEFAULT } from "./types";
import { nextMemberColorKey } from "@/lib/utils/colors";

// Deterministic project builder: turns the wizard answers into a Project.
// No scaffolding, no invented phases — the team's own task list, unassigned,
// inside a single starting block. Assignment happens by dragging in the
// Organización view.

export interface SetupAnswers {
  title: string;
  description: string; // objetivos
  memberNames: string[]; // first entry acts as coordinator
  startDate: string; // "yyyy-mm-dd"
  dueDate: string; // "yyyy-mm-dd"
  /** "¿Quién eres?" — index into memberNames; null until chosen. */
  selfIndex: number | null;
  /** Personal strengths of the chosen member. */
  selfStrengths: string[];
  taskNames: string[];
}

function uid(): string {
  return crypto.randomUUID();
}

function buildMembers(answers: SetupAnswers): TeamMember[] {
  const members: TeamMember[] = [];
  for (const [index, rawName] of answers.memberNames.entries()) {
    const name = rawName.trim();
    if (!name) continue;
    members.push({
      id: uid(),
      name,
      email: "",
      role: index === 0 ? "Coordinación" : "",
      colorKey: nextMemberColorKey(members.map((m) => m.colorKey)),
      isCoordinator: index === 0,
      strengths:
        index === answers.selfIndex
          ? answers.selfStrengths.map((s) => s.trim()).filter(Boolean)
          : [],
    });
  }
  return members;
}

/** Builds the project: members, one starting block, the entered tasks. */
export function buildProjectPlan(answers: SetupAnswers): Project {
  const members = buildMembers(answers);
  const blockId = uid();
  const now = new Date().toISOString();

  const modules: ProjectModule[] = answers.taskNames
    .map((name) => name.trim())
    .filter(Boolean)
    .map((title, order) => ({
      id: uid(),
      title,
      description: "",
      status: "todo" as const,
      dueDate: null,
      assigneeIds: [],
      checklist: [],
      dependsOn: [],
      blockId,
      importance: IMPORTANCE_DEFAULT,
      docType: null,
      mapX: null,
      mapY: null,
      order,
      createdAt: now,
    }));

  return {
    id: uid(),
    title: answers.title.trim() || "Trabajo en grupo",
    description: answers.description.trim(),
    startDate: answers.startDate,
    dueDate: answers.dueDate,
    status: "active",
    blocks: [{ id: blockId, name: "General", mode: "independent", order: 0 }],
    members,
    modules,
    updatedAt: now,
  };
}

/** The member the wizard user picked as "yo" (id resolved after building). */
export function chosenMemberId(
  answers: SetupAnswers,
  project: Project,
): string | null {
  if (answers.selfIndex === null) return null;
  return project.members[answers.selfIndex]?.id ?? null;
}
