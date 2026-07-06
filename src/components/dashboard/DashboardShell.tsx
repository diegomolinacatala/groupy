"use client";

import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { PersonalView } from "@/components/personal/PersonalView";
import { OrganizationView } from "@/components/organization/OrganizationView";
import { MapView } from "@/components/map/MapView";
import { CalendarView } from "@/components/calendar/CalendarView";
import { BoardView } from "@/components/board/BoardView";
import { TeamView } from "@/components/team/TeamView";
import { ReportView } from "@/components/report/ReportView";
import { TaskModal } from "@/components/module/TaskModal";

export function DashboardShell() {
  const { isReady } = useProject();
  const { view, viewReady } = useDashboardUi();

  if (!isReady || !viewReady) return <LoadingScreen />;

  return (
    // data-print-flat: printing the Informe needs the fixed-height scroll
    // shell flattened into normal document flow (see globals.css).
    <div data-print-flat className="flex h-screen overflow-hidden bg-canvas">
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
