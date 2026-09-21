// Client-side guard for Server Function calls that talk to Supabase.
// A paused/unreachable project either rejects (network error inside the
// action) or never answers until the platform times the function out — both
// used to leave loading screens spinning forever. This turns every such case
// into an ordinary { ok: false, error } the UI already knows how to show.

export const CLOUD_TIMEOUT_MS = 15_000;

export const CLOUD_UNREACHABLE =
  "No se pudo conectar con la nube. Inténtalo de nuevo en un momento o sigue en este dispositivo.";

type Failure = { ok: false; error: string };

export async function callCloud<T extends { ok: boolean }>(
  run: () => Promise<T>,
  timeoutMs: number = CLOUD_TIMEOUT_MS,
): Promise<T | Failure> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Failure>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, error: CLOUD_UNREACHABLE }),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([run(), timeout]);
  } catch {
    return { ok: false, error: CLOUD_UNREACHABLE };
  } finally {
    clearTimeout(timer);
  }
}
