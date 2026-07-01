"use client";

import { ProjectProvider } from "@/lib/data/ProjectProvider";
import { DashboardUiProvider } from "@/lib/ui/dashboard-ui";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default function DashboardPage() {
  return (
    <ProjectProvider>
      <DashboardUiProvider>
        <DashboardShell />
      </DashboardUiProvider>
    </ProjectProvider>
  );
}
