// Local prototype data model. Intentionally mirrors the Supabase schema in
// CLAUDE.md (projects / group_members / tasks) so the localStorage store can
// later be swapped for Server Actions without reshaping the UI.
//
// Two concepts, never mixed:
//  - TAREA (`ProjectModule`): a small named box, optionally typed (W, PPT…).
//  - BLOQUE (`ProjectBlock`): a CONTAINER grouping tasks — a mini-project.
//    Not a node in the dependency graph, not a special task. Each task
//    belongs to exactly one block; each block is "En orden" (sequential) or
//    "Independiente" (always available). Derived gating lives in `flow.ts`.

export type ModuleStatus = "todo" | "in_progress" | "done";
export type ProjectStatus = "active" | "in_review" | "closed";

/** Sequencing of a block relative to the other "En orden" blocks. */
export type BlockMode = "sequence" | "independent";

/** Optional file-type icon on a task (W, PPT, XLS…). */
export type TaskDocType = "doc" | "slides" | "sheet" | "pdf" | "code" | "image";

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
  /** Personal strengths, declared on entry (wizard / who-are-you). */
  strengths: string[];
}

/** A BLOQUE: container of tasks. Rendered as a section, never as a node. */
export interface ProjectBlock {
  id: string;
  name: string;
  mode: BlockMode;
  order: number;
}

/**
 * A TAREA. The legacy name `ProjectModule` is kept to avoid churning every
 * import — since the block redesign there are no milestone/objective modules,
 * only tasks.
 */
export interface ProjectModule {
  id: string;
  title: string;
  description: string;
  status: ModuleStatus;
  dueDate: string | null; // "yyyy-mm-dd"
  assigneeIds: string[];
  checklist: ChecklistItem[];
  /**
   * Direct task→task dependencies (the padlock): ids of tasks that must be
   * done before this one unlocks. Block ordering is a SEPARATE mechanism —
   * see `flow.ts`.
   */
  dependsOn: string[];
  /**
   * Block this task belongs to. The data layer normalizes every task into a
   * real block; null is only tolerated transiently (stale payloads).
   */
  blockId: string | null;
  /** 1–10, continuous. Shown as size in Organización, edited by resizing. */
  importance: number;
  docType: TaskDocType | null;
  /**
   * Free position on the block's corkboard (Mapa), stored as fractions of
   * the board (0–1) so placement survives resizes. Null = auto-layout by
   * dependency depth until the task is first dragged.
   */
  mapX: number | null;
  mapY: number | null;
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
  blocks: ProjectBlock[];
  members: TeamMember[];
  modules: ProjectModule[];
  updatedAt: string; // ISO
}

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
  done: { label: "Hecha", color: "var(--color-done)", soft: "var(--color-done-soft)" },
};

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string }> = {
  active: { label: "Activo" },
  in_review: { label: "En revisión" },
  closed: { label: "Cerrado" },
};

export const BLOCK_MODE_META: Record<BlockMode, { label: string }> = {
  sequence: { label: "En orden" },
  independent: { label: "Independiente" },
};

/** Compact letter badge per file type — sober, no icons needed. */
export const DOC_TYPE_META: Record<TaskDocType, { label: string; badge: string }> = {
  doc: { label: "Documento", badge: "W" },
  slides: { label: "Presentación", badge: "PPT" },
  sheet: { label: "Hoja de cálculo", badge: "XLS" },
  pdf: { label: "PDF", badge: "PDF" },
  code: { label: "Código", badge: "</>" },
  image: { label: "Imagen", badge: "IMG" },
};

export const DOC_TYPES: TaskDocType[] = [
  "doc",
  "slides",
  "sheet",
  "pdf",
  "code",
  "image",
];

export const MODULE_STATUSES: ModuleStatus[] = ["todo", "in_progress", "done"];

export const IMPORTANCE_MIN = 1;
export const IMPORTANCE_MAX = 10;
export const IMPORTANCE_DEFAULT = 5;

export function clampImportance(value: number): number {
  if (!Number.isFinite(value)) return IMPORTANCE_DEFAULT;
  // Continuous, not stepped: the resize gesture may land on any value
  // between min and max (5.37 is a perfectly fine importance).
  return Math.min(IMPORTANCE_MAX, Math.max(IMPORTANCE_MIN, value));
}

/**
 * Visual scale for a task's importance: 1.0 at the default, ~0.86 at 1,
 * ~1.35 at 10. Sensible range — importance is a nuance, not a shout.
 */
export function importanceScale(value: number): number {
  return 1 + (clampImportance(value) - IMPORTANCE_DEFAULT) * 0.07;
}
