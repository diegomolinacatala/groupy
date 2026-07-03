import { createClient } from "@/lib/supabase/server";
import type { Project } from "../types";
import { rowsToProject } from "./mapping";
import { projectPreviewSchema, type ProjectPreview } from "./schemas";

// Server-side loader for /p/[code]. The preview RPC works for anyone holding
// the code (that's the point of a share code); the full load below it only
// succeeds once RLS recognizes the caller as a claimed group member.

export interface CloudProjectContext {
  projectId: string;
  groupId: string;
  memberId: string;
  joinCode: string;
}

export type CloudProjectResult =
  | { state: "not_found" }
  | { state: "error"; message: string }
  | { state: "who_are_you"; preview: ProjectPreview }
  | { state: "ready"; project: Project; ctx: CloudProjectContext };

export async function loadCloudProject(
  code: string,
): Promise<CloudProjectResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_project_by_code", {
    p_code: code,
  });
  if (error) return { state: "error", message: error.message };
  if (data === null) return { state: "not_found" };

  const preview = projectPreviewSchema.safeParse(data);
  if (!preview.success) {
    return { state: "error", message: "Respuesta inesperada del servidor." };
  }

  const memberId = preview.data.my_member_id;
  if (!memberId) return { state: "who_are_you", preview: preview.data };

  const projectId = preview.data.project.id;
  const [projectRes, groupRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase
      .from("groups")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at")
      .limit(1),
  ]);
  if (projectRes.error) {
    return { state: "error", message: projectRes.error.message };
  }
  const group = groupRes.data?.[0];
  if (!group) {
    return { state: "error", message: "El grupo del proyecto no existe." };
  }

  const [membersRes, tasksRes] = await Promise.all([
    supabase
      .from("group_members")
      .select("*")
      .eq("group_id", group.id)
      .order("created_at")
      .order("id"),
    supabase
      .from("tasks")
      .select("*")
      .eq("group_id", group.id)
      .order("sort_order")
      .order("created_at"),
  ]);
  if (membersRes.error) {
    return { state: "error", message: membersRes.error.message };
  }
  if (tasksRes.error) {
    return { state: "error", message: tasksRes.error.message };
  }

  return {
    state: "ready",
    project: rowsToProject(
      projectRes.data,
      group,
      membersRes.data,
      tasksRes.data,
    ),
    ctx: {
      projectId,
      groupId: group.id,
      memberId,
      joinCode: preview.data.project.join_code,
    },
  };
}
