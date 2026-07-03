// Local prototype data model. Intentionally mirrors the Supabase schema in
// CLAUDE.md (projects / group_members / tasks / strengths) so the localStorage
// store can later be swapped for Server Actions without reshaping the UI.

export type ModuleType = "task" | "milestone" | "objective";
export type ModuleStatus = "todo" | "in_progress" | "done";
export type ProjectStatus = "active" | "in_review" | "closed";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  colorKey: string;
  isCoordinator: boolean;
}

/** A "módulo" — the editable card that lives on the calendar / board. */
export interface ProjectModule {
  id: string;
  title: string;
  description: string;
  type: ModuleType;
  status: ModuleStatus;
  dueDate: string | null; // "yyyy-mm-dd"
  assigneeIds: string[];
  checklist: ChecklistItem[];
  /**
   * Direct dependencies ("candado"): ids of modules that must be done before
   * this one unlocks. The derived lock/unlock semantics live in `flow.ts`.
   */
  dependsOn: string[];
  /**
   * Entrega (deliverable block) this module belongs to: the id of a module of
   * type "milestone". Blocks are the second, separate dependency kind — see
   * `flow.ts` for the gating rules. Always null on milestones themselves.
   */
  deliverableId: string | null;
  order: number;
  createdAt: string; // ISO
}

export interface Project {
  id: string;
  title: string;
  description: string;
  startDate: string | null;
  dueDate: string | null;
  status: ProjectStatus;
  strengths: string[];
  members: TeamMember[];
  modules: ProjectModule[];
  updatedAt: string; // ISO
}

export const MODULE_TYPE_META: Record<
  ModuleType,
  { label: string; color: string; soft: string }
> = {
  task: { label: "Tarea", color: "var(--color-task)", soft: "var(--color-task-soft)" },
  milestone: {
    // Milestones double as "entregas": the ordered blocks that group tasks
    // into dependency stages (see flow.ts).
    label: "Entrega",
    color: "var(--color-milestone)",
    soft: "var(--color-milestone-soft)",
  },
  objective: {
    label: "Objetivo",
    color: "var(--color-objective)",
    soft: "var(--color-objective-soft)",
  },
};

export const MODULE_STATUS_META: Record<
  ModuleStatus,
  { label: string; color: string; soft: string }
> = {
  todo: { label: "Pendiente", color: "var(--color-todo)", soft: "var(--color-todo-soft)" },
  in_progress: {
    label: "En curso",
    color: "var(--color-progress)",
    soft: "var(--color-progress-soft)",
  },
  done: { label: "Hecho", color: "var(--color-done)", soft: "var(--color-done-soft)" },
};

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string }> = {
  active: { label: "Activo" },
  in_review: { label: "En revisión" },
  closed: { label: "Cerrado" },
};

export const MODULE_TYPES: ModuleType[] = ["task", "milestone", "objective"];
export const MODULE_STATUSES: ModuleStatus[] = ["todo", "in_progress", "done"];
