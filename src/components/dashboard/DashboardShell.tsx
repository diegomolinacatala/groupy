"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { PersonalView } from "@/components/personal/PersonalView";
import { OrganizationView } from "@/components/organization/OrganizationView";
import { TaskModal } from "@/components/module/TaskModal";

// Principal and Organización are the landing tabs, so they ship with the
// page. The other views are split into their own chunks: they download in the
// background once the dashboard is idle (see prefetchViews), so switching tabs
// stays instant without making the first load pay for all of them.
const loadMap = () => import("@/components/map/MapView");
const loadCalendar = () => import("@/components/calendar/CalendarView");
const loadBoard = () => import("@/components/board/BoardView");
const loadTeam = () => import("@/components/team/TeamView");
const loadReport = () => import("@/components/report/ReportView");

function ViewLoading() {
  return (
    <div className="flex h-full min-h-60 items-center justify-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  );
}

const MapView = dynamic(() => loadMap().then((m) => m.MapView), {
  loading: ViewLoading,
});
const CalendarView = dynamic(
  () => loadCalendar().then((m) => m.CalendarView),
  { loading: ViewLoading },
);
const BoardView = dynamic(() => loadBoard().then((m) => m.BoardView), {
  loading: ViewLoading,
});
const TeamView = dynamic(() => loadTeam().then((m) => m.TeamView), {
  loading: ViewLoading,
});
const ReportView = dynamic(() => loadReport().then((m) => m.ReportView), {
  loading: ViewLoading,
});

/** Warm every lazy view once the browser has nothing better to do. */
function prefetchViews(): () => void {
  const run = () => {
    for (const load of [loadMap, loadCalendar, loadBoard, loadTeam, loadReport]) {
      void load().catch(() => {
        // Offline / flaky network: the view simply loads on first open.
      });
    }
  };
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const timer = window.setTimeout(run, 1500);
  return () => window.clearTimeout(timer);
}

export function DashboardShell() {
  const { isReady } = useProject();
  const { view, viewReady } = useDashboardUi();
  const ready = isReady && viewReady;

  useEffect(() => {
    if (ready) return prefetchViews();
  }, [ready]);

  if (!ready) return <LoadingScreen />;

  return (
    // data-print-flat: printing the Informe needs the fixed-height scroll
    // shell flattened into normal document flow (see globals.css).
    <div data-print-flat className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar />
      <div data-print-flat className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main data-print-flat className="min-h-0 flex-1 overflow-y-auto">
          {view === "personal" && <PersonalView />}
          {view === "organization" && <OrganizationView />}
          {view === "map" && <MapView />}
          {view === "calendar" && <CalendarView />}
          {view === "board" && <BoardView />}
          {view === "team" && <TeamView />}
          {view === "report" && <ReportView />}
        </main>
      </div>
      <TaskModal />
    </div>
  );
}
