import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Landing for the teacher's sign-up confirmation e-mail. Supabase has already
// confirmed the address by the time the link lands here; this only tries to
// open the session right away (PKCE `code`, or a `token_hash` template) so the
// teacher arrives signed in. If that isn't possible — e.g. the mail was opened
// on another device — /profesor just asks them to sign in, with a note that
// the account is confirmed.

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let signedIn = false;
  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      signedIn = !error;
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      signedIn = !error;
    }
  } catch {
    signedIn = false;
  }

  const target = new URL("/profesor", origin);
  if (!signedIn) {
    target.searchParams.set(
      "confirmado",
      searchParams.has("error_description") ? "error" : "1",
    );
  }
  return NextResponse.redirect(target);
}
