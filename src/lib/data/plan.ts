import type { Project, ProjectModule, TeamMember } from "./types";
import { IMPORTANCE_DEFAULT } from "./types";
import { nextMemberColorKey } from "@/lib/utils/colors";

// Deterministic project builder: turns the wizard answers into a Project.
// No scaffolding, no invented phases — the team's own task list, unassigned,
// inside a single starting block. Assignment happens by dragging in the
// Organización view.

/** The wizard no longer asks for a title — it starts as this and is edited
 *  in place from the dashboard topbar whenever the team wants. */
export const DEFAULT_PROJECT_TITLE = "Trabajo en grupo";

export interface SetupAnswers {
  memberNames: string[];
  startDate: string; // "yyyy-mm-dd"
  dueDate: string; // "yyyy-mm-dd"
  /** "¿Quién eres?" — index into memberNames; null until chosen. */
  selfIndex: number | null;
  taskNames: string[];
}

function uid(): string {
  return crypto.randomUUID();
}

function buildMembers(answers: SetupAnswers): TeamMember[] {
  const members: TeamMember[] = [];
  for (const rawName of answers.memberNames) {
    const name = rawName.trim();
    if (!name) continue;
    members.push({
      id: uid(),
      name,
      email: "",
      role: "",
      colorKey: nextMemberColorKey(members.map((m) => m.colorKey)),
      isCoordinator: false,
      strengths: [],
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
    title: DEFAULT_PROJECT_TITLE,
    description: "",
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
