"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Teacher auth (email + password — locked decision; magic link / Google are
// deferred). Same contract as the rest of the cloud actions: expected
// failures are RETURN VALUES with Spanish, user-facing messages.
//
// Signing in REPLACES whatever session the browser holds — including a
// student's anonymous one. That is intentional: a device is either a
// student's or the teacher's; claim_member refuses non-anonymous sessions,
// so a signed-in teacher can never occupy a student seat.

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
});

type AuthResult =
  | { ok: true; needsEmailConfirmation: boolean }
  | { ok: false; error: string };

export async function signUpTeacher(input: unknown): Promise<AuthResult> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisa el correo y usa una contraseña de al menos 8 caracteres.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: humanizeAuthError(error.message) };

  // With email confirmation enabled Supabase returns a user but no session:
  // the teacher confirms by mail and then signs in normally.
  return { ok: true, needsEmailConfirmation: data.session === null };
}

export async function signInTeacher(input: unknown): Promise<AuthResult> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Revisa el correo y la contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: humanizeAuthError(error.message) };
  return { ok: true, needsEmailConfirmation: false };
}

export async function signOutTeacher(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  return { ok: !error };
}

function humanizeAuthError(message: string): string {
  if (message.includes("Invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (message.includes("already registered")) {
    return "Ya existe una cuenta con ese correo. Prueba a entrar.";
  }
  if (message.includes("Email not confirmed")) {
    return "Confirma tu correo antes de entrar (revisa la bandeja de entrada).";
  }
  if (message.toLowerCase().includes("rate limit")) {
    return "Demasiados intentos. Espera un momento y vuelve a probar.";
  }
  return message;
}
