"use client";

import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { FlowView } from "@/components/flow/FlowView";
import { MapView } from "@/components/map/MapView";
import { OverviewView } from "@/components/overview/OverviewView";
import { CalendarView } from "@/components/calendar/CalendarView";
import { BoardView } from "@/components/board/BoardView";
import { TeamView } from "@/components/team/TeamView";
import { StrengthsView } from "@/components/strengths/StrengthsView";
import { ModuleEditor } from "@/components/module/ModuleEditor";

export function DashboardShell() {
  const { isReady } = useProject();
  const { view } = useDashboardUi();

  if (!isReady) return <LoadingScreen />;

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto">
          {view === "flow" && <FlowView />}
          {view === "map" && <MapView />}
          {view === "overview" && <OverviewView />}
          {view === "calendar" && <CalendarView />}
          {view === "board" && <BoardView />}
          {view === "team" && <TeamView />}
          {view === "strengths" && <StrengthsView />}
        </main>
      </div>
      <ModuleEditor />
    </div>
  );
}
