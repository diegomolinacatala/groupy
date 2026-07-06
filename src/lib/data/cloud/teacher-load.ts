import { createClient } from "@/lib/supabase/server";
import type { Project } from "../types";
import { rowsToProject } from "./mapping";
import { teacherOverviewSchema, type TeacherTemplate } from "./schemas";

// Server-side loaders for the teacher surfaces (/profesor). Reads go through
// the teacher's own RLS view: template rows are visible because they own
// them; live group work stays invisible because no policy ever grants it.

export type TeacherOverviewResult =
  | { state: "unauthenticated" }
  | { state: "error"; message: string }
  | { state: "ready"; templates: TeacherTemplate[] };

export async function loadTeacherOverview(): Promise<TeacherOverviewResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_teacher_overview");
  if (error) return { state: "error", message: error.message };
  // The RPC answers null for anonymous / signed-out callers.
  if (data === null) return { state: "unauthenticated" };

  const parsed = teacherOverviewSchema.safeParse(data);
  if (!parsed.success) {
    return { state: "error", message: "Respuesta inesperada del servidor." };
  }
  return { state: "ready", templates: parsed.data };
}

export interface TemplateEditorContext {
  projectId: string;
  groupId: string;
  joinCode: string;
}

export type TemplateEditorResult =
  | { state: "not_found" }
  | { state: "error"; message: string }
  | { state: "ready"; project: Project; ctx: TemplateEditorContext };

/** Loads one template for its owner's editor (same shape as a dashboard). */
export async function loadTemplateEditor(
  templateId: string,
): Promise<TemplateEditorResult> {
  const supabase = await createClient();

  const projectRes = await supabase
    .from("projects")
    .select("*")
    .eq("id", templateId)
    .eq("is_template", true)
    .maybeSingle();
  if (projectRes.error) {
    return { state: "error", message: projectRes.error.message };
  }
  // RLS hides other teachers' templates → same "not found" as a bad id.
  if (!projectRes.data) return { state: "not_found" };

  const groupRes = await supabase
    .from("groups")
    .select("*")
    .eq("project_id", templateId)
    .order("created_at")
    .limit(1);
  if (groupRes.error) {
    return { state: "error", message: groupRes.error.message };
  }
  const group = groupRes.data[0];
  if (!group) {
    return { state: "error", message: "La plantilla no tiene contenedor." };
  }

  const tasksRes = await supabase
    .from("tasks")
    .select("*")
    .eq("group_id", group.id)
    .order("sort_order")
    .order("created_at");
  if (tasksRes.error) {
    return { state: "error", message: tasksRes.error.message };
  }

  return {
    state: "ready",
    project: rowsToProject(projectRes.data, group, [], tasksRes.data),
    ctx: {
      projectId: projectRes.data.id,
      groupId: group.id,
      joinCode: projectRes.data.join_code,
    },
  };
}
