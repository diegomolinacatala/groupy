import type { Json, Tables, TablesInsert } from "@/lib/supabase/database.types";
import type {
  ChecklistItem,
  Project,
  ProjectBlock,
  ProjectModule,
  TeamMember,
} from "../types";
import { IMPORTANCE_DEFAULT } from "../types";
import type { CreateProjectInput } from "./schemas";

// Pure translation between the normalized DB rows and the prototype's flat
// Project (one project = one implicit group). Safe to import from server and
// client code — no I/O here.
//
// Blocks piggyback on the existing schema: a BLOQUE is stored as a `tasks`
// row of type "milestone" (title = name, sort_order = order, description =
// mode). No new columns needed, and the create RPC passes them through.
//
// KNOWN GAP (extends the pre-redesign one): `tasks` has no columns for
// `block_id` / `depends_on` / `importance` / `doc_type` yet. Cloud projects
// read defaults for those (every task lands in the first block) and edits to
// them are NOT mirrored — local/session state only. Next step: a migration
// adding the four columns (+ grants in the cloud-slice style), regenerate
// `database.types.ts`, then flip the readers/writers below.

/** timestamptz / date column → the prototype's "yyyy-mm-dd" (null-safe). */
function toIsoDate(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

/** Defensive decode: checklist is client-shaped jsonb, so validate each item. */
function jsonToChecklist(json: Json): ChecklistItem[] {
  if (!Array.isArray(json)) return [];
  const items: ChecklistItem[] = [];
  for (const entry of json) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const { id, text, done } = entry;
      if (
        typeof id === "string" &&
        typeof text === "string" &&
        typeof done === "boolean"
      ) {
        items.push({ id, text, done });
      }
    }
  }
  return items;
}

/**
 * `groups.strengths` holds a per-member record { [memberId]: string[] }.
 * Legacy rows hold the old flat array — read as "nobody declared yet".
 */
function jsonToMemberStrengths(json: Json): Record<string, string[]> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const record: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(json)) {
    if (Array.isArray(value)) {
      record[key] = value.filter((s): s is string => typeof s === "string");
    }
  }
  return record;
}

export function taskRowToModule(row: Tables<"tasks">): ProjectModule {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    dueDate: toIsoDate(row.due_date),
    assigneeIds: row.assignees,
    checklist: jsonToChecklist(row.checklist),
    // KNOWN GAP fields — see the header note.
    dependsOn: [],
    blockId: null,
    importance: IMPORTANCE_DEFAULT,
    docType: null,
    order: row.sort_order,
    createdAt: row.created_at,
  };
}

/** A milestone row is a stored BLOQUE (see the header note). */
export function taskRowToBlock(row: Tables<"tasks">): ProjectBlock {
  return {
    id: row.id,
    name: row.title,
    mode: row.description === "independent" ? "independent" : "sequence",
    order: row.sort_order,
  };
}

export function memberRowToTeamMember(
  row: Tables<"group_members">,
  strengths: Record<string, string[]>,
): TeamMember {
  return {
    id: row.id,
    name: row.display_name,
    email: row.email,
    role: row.role,
    colorKey: row.color_key,
    isCoordinator: row.is_coordinator,
    strengths: strengths[row.id] ?? [],
  };
}

export function rowsToProject(
  project: Tables<"projects">,
  group: Tables<"groups">,
  members: Tables<"group_members">[],
  tasks: Tables<"tasks">[],
): Project {
  const sorted = [...tasks].sort(
    (a, b) =>
      a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  );
  const blocks = sorted
    .filter((t) => t.type === "milestone")
    .map(taskRowToBlock);
  // Projects saved before the block redesign have no block rows; give them a
  // starting block so the "exactly one block" invariant holds client-side.
  if (blocks.length === 0) {
    blocks.push({
      id: crypto.randomUUID(),
      name: "General",
      mode: "independent",
      order: 0,
    });
  }
  const firstBlockId = blocks[0].id;
  const strengths = jsonToMemberStrengths(group.strengths);

  return {
    id: project.id,
    title: project.title,
    description: project.description,
    startDate: toIsoDate(project.start_date),
    dueDate: toIsoDate(project.due_at),
    status: project.status,
    blocks,
    members: members.map((m) => memberRowToTeamMember(m, strengths)),
    modules: sorted
      .filter((t) => t.type !== "milestone")
      .map((t) => ({ ...taskRowToModule(t), blockId: firstBlockId })),
    // Write-only in the UI (nothing reads it back); refreshed by the reducer.
    updatedAt: new Date().toISOString(),
  };
}

export function moduleToTaskRow(
  groupId: string,
  module: ProjectModule,
): TablesInsert<"tasks"> {
  return {
    id: module.id,
    group_id: groupId,
    title: module.title,
    description: module.description,
    type: "task",
    status: module.status,
    due_date: module.dueDate,
    sort_order: module.order,
    checklist: module.checklist.map((c) => ({
      id: c.id,
      text: c.text,
      done: c.done,
    })),
    assignees: module.assigneeIds,
    created_at: module.createdAt,
    // done_at is deliberately absent: a DB trigger stamps/clears it on status
    // transitions so clients can't forge completion times.
    // dependsOn / blockId / importance / docType are absent — KNOWN GAP.
  };
}

export function blockToTaskRow(
  groupId: string,
  block: ProjectBlock,
): TablesInsert<"tasks"> {
  return {
    id: block.id,
    group_id: groupId,
    title: block.name,
    description: block.mode,
    type: "milestone",
    status: "todo",
    due_date: null,
    sort_order: block.order,
    checklist: [],
    assignees: [],
  };
}

/** Wizard-built Project → the create action's input (drops local-only ids). */
export function projectToCreateInput(project: Project): CreateProjectInput {
  return {
    title: project.title,
    description: project.description,
    startDate: project.startDate,
    dueDate: project.dueDate,
    members: project.members,
    blocks: project.blocks,
    modules: project.modules,
  };
}

/** camelCase input → the snake_case jsonb payload create_project_with_group expects. */
export function toRpcPayload(input: CreateProjectInput): Json {
  return {
    title: input.title,
    description: input.description,
    start_date: input.startDate,
    due_date: input.dueDate,
    // The RPC only accepts the legacy array shape here; per-member strengths
    // are written post-claim through setCloudMemberStrengths.
    strengths: [],
    members: input.members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      color_key: m.colorKey,
      is_coordinator: m.isCoordinator,
    })),
    modules: [
      ...input.blocks.map((b) => ({
        id: b.id,
        title: b.name,
        description: b.mode,
        type: "milestone",
        status: "todo",
        due_date: null,
        sort_order: b.order,
        checklist: [],
        assignees: [],
      })),
      ...input.modules.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        type: "task",
        status: m.status,
        due_date: m.dueDate,
        sort_order: m.order,
        checklist: m.checklist.map((c) => ({
          id: c.id,
          text: c.text,
          done: c.done,
        })),
        assignees: m.assigneeIds,
      })),
    ],
  };
}
