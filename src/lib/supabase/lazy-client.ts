// The browser Supabase client (auth + realtime + postgrest, ~100 KB gz) is only
// needed by CLOUD dashboards. Loading it through this dynamic import keeps it
// out of the local demo's bundle; cloud pages fetch it on first use (it's a
// singleton, so later calls resolve instantly).

export type BrowserClient = ReturnType<typeof import("./client").createClient>;

export function loadBrowserClient(): Promise<BrowserClient> {
  return import("./client").then((mod) => mod.createClient());
}
