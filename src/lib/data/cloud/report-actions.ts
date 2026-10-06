"use server";

import { createClient } from "@/lib/supabase/server";
import { friendlyCloudError } from "./errors";
import {
  reportDeliveryInputSchema,
  rpcSubmitReportResultSchema,
} from "./schemas";

// Report delivery, student side: a group spawned from a class code hands its
// Informe to the teacher. The snapshot itself is built by the
// submit_group_report RPC from the real rows (never from client data); these
// actions only resolve the caller's group and translate errors.

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Failure = { ok: false; error: string };

export type ReportDeliveryStatus =
  | { ok: true; canDeliver: boolean; submittedAt: string | null }
  | Failure;

const INVALID: Failure = { ok: false, error: "Código de proyecto no válido." };

const MIGRATION_PENDING =
  "La entrega al profesor aún no está activada en el servidor. Mientras tanto, descargad el PDF y entregadlo a mano.";

/** The caller's group behind a share code, through their own RLS view. */
async function resolveGroup(
  supabase: Supabase,
  joinCode: string,
): Promise<
  | { ok: true; groupId: string; fromClassCode: boolean }
  | Failure
> {
  const projectRes = await supabase
    .from("projects")
    .select("id, template_id")
    .eq("join_code", joinCode.toUpperCase())
    .eq("is_template", false)
    .maybeSingle();
  if (projectRes.error) {
    return { ok: false, error: friendlyCloudError(projectRes.error.message) };
  }
  if (!projectRes.data) {
    return { ok: false, error: "No formas parte de este proyecto." };
  }

  const groupRes = await supabase
    .from("groups")
    .select("id")
    .eq("project_id", projectRes.data.id)
    .order("created_at")
    .limit(1);
  if (groupRes.error) {
    return { ok: false, error: friendlyCloudError(groupRes.error.message) };
  }
  const group = groupRes.data[0];
  if (!group) return { ok: false, error: "El grupo del proyecto no existe." };

  return {
    ok: true,
    groupId: group.id,
    fromClassCode: projectRes.data.template_id !== null,
  };
}

/** Can this group deliver (it came from a class code) and has it already? */
export async function getReportDelivery(
  input: unknown,
): Promise<ReportDeliveryStatus> {
  const parsed = reportDeliveryInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  const supabase = await createClient();
  const group = await resolveGroup(supabase, parsed.data.joinCode);
  if (!group.ok) return group;
  if (!group.fromClassCode) {
    return { ok: true, canDeliver: false, submittedAt: null };
  }

  const reportRes = await supabase
    .from("reports")
    .select("generated_at")
    .eq("group_id", group.groupId)
    .maybeSingle();
  if (reportRes.error) {
    return { ok: false, error: friendlyCloudError(reportRes.error.message) };
  }
  return {
    ok: true,
    canDeliver: true,
    submittedAt: reportRes.data?.generated_at ?? null,
  };
}

/** Snapshots the group's work and hands it to the teacher (latest wins). */
export async function submitReportToTeacher(
  input: unknown,
): Promise<{ ok: true; submittedAt: string } | Failure> {
  const parsed = reportDeliveryInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  const supabase = await createClient();
  const group = await resolveGroup(supabase, parsed.data.joinCode);
  if (!group.ok) return group;

  const { data, error } = await supabase.rpc("submit_group_report", {
    p_group_id: group.groupId,
  });
  if (error) return { ok: false, error: humanizeSubmitError(error) };

  const result = rpcSubmitReportResultSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: "Respuesta inesperada del servidor." };
  }
  return { ok: true, submittedAt: result.data.submitted_at };
}

function humanizeSubmitError(error: { code?: string; message: string }): string {
  // PostgREST: the RPC isn't in the schema cache → migration not applied yet.
  if (
    error.code === "PGRST202" ||
    error.message.includes("Could not find the function")
  ) {
    return MIGRATION_PENDING;
  }
  if (error.message.includes("NOT_A_MEMBER")) {
    return "Solo los miembros del grupo pueden entregar el informe.";
  }
  if (error.message.includes("NO_TEACHER")) {
    return "Este proyecto no se creó con un código de clase, así que no hay profesor al que entregarlo. Descargad el PDF.";
  }
  return friendlyCloudError(error.message);
}
