import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchWithTimeout } from "@/lib/supabase/fetch";

// Daily heartbeat (vercel.json → crons). Supabase's free tier pauses a
// project after ~7 days without traffic, which took the whole cloud app down
// between work sessions. One tiny read per day keeps it awake for the pilot.
// Read-only and idempotent: it asks the public code-preview RPC for a code
// that can never exist (codes are 7 chars), so it touches no real data.

export async function GET(request: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that env var
  // is set; without it the endpoint stays open (it can't leak or change data).
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { ok: false, error: "Supabase no está configurado" },
      { status: 500 },
    );
  }

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithTimeout },
  });
  const { error } = await supabase.rpc("get_project_by_code", {
    p_code: "KEEPALIVE",
  });

  if (error) {
    console.error("[keepalive] Supabase did not answer:", error.message);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
