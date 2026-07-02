import type { Project } from "./types";
import { createSeedProject } from "./seed";

// localStorage-backed persistence for the local prototype. Isolated here so the
// rest of the app never touches storage directly — a future Supabase data layer
// can replace this module wholesale.

const STORAGE_KEY = "groupy:project:v1";

/** Whether a project has already been created / seeded on this device. */
export function hasStoredProject(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function loadProject(): Project {
  if (typeof window === "undefined") return createSeedProject();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = createSeedProject();
      saveProject(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw) as Project;
    if (!parsed || !Array.isArray(parsed.modules)) {
      throw new Error("Malformed project payload");
    }
    return parsed;
  } catch {
    // Corrupt or incompatible payload — reset to a fresh seed rather than crash.
    const seeded = createSeedProject();
    saveProject(seeded);
    return seeded;
  }
}

export function saveProject(project: Project): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // Storage full / unavailable (private mode). The in-memory state still works
    // for the session; nothing else to do for a local prototype.
  }
}

export function resetProject(): Project {
  const seeded = createSeedProject();
  saveProject(seeded);
  return seeded;
}
