import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // The local prototype runs entirely on the client (localStorage) with no
  // Supabase project configured yet. Skip session refresh so the middleware
  // never crashes on empty credentials; wire this up in the Auth phase.
  if (!url || !key) {
    return supabaseResponse;
  }

  let sessionResponse = supabaseResponse;
  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          sessionResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            sessionResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the auth token if needed. Do not remove this call, and do not
  // add logic between createServerClient and this call.
  await supabase.auth.getUser();

  return sessionResponse;
}
