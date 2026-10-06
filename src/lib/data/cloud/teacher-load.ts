import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import type { Project } from "../types";
import { rowsToProject } from "./mapping";
import {
  reportPayloadSchema,
  teacherOverviewSchema,
  type TeacherTemplate,
} from "./schemas";
import { friendlyCloudError } from "./errors";

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
  if (error) return { state: "error", message: friendlyCloudError(error.message) };
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
    return { state: "error", message: friendlyCloudError(projectRes.error.message) };
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
    return { state: "error", message: friendlyCloudError(groupRes.error.message) };
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
    return { state: "error", message: friendlyCloudError(tasksRes.error.message) };
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

// --- Delivered reports --------------------------------------------------------
// The teacher's ONLY window into a group's work: the snapshot the group chose
// to hand in (submit_group_report). Readable through reports_teacher_select;
// live rows stay invisible exactly as before.

/** Group join code → ISO time its latest report was delivered. */
export async function loadTeacherDeliveries(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const reportsRes = await supabase
    .from("reports")
    .select("project_id, generated_at");
  if (reportsRes.error) {
    // Non-blocking: the home still renders, just without delivery marks.
    console.error("[teacher] reports unavailable:", reportsRes.error.message);
    return {};
  }
  if (reportsRes.data.length === 0) return {};

  const ids = [...new Set(reportsRes.data.map((r) => r.project_id))];
  const projectsRes = await supabase
    .from("projects")
    .select("id, join_code")
    .in("id", ids);
  if (projectsRes.error) {
    console.error("[teacher] report projects unavailable:", projectsRes.error.message);
    return {};
  }

  const codeById = new Map(projectsRes.data.map((p) => [p.id, p.join_code]));
  const deliveries: Record<string, string> = {};
  for (const report of reportsRes.data) {
    const code = codeById.get(report.project_id);
    if (code) deliveries[code] = report.generated_at;
  }
  return deliveries;
}

export type TeacherReportResult =
  | { state: "not_found" }
  | { state: "not_delivered"; title: string; joinCode: string }
  | { state: "error"; message: string }
  | {
      state: "ready";
      project: Project;
      joinCode: string;
      submittedAt: string;
    };

/** One group's delivered report, rebuilt into a Project for the renderer. */
export async function loadTeacherReport(
  code: string,
): Promise<TeacherReportResult> {
  const supabase = await createClient();

  // RLS: a teacher sees the project rows of groups spawned from their own
  // templates (meta only) — anyone else's code resolves to nothing.
  const projectRes = await supabase
    .from("projects")
    .select("id, title, join_code")
    .eq("join_code", code.toUpperCase())
    .eq("is_template", false)
    .maybeSingle();
  if (projectRes.error) {
    return { state: "error", message: friendlyCloudError(projectRes.error.message) };
  }
  if (!projectRes.data) return { state: "not_found" };

  const reportRes = await supabase
    .from("reports")
    .select("generated_at, payload")
    .eq("project_id", projectRes.data.id)
    .maybeSingle();
  if (reportRes.error) {
    return { state: "error", message: friendlyCloudError(reportRes.error.message) };
  }
  if (!reportRes.data) {
    return {
      state: "not_delivered",
      title: projectRes.data.title,
      joinCode: projectRes.data.join_code,
    };
  }

  const payload = reportPayloadSchema.safeParse(reportRes.data.payload);
  if (!payload.success) {
    return { state: "error", message: "El informe entregado no se puede leer." };
  }

  try {
    const project = rowsToProject(
      payload.data.project as unknown as Tables<"projects">,
      payload.data.group as unknown as Tables<"groups">,
      payload.data.members as unknown as Tables<"group_members">[],
      payload.data.tasks as unknown as Tables<"tasks">[],
    );
    return {
      state: "ready",
      project,
      joinCode: projectRes.data.join_code,
      submittedAt: reportRes.data.generated_at,
    };
  } catch (error) {
    console.error("[teacher] report snapshot unreadable:", error);
    return { state: "error", message: "El informe entregado no se puede leer." };
  }
}
