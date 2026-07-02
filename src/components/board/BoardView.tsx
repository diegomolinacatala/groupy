"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import { BoardColumn } from "./BoardColumn";
import { ModuleCardStatic } from "./ModuleCard";
import {
  MODULE_STATUSES,
  type ModuleStatus,
  type ProjectModule,
} from "@/lib/data/types";

export function BoardView() {
  const { project, setModuleStatus, addModule, updateModule } = useProject();
  const { openModule } = useDashboardUi();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const byStatus = useMemo(() => {
    const map: Record<ModuleStatus, ProjectModule[]> = {
      todo: [],
      in_progress: [],
      done: [],
    };
    for (const mod of project.modules) map[mod.status].push(mod);
    for (const status of MODULE_STATUSES) {
      map[status].sort((a, b) => a.order - b.order);
    }
    return map;
  }, [project.modules]);

  const activeModule = activeId
    ? project.modules.find((m) => m.id === activeId) ?? null
    : null;

  const handleDragStart = (event: DragStartEvent) =>
    setActiveId(String(event.active.id));

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const status = over.data.current?.status as ModuleStatus | undefined;
    const mod = project.modules.find((m) => m.id === active.id);
    if (status && mod && mod.status !== status) {
      setModuleStatus(String(active.id), status);
    }
  };

  const handleAdd = (status: ModuleStatus) => {
    const id = addModule();
    if (status !== "todo") updateModule(id, { status });
    openModule(id);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex h-full flex-col gap-4 p-4 md:p-6">
        <div>
          <h2 className="type-display text-2xl">Tablero</h2>
          <p className="text-sm text-muted">
            Arrastra los módulos entre columnas para cambiar su estado.
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-4 md:flex-row md:gap-5">
          {MODULE_STATUSES.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              modules={byStatus[status]}
              members={project.members}
              onOpenModule={openModule}
              onAdd={handleAdd}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeModule ? (
          <div className="w-72 cursor-grabbing">
            <ModuleCardStatic module={activeModule} members={project.members} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
