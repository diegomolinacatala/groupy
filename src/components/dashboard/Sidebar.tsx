"use client";

import { RotateCcw } from "lucide-react";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import { useProject } from "@/lib/data/ProjectProvider";
import { cn } from "@/lib/utils/cn";
import { NAV } from "./nav";

export function Sidebar() {
  const { view, setView } = useDashboardUi();
  const { project, reset } = useProject();

  const doneCount = project.modules.filter((m) => m.status === "done").length;
  const total = project.modules.length;
  const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  const handleReset = () => {
    if (
      window.confirm(
        "¿Restablecer los datos de ejemplo? Se perderán tus cambios locales.",
      )
    ) {
      reset();
    }
  };

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-lg font-bold text-accent-ink shadow-card">
          G
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Groupy</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map((item) => {
          const active = view === item.view;
          const Icon = item.icon;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => setView(item.view)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-150",
                active
                  ? "bg-accent-soft text-accent"
                  : "text-ink-2 hover:bg-surface-2",
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-line px-4 py-4">
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-muted">Progreso</span>
            <span className="font-semibold text-ink">{percent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Datos de ejemplo
        </button>
      </div>
    </aside>
  );
}
