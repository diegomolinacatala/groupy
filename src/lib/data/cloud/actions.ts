"use server";

import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import {
  claimInputSchema,
  createProjectInputSchema,
  deleteMemberInputSchema,
  deleteTaskInputSchema,
  memberInputSchema,
  rpcClaimResultSchema,
  rpcCreateResultSchema,
  strengthsInputSchema,
  updateProjectInputSchema,
  upsertTaskInputSchema,
} from "./schemas";
import { moduleToTaskRow, toRpcPayload } from "./mapping";

// Server Functions for the cloud slice. Expected failures are RETURN VALUES
// ({ ok: false, error }), never throws — the mirror logs them and the local
// state stays usable. Authorization lives in RLS + the SECURITY DEFINER RPCs;
// the checks here only produce friendlier errors.

type Supabase = Awaited<ReturnType<typeof createClient>>;

const INVALID_INPUT = { ok: false as const, error: "Datos no válidos." };
const NO_SESSION = {
  ok: false as const,
  error: "No hay sesión en este dispositivo.",
};

/**
 * First write from a device mints its anonymous session (cookie set is legal
 * inside a Server Function). Everything RLS does afterwards keys on this uid.
 */
async function ensureUser(supabase: Supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return user;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) return null;
  return data.user;
}

export async function createCloudProject(
  input: unknown,
): Promise<
  | { ok: true; joinCode: string; projectId: string }
  | { ok: false; error: string }
> {
  const parsed = createProjectInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const supabase = await createClient();
  const user = await ensureUser(supabase);
  if (!user) {
    return {
      ok: false,
      error:
        "No se pudo crear la sesión anónima. ¿Está activado «Anonymous sign-ins» en Supabase?",
    };
  }

  const { data, error } = await supabase.rpc("create_project_with_group", {
    payload: toRpcPayload(parsed.data),
  });
  if (error) return { ok: false, error: error.message };

  const result = rpcCreateResultSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: "Respuesta inesperada del servidor." };
  }
  return {
    ok: true,
    joinCode: result.data.join_code,
    projectId: result.data.project_id,
  };
}

export async function claimCloudMember(
  input: unknown,
): Promise<{ ok: true; joinCode: string } | { ok: false; error: string }> {
  const parsed = claimInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const supabase = await createClient();
  const user = await ensureUser(supabase);
  if (!user) {
    return {
      ok: false,
      error:
        "No se pudo crear la sesión anónima. ¿Está activado «Anonymous sign-ins» en Supabase?",
    };
  }

  const { data, error } = await supabase.rpc("claim_member", {
    p_member_id: parsed.data.memberId,
  });
  if (error) return { ok: false, error: humanizeClaimError(error.message) };

  const result = rpcClaimResultSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: "Respuesta inesperada del servidor." };
  }
  return { ok: true, joinCode: result.data.join_code };
}

function humanizeClaimError(message: string): string {
  if (message.includes("ALREADY_CLAIMED")) {
    return "Otra persona ya ha entrado con ese nombre.";
  }
  if (message.includes("ALREADY_MEMBER")) {
    return "Este dispositivo ya está dentro del grupo con otro nombre.";
  }
  if (message.includes("MEMBER_NOT_FOUND")) {
    return "Ese miembro ya no existe en el proyecto.";
  }
  return message;
}

export async function updateCloudProject(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateProjectInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NO_SESSION;

  const { patch } = parsed.data;
  const row: TablesUpdate<"projects"> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.startDate !== undefined) row.start_date = patch.startDate;
  if (patch.dueDate !== undefined) row.due_at = patch.dueDate;
  if (patch.status !== undefined) row.status = patch.status;
  if (Object.keys(row).length === 0) return { ok: true };

  const { data, error } = await supabase
    .from("projects")
    .update(row)
    .eq("id", parsed.data.projectId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return { ok: false, error: "Sin permiso para editar este proyecto." };
  }
  return { ok: true };
}

export async function setCloudStrengths(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = strengthsInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("groups")
    .update({ strengths: parsed.data.strengths })
    .eq("id", parsed.data.groupId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return { ok: false, error: "Sin permiso para editar este grupo." };
  }
  return { ok: true };
}

export async function upsertCloudTask(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = upsertTaskInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .upsert(moduleToTaskRow(parsed.data.groupId, parsed.data.module))
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return { ok: false, error: "Sin permiso para editar esta tarea." };
  }
  return { ok: true };
}

export async function deleteCloudTask(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = deleteTaskInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", parsed.data.taskId)
    .eq("group_id", parsed.data.groupId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function addCloudMember(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = memberInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const { groupId, member } = parsed.data;
  const supabase = await createClient();
  // auth_uid stays null on purpose: the new teammate claims their own row
  // later; RLS rejects inserts that try to pre-bind an identity.
  const { data, error } = await supabase
    .from("group_members")
    .insert({
      id: member.id,
      group_id: groupId,
      display_name: member.name,
      email: member.email,
      role: member.role,
      color_key: member.colorKey,
      is_coordinator: member.isCoordinator,
    })
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return { ok: false, error: "Sin permiso para añadir miembros." };
  }
  return { ok: true };
}

export async function updateCloudMember(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = memberInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const { groupId, member } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_members")
    .update({
      display_name: member.name,
      email: member.email,
      role: member.role,
      color_key: member.colorKey,
      is_coordinator: member.isCoordinator,
    })
    .eq("id", member.id)
    .eq("group_id", groupId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return { ok: false, error: "Sin permiso para editar este miembro." };
  }
  return { ok: true };
}

export async function deleteCloudMember(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = deleteMemberInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const { groupId, memberId, taskPatches } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("id", memberId)
    .eq("group_id", groupId);
  if (error) return { ok: false, error: error.message };

  // Mirror the reducer's cascade: detach the member from every task that
  // referenced them. Errors here are non-fatal (worst case a dangling uuid
  // in assignees, which the mapping layer tolerates).
  for (const patch of taskPatches) {
    await supabase
      .from("tasks")
      .update({ assignees: patch.assigneeIds })
      .eq("id", patch.id)
      .eq("group_id", groupId);
  }
  return { ok: true };
}
