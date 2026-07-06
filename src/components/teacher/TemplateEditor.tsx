"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Check, Link2, Plus } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import { MapView } from "@/components/map/MapView";
import { TaskModal } from "@/components/module/TaskModal";
import { InlineText } from "@/components/ui/InlineText";
import { DateField } from "@/components/ui/DateField";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

// The template editor: the SAME map the groups will use, owned by the
// teacher. Its own slim shell instead of the dashboard's (no identity, no
// member views, no informe) — title and brief edited in place, dates inline,
// the class code always at hand.

export function TemplateEditor() {
  const { project, updateProject, addModule } = useProject();
  const { openModule } = useDashboardUi();

  const taskCount = project.modules.length;

  const handleAdd = () => {
    const id = addModule();
    openModule(id);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <header className="shrink-0 border-b border-line bg-surface/80 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-6">
          <Link
            href="/profesor"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Plantillas</span>
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <InlineText
                value={project.title}
                onCommit={(title) => updateProject({ title })}
                placeholder="Título del trabajo"
                ariaLabel="Título de la plantilla"
                className="type-display -ml-1.5 text-xl md:text-2xl"
              />
              <span className="hidden shrink-0 rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent sm:inline">
                Plantilla
              </span>
            </div>
            <div className="ml-0.5 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                Inicio
                <DateField
                  value={project.startDate}
                  onChange={(startDate) => updateProject({ startDate })}
                  ariaLabel="Fecha de inicio del trabajo"
                  className="h-7 px-2 text-xs"
                />
              </span>
              <span className="inline-flex items-center gap-1.5">
                Entrega
                <DateField
                  value={project.dueDate}
                  onChange={(dueDate) => updateProject({ dueDate })}
                  ariaLabel="Fecha de entrega del trabajo"
                  className="h-7 px-2 text-xs"
                />
              </span>
              <span className="tabular-nums">
                {taskCount} {taskCount === 1 ? "tarea" : "tareas"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <ClassCodeChip />
            <Button variant="primary" onClick={handleAdd}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Tarea</span>
            </Button>
          </div>
        </div>

        {/* The brief students read on the class-code page. */}
        <div className="border-t border-line/70 px-4 pb-2.5 pt-1.5 md:px-6">
          <InlineText
            value={project.description}
            onCommit={(description) => updateProject({ description })}
            placeholder="Instrucciones para los grupos — las verán al entrar con el código…"
            multiline
            ariaLabel="Instrucciones para los grupos"
            className="-ml-1.5 max-w-3xl text-sm text-ink-2"
          />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <MapView />
      </main>

      <TaskModal />
    </div>
  );
}

/**
 * The share affordance of the editor: the CLASS code. Copies the join link
 * students open; big and always visible — it IS the handoff to the class.
 */
function ClassCodeChip() {
  const { joinCode } = useProject();
  const [copied, setCopied] = useState(false);
  if (!joinCode) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/p/${joinCode}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable: the visible code is still there to copy.
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      title="Copiar el enlace para la clase"
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs transition-colors",
        copied
          ? "border-accent/60 bg-accent-soft text-accent"
          : "border-line bg-surface text-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-accent" />
      ) : (
        <Link2 className="h-3.5 w-3.5" />
      )}
      <span className="hidden text-[11px] font-medium uppercase tracking-wide sm:inline">
        {copied ? "Enlace copiado" : "Código de clase"}
      </span>
      <span className="font-mono tracking-[0.15em]">{joinCode}</span>
    </button>
  );
}
