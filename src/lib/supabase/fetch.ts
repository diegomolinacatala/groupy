// Server-side fetch for Supabase with a hard deadline. supabase-js has no
// timeout of its own: a paused or struggling project would otherwise hold a
// page render (or a Server Function) open until the platform kills it. With
// this, the request fails fast and the UI shows its normal error state.

const SERVER_FETCH_TIMEOUT_MS = 10_000;

export const fetchWithTimeout: typeof fetch = (input, init) => {
  const deadline = AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, deadline])
    : deadline;
  return fetch(input, { ...init, signal });
};
