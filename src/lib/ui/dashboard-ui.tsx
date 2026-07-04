"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type DashboardView =
  | "personal"
  | "organization"
  | "map"
  | "calendar"
  | "board"
  | "team";

const VIEWS: readonly string[] = [
  "personal",
  "organization",
  "map",
  "calendar",
  "board",
  "team",
];

// --- Per-project tab memory --------------------------------------------------
// The active tab lives in sessionStorage so a reload stays where you were; a
// localStorage "visited" flag makes Organización the landing only the FIRST
// time — returning to a known project opens Principal. Exposed as a tiny
// external store so React reads it via useSyncExternalStore (SSR-safe, no
// setState-in-effect). A memory fallback keeps things working when storage
// is unavailable (private mode).

const viewKey = (scope: string) => `groupy:view:${scope}`;
const visitedKey = (scope: string) => `groupy:visited:${scope}`;

const tabListeners = new Set<() => void>();
const memoryTabs = new Map<string, DashboardView>();

function subscribeTab(onChange: () => void): () => void {
  tabListeners.add(onChange);
  return () => {
    tabListeners.delete(onChange);
  };
}

function readTab(scope: string): DashboardView | null {
  try {
    const stored = window.sessionStorage.getItem(viewKey(scope));
    if (stored && VIEWS.includes(stored)) return stored as DashboardView;
  } catch {
    // Fall through to the in-memory copy.
  }
  return memoryTabs.get(scope) ?? null;
}

function writeTab(scope: string, view: DashboardView): void {
  memoryTabs.set(scope, view);
  try {
    window.sessionStorage.setItem(viewKey(scope), view);
  } catch {
    // Memory copy already updated — the tab still works for this session.
  }
  for (const listener of tabListeners) listener();
}

interface DashboardUi {
  view: DashboardView;
  /** False until the stored tab is read on the client (SSR-safe). */
  viewReady: boolean;
  setView: (view: DashboardView) => void;

  editingModuleId: string | null;
  openModule: (id: string) => void;
  closeModule: () => void;

  /** Member the flow/map views focus on; null = todo el equipo. */
  focusMemberId: string | null;
  setFocusMemberId: (id: string | null) => void;

  year: number;
  month: number; // 0-indexed
  setMonth: (year: number, month: number) => void;
  goToToday: () => void;
}

const DashboardUiContext = createContext<DashboardUi | null>(null);

// Memoization is handled by the React Compiler — no manual useMemo/useCallback.
export function DashboardUiProvider({
  children,
  scope = "local",
  initialFocusMemberId = null,
}: {
  children: ReactNode;
  /** Storage scope for tab memory: "local" or the cloud join code. */
  scope?: string;
  /** Cloud dashboards pass the claimed member so the flow opens "as you". */
  initialFocusMemberId?: string | null;
}) {
  const view = useSyncExternalStore(
    subscribeTab,
    () => readTab(scope),
    () => null,
  );
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [focusMemberId, setFocusMemberId] = useState<string | null>(
    initialFocusMemberId,
  );
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Seed the tab once per tab-session: Organización only on the project's
  // very first visit on this device, Principal on every return. Reloads and
  // in-session navigation keep whatever tab was stored.
  useEffect(() => {
    if (readTab(scope) === null) {
      let visited = false;
      try {
        visited = window.localStorage.getItem(visitedKey(scope)) !== null;
      } catch {
        // No localStorage: treat as a return visit.
        visited = true;
      }
      writeTab(scope, visited ? "personal" : "organization");
    }
    try {
      window.localStorage.setItem(visitedKey(scope), "1");
    } catch {
      // Best effort — worst case the next visit lands on Organización again.
    }
  }, [scope]);

  const value: DashboardUi = {
    view: view ?? "personal",
    viewReady: view !== null,
    setView: (next) => writeTab(scope, next),
    editingModuleId,
    openModule: (id) => setEditingModuleId(id),
    closeModule: () => setEditingModuleId(null),
    focusMemberId,
    setFocusMemberId,
    year: cursor.year,
    month: cursor.month,
    setMonth: (year, month) => setCursor({ year, month }),
    goToToday: () => {
      const today = new Date();
      setCursor({ year: today.getFullYear(), month: today.getMonth() });
    },
  };

  return (
    <DashboardUiContext.Provider value={value}>
      {children}
    </DashboardUiContext.Provider>
  );
}

export function useDashboardUi(): DashboardUi {
  const ctx = useContext(DashboardUiContext);
  if (!ctx) {
    throw new Error("useDashboardUi must be used within a DashboardUiProvider");
  }
  return ctx;
}
