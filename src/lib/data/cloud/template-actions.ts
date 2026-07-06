"use server";

import { createClient } from "@/lib/supabase/server";
import {
  deleteTemplateInputSchema,
  rpcCreateTemplateResultSchema,
} from "./schemas";

// Teacher-only template mutations. Editing the template's CONTENT (tasks,
// blocks, title, dates) reuses the ordinary dashboard actions — a template is
// a project, and the teacher's RLS policies scope those writes to their own
// is_template rows. Only create/delete need dedicated entry points.

export async function createTeacherTemplate(): Promise<
  { ok: true; templateId: string; joinCode: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_template");
  if (error) {
    if (error.message.includes("TEACHER_ACCOUNT_REQUIRED")) {
      return { ok: false, error: "Necesitas una cuenta de profesor." };
    }
    return { ok: false, error: error.message };
  }

  const result = rpcCreateTemplateResultSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: "Respuesta inesperada del servidor." };
  }
  return {
    ok: true,
    templateId: result.data.project_id,
    joinCode: result.data.join_code,
  };
}

/**
 * Deletes a template (its group + task rows cascade). Groups already spawned
 * from it keep working — their template_id just becomes null.
 */
export async function deleteTeacherTemplate(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = deleteTemplateInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos no válidos." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", parsed.data.templateId)
    .eq("is_template", true)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) {
    return { ok: false, error: "Sin permiso para borrar esta plantilla." };
  }
  return { ok: true };
}
