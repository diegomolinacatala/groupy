import type { Json, Tables, TablesInsert } from "@/lib/supabase/database.types";
import type {
  ChecklistItem,
  Project,
  ProjectBlock,
  ProjectModule,
  TaskDocType,
  TeamMember,
} from "../types";
import { clampImportance, DOC_TYPE_META } from "../types";
import type { CreateProjectInput } from "./schemas";

// Pure translation between the normalized DB rows and the prototype's flat
// Project (one project = one implicit group). Safe to import from server and
// client code — no I/O here.
//
// Blocks piggyback on the existing schema: a BLOQUE is stored as a `tasks`
// row of type "milestone" (title = name, sort_order = order, description =
// mode). The flow fields (depends_on, block_id, importance, doc_type,
// map_x/map_y) have real columns since the task-flow migration; dangling
// references (a dep or block that no longer exists) are normalized on read,
// never treated as errors.

/** timestamptz / date column → the prototype's "yyyy-mm-dd" (null-safe). */
export function toIsoDate(value: string | null): string | null {
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
export function jsonToMemberStrengths(json: Json): Record<string, string[]> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const record: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(json)) {
    if (Array.isArray(value)) {
      record[key] = value.filter((s): s is string => typeof s === "string");
    }
  }
  return record;
}

/** The DB check constraint guarantees valid values; narrow defensively. */
function toDocType(value: string | null): TaskDocType | null {
  return value && value in DOC_TYPE_META ? (value as TaskDocType) : null;
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
    dependsOn: row.depends_on,
    blockId: row.block_id,
    importance: clampImportance(row.importance),
    docType: toDocType(row.doc_type),
    mapX: row.map_x,
    mapY: row.map_y,
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

  // Normalize dangling references: a blockId pointing at a deleted block
  // falls back to the first block, deps to deleted tasks are dropped.
  const taskRows = sorted.filter((t) => t.type !== "milestone");
  const taskIds = new Set(taskRows.map((t) => t.id));
  const blockIds = new Set(blocks.map((b) => b.id));

  return {
    id: project.id,
    title: project.title,
    description: project.description,
    startDate: toIsoDate(project.start_date),
    dueDate: toIsoDate(project.due_at),
    status: project.status,
    blocks,
    members: members.map((m) => memberRowToTeamMember(m, strengths)),
    modules: taskRows.map((t) => {
      const mod = taskRowToModule(t);
      return {
        ...mod,
        blockId:
          mod.blockId && blockIds.has(mod.blockId)
            ? mod.blockId
            : firstBlockId,
        dependsOn: mod.dependsOn.filter((id) => taskIds.has(id)),
      };
    }),
    // Write-only in the UI (nothing reads it back); refreshed by the reducer.
    updatedAt: new Date().toISOString(),
  };
}

export function moduleToTaskRow(
  groupId: string,
  module: ProjectModule,
  origin?: string | null,
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
    depends_on: module.dependsOn,
    block_id: module.blockId,
    importance: clampImportance(module.importance),
    doc_type: module.docType,
    map_x: module.mapX,
    map_y: module.mapY,
    last_origin: origin ?? null,
    created_at: module.createdAt,
    // done_at is deliberately absent: a DB trigger stamps/clears it on status
    // transitions so clients can't forge completion times.
  };
}

export function blockToTaskRow(
  groupId: string,
  block: ProjectBlock,
  origin?: string | null,
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
    last_origin: origin ?? null,
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
        depends_on: m.dependsOn,
        block_id: m.blockId,
        importance: m.importance,
        doc_type: m.docType,
        map_x: m.mapX,
        map_y: m.mapY,
      })),
    ],
  };
}
