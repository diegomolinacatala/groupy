import type { Json, Tables, TablesInsert } from "@/lib/supabase/database.types";
import type {
  ChecklistItem,
  Project,
  ProjectModule,
  TeamMember,
} from "../types";
import type { CreateProjectInput } from "./schemas";

// Pure translation between the normalized DB rows and the prototype's flat
// Project (one project = one implicit group). Safe to import from server and
// client code — no I/O here.

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

function jsonToStrengths(json: Json): string[] {
  if (!Array.isArray(json)) return [];
  return json.filter((s): s is string => typeof s === "string");
}

export function taskRowToModule(row: Tables<"tasks">): ProjectModule {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    dueDate: toIsoDate(row.due_date),
    assigneeIds: row.assignees,
    checklist: jsonToChecklist(row.checklist),
    order: row.sort_order,
    createdAt: row.created_at,
  };
}

export function memberRowToTeamMember(row: Tables<"group_members">): TeamMember {
  return {
    id: row.id,
    name: row.display_name,
    email: row.email,
    role: row.role,
    colorKey: row.color_key,
    isCoordinator: row.is_coordinator,
  };
}

export function rowsToProject(
  project: Tables<"projects">,
  group: Tables<"groups">,
  members: Tables<"group_members">[],
  tasks: Tables<"tasks">[],
): Project {
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    startDate: toIsoDate(project.start_date),
    dueDate: toIsoDate(project.due_at),
    status: project.status,
    strengths: jsonToStrengths(group.strengths),
    members: members.map(memberRowToTeamMember),
    modules: [...tasks]
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.created_at.localeCompare(b.created_at),
      )
      .map(taskRowToModule),
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
    type: module.type,
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
  };
}

/** Wizard-built Project → the create action's input (drops local-only ids). */
export function projectToCreateInput(project: Project): CreateProjectInput {
  return {
    title: project.title,
    description: project.description,
    startDate: project.startDate,
    dueDate: project.dueDate,
    strengths: project.strengths,
    members: project.members,
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
    strengths: input.strengths,
    members: input.members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      color_key: m.colorKey,
      is_coordinator: m.isCoordinator,
    })),
    modules: input.modules.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      type: m.type,
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
  };
}
