"use client";

import { useMemo } from "react";
import { CircleCheckBig } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import { buildProjectFlow } from "@/lib/data/flow";
import { MemberFilter } from "@/components/ui/MemberFilter";
import { FlowTaskCard } from "./FlowTaskCard";
import { FlowBlock } from "./FlowBlock";

const NO_DATE = "9999-12-31";

/**
 * Main working view: what can be done right now, what is locked and by whom,
 * organised as sequential entrega blocks.
 */
export function FlowView() {
  const { project, setModuleStatus, addModule, currentMemberId } = useProject();
  const { openModule, focusMemberId, setFocusMemberId } = useDashboardUi();

  const flow = useMemo(() => buildProjectFlow(project), [project]);

  // "Disponibles ahora": everything unlocked and pending (milestones included
  // — an unlocked milestone is an entrega ready to be handed in).
  const available = useMemo(() => {
    const entries = [...flow.byId.values()].filter(
      (entry) =>
        entry.state === "available" &&
        (!focusMemberId || entry.module.assigneeIds.includes(focusMemberId)),
    );
    return entries.sort((a, b) => {
      const dateA = a.module.dueDate ?? NO_DATE;
      const dateB = b.module.dueDate ?? NO_DATE;
      return dateA < dateB ? -1 : dateA > dateB ? 1 : a.module.order - b.module.order;
    });
  }, [flow, focusMemberId]);

  const handleAdvance = (id: string) => {
    const entry = flow.byId.get(id);
    if (!entry || entry.state !== "available") return;
    setModuleStatus(id, entry.module.status === "in_progress" ? "done" : "in_progress");
  };

  const handleAddTask = (deliverableId: string | null) => {
    const id = addModule({ deliverableId });
    openModule(id);
  };

  return (
    <div className="flex h-full flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="type-display text-2xl">Flujo de trabajo</h2>
          <p className="text-sm text-muted">
            Cada tarea se desbloquea al completarse aquello de lo que depende.
          </p>
        </div>
        <MemberFilter
          members={project.members}
          value={focusMemberId}
          onChange={setFocusMemberId}
          currentMemberId={currentMemberId}
        />
      </div>

      {/* Available now */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <CircleCheckBig className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-ink">
            Disponibles ahora
            <span className="ml-1.5 font-normal text-muted">
              {available.length}
            </span>
          </h3>
        </div>
        {available.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-sm text-muted">
            {focusMemberId
              ? "Nada disponible para este miembro ahora mismo."
              : "Nada disponible: todo está bloqueado o completado."}
          </p>
        ) : (
          <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1.5">
            {available.map((entry) => (
              <FlowTaskCard
                key={entry.module.id}
                flow={entry}
                members={project.members}
                onOpen={() => openModule(entry.module.id)}
                onAdvance={() => handleAdvance(entry.module.id)}
                compact
              />
            ))}
          </div>
        )}
      </section>

      {/* Entrega blocks */}
      <div className="flex flex-col">
        {flow.blocks.map((block, index) => (
          <FlowBlock
            key={block.deliverable?.id ?? "loose"}
            block={block}
            index={index}
            flow={flow}
            members={project.members}
            focusMemberId={focusMemberId}
            onOpenModule={openModule}
            onAdvanceModule={handleAdvance}
            onDeliver={(milestoneId) => setModuleStatus(milestoneId, "done")}
            onAddTask={handleAddTask}
          />
        ))}
        {flow.blocks.length === 0 && (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
            Aún no hay módulos. Crea una tarea o una entrega para empezar.
          </p>
        )}
      </div>
    </div>
  );
}
