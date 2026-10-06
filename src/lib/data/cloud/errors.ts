// Supabase/network failures reach the UI as raw strings ("TypeError: fetch
// failed", "AbortError…"). Users only need to know the cloud didn't answer;
// anything else (validation / RLS messages) passes through untouched.

export const CLOUD_DOWN_MESSAGE =
  "No se ha podido conectar con el servidor. Inténtalo de nuevo en unos minutos.";

const NETWORK_PATTERNS = [
  "fetch failed",
  "failed to fetch",
  "networkerror",
  "network request failed",
  "enotfound",
  "econnrefused",
  "econnreset",
  "etimedout",
  "aborterror",
  "timeouterror",
  "the operation was aborted",
  "signal timed out",
];

export function friendlyCloudError(message: string | undefined | null): string {
  if (!message) return CLOUD_DOWN_MESSAGE;
  const lower = message.toLowerCase();
  return NETWORK_PATTERNS.some((pattern) => lower.includes(pattern))
    ? CLOUD_DOWN_MESSAGE
    : message;
}
