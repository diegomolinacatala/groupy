import type { Project, ProjectBlock } from "./types";
import { clampImportance, IMPORTANCE_DEFAULT } from "./types";
import { createSeedProject } from "./seed";

// localStorage-backed persistence for the local prototype. Isolated here so the
// rest of the app never touches storage directly — a future Supabase data layer
// can replace this module wholesale.

// v2: the block redesign (blocks[], blockId, importance, docType, per-member
// strengths) replaced the milestone/entrega model. Old v1 payloads are
// abandoned — the demo reseeds rather than migrating throwaway data.
const STORAGE_KEY = "groupy:project:v2";
const IDENTITY_KEY = "groupy:me:v1";

/**
 * Backfills fields added after a payload was stored, and restores the model
 * invariant that every task lives in exactly one existing block.
 */
function normalizeProject(parsed: Project): Project {
  const blocks: ProjectBlock[] = Array.isArray(parsed.blocks)
    ? parsed.blocks
    : [];
  if (blocks.length === 0) {
    blocks.push({ id: crypto.randomUUID(), name: "General", mode: "independent", order: 0 });
  }
  const blockIds = new Set(blocks.map((b) => b.id));
  const firstBlockId = [...blocks].sort((a, b) => a.order - b.order)[0].id;
  return {
    ...parsed,
    blocks,
    members: parsed.members.map((m) => ({
      ...m,
      strengths: Array.isArray(m.strengths) ? m.strengths : [],
    })),
    modules: parsed.modules.map((m) => ({
      ...m,
      dependsOn: Array.isArray(m.dependsOn) ? m.dependsOn : [],
      blockId:
        typeof m.blockId === "string" && blockIds.has(m.blockId)
          ? m.blockId
          : firstBlockId,
      importance:
        typeof m.importance === "number"
          ? clampImportance(m.importance)
          : IMPORTANCE_DEFAULT,
      docType: typeof m.docType === "string" ? m.docType : null,
      mapX: typeof m.mapX === "number" ? Math.min(1, Math.max(0, m.mapX)) : null,
      mapY: typeof m.mapY === "number" ? Math.min(1, Math.max(0, m.mapY)) : null,
    })),
  };
}

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
    return normalizeProject(parsed);
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

/**
 * Identity of the local (demo) user: which member "soy yo". Cloud mode gets
 * this from the claimed member row instead; these helpers are local-only.
 * Exposed as a tiny external store so React reads it via
 * useSyncExternalStore (hydration-safe, no setState-in-effect).
 */
const identityListeners = new Set<() => void>();

export function subscribeLocalIdentity(onChange: () => void): () => void {
  identityListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    identityListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function loadLocalIdentity(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(IDENTITY_KEY);
  } catch {
    return null;
  }
}

export function saveLocalIdentity(memberId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (memberId) window.localStorage.setItem(IDENTITY_KEY, memberId);
    else window.localStorage.removeItem(IDENTITY_KEY);
  } catch {
    // Best effort — the picker will just ask again next session.
  }
  for (const listener of identityListeners) listener();
}
