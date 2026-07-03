"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type DashboardView =
  | "personal"
  | "organization"
  | "map"
  | "calendar"
  | "board"
  | "team"
  | "strengths";

interface DashboardUi {
  view: DashboardView;
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
  initialFocusMemberId = null,
}: {
  children: ReactNode;
  /** Cloud dashboards pass the claimed member so the flow opens "as you". */
  initialFocusMemberId?: string | null;
}) {
  // Organización is the landing tab — the wizard drops you here.
  const [view, setView] = useState<DashboardView>("organization");
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [focusMemberId, setFocusMemberId] = useState<string | null>(
    initialFocusMemberId,
  );
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const value: DashboardUi = {
    view,
    setView,
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
