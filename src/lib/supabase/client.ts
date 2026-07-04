import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // Live cursors/drags broadcast at ~12 msg/s while moving; the client
      // default (10/s) would silently drop bursts.
      realtime: { params: { eventsPerSecond: 40 } },
    },
  );
}
