import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

// Server-side helper for the teacher role. A TEACHER is a real (non-anonymous)
// Supabase account; students are anonymous sessions and must never pass this
// gate. Used by the /profesor server components — RLS re-checks everything
// anyway, this only decides which screen to render.

export async function getTeacherUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return null;
  return user;
}
