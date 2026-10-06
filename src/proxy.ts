import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

// Only the routes that talk to Supabase refresh the session: cloud projects
// and class codes (/p), the teacher area (/profesor) and the wizard's cloud
// save (/setup). The landing and the local demo (/dashboard) skip the auth
// round-trip entirely, so they load instantly even if the backend is slow.
export const config = {
  matcher: ["/p/:path*", "/profesor/:path*", "/setup"],
};
