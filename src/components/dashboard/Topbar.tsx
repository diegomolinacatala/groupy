"use client";

import { CalendarClock, Plus } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import { InlineText } from "@/components/ui/InlineText";
import { AvatarStack } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Popover } from "@/components/ui/Popover";
import { Badge } from "@/components/ui/Badge";
import { NAV } from "./nav";
import { cn } from "@/lib/utils/cn";
import { formatShort } from "@/lib/utils/dates";
import {
  PROJECT_STATUS_META,
  type ProjectStatus,
} from "@/lib/data/types";

const STATUS_COLOR: Record<ProjectStatus, { color: string; soft: string }> = {
  active: { color: "var(--color-done)", soft: "var(--color-done-soft)" },
  in_review: {
    color: "var(--color-progress)",
    soft: "var(--color-progress-soft)",
  },
  closed: { color: "var(--color-todo)", soft: "var(--color-todo-soft)" },
};

const STATUS_ORDER: ProjectStatus[] = ["active", "in_review", "closed"];

export function Topbar() {
  const { project, updateProject, addModule } = useProject();
  const { view, setView, openModule } = useDashboardUi();

  const statusStyle = STATUS_COLOR[project.status];

  const handleAdd = () => {
    const id = addModule();
    openModule(id);
  };

  return (
    <header className="shrink-0 border-b border-line bg-surface/80 backdrop-blur">
      {/* Mobile view switcher (sidebar is hidden below md) */}
      <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 md:hidden">
        {NAV.map((item) => (
          <button
            key={item.view}
            type="button"
            onClick={() => setView(item.view)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
              view === item.view
                ? "bg-accent-soft text-accent"
                : "text-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-6">
        <div className="min-w-0 flex-1">
          <InlineText
            value={project.title}
            onCommit={(title) => updateProject({ title })}
            placeholder="Título del proyecto"
            ariaLabel="Título del proyecto"
            className="type-display -ml-1.5 text-xl md:text-2xl"
          />
          <div className="ml-0.5 mt-0.5 flex items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              Entrega {formatShort(project.dueDate)}
            </span>

            <Popover
              align="start"
              trigger={({ toggle }) => (
                <button type="button" onClick={toggle}>
                  <Badge
                    label={PROJECT_STATUS_META[project.status].label}
                    color={statusStyle.color}
                    soft={statusStyle.soft}
                  />
                </button>
              )}
              className="w-44"
            >
              {(close) => (
                <div>
                  {STATUS_ORDER.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        updateProject({ status });
                        close();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: STATUS_COLOR[status].color }}
                      />
                      {PROJECT_STATUS_META[status].label}
                    </button>
                  ))}
                </div>
              )}
            </Popover>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView("team")}
            className="rounded-full p-0.5 transition-transform hover:scale-105"
            aria-label="Ver equipo"
          >
            <AvatarStack members={project.members} size="md" max={4} />
          </button>
          <Button variant="primary" onClick={handleAdd}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nuevo módulo</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
