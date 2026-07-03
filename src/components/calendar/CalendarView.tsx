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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import { lockedModuleIds } from "@/lib/data/flow";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { CalendarDay } from "./CalendarDay";
import { UnscheduledTray } from "./UnscheduledTray";
import { ModuleChipStatic } from "./ModuleChip";
import type { ProjectModule } from "@/lib/data/types";
import {
  WEEKDAYS_ES,
  addMonths,
  getMonthMatrix,
  monthLabel,
  toISODate,
  todayISO,
} from "@/lib/utils/dates";

export function CalendarView() {
  const { project, moveModuleToDate, addModule } = useProject();
  const { year, month, setMonth, goToToday, openModule } = useDashboardUi();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const weeks = useMemo(() => getMonthMatrix(year, month), [year, month]);
  const today = todayISO();

  const { byDate, unscheduled } = useMemo(() => {
    const map = new Map<string, ProjectModule[]>();
    const none: ProjectModule[] = [];
    for (const mod of project.modules) {
      if (!mod.dueDate) {
        none.push(mod);
        continue;
      }
      const list = map.get(mod.dueDate) ?? [];
      list.push(mod);
      map.set(mod.dueDate, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.order - b.order);
    }
    return { byDate: map, unscheduled: none };
  }, [project.modules]);

  const lockedIds = useMemo(() => lockedModuleIds(project), [project]);

  const activeModule = activeId
    ? project.modules.find((m) => m.id === activeId) ?? null
    : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const date = (over.data.current?.date ?? null) as string | null;
    const mod = project.modules.find((m) => m.id === active.id);
    if (mod && mod.dueDate !== date) {
      moveModuleToDate(String(active.id), date);
    }
  };

  const handleQuickAdd = (iso: string) => {
    const id = addModule({ dueDate: iso });
    openModule(id);
  };

  const goPrev = () => {
    const next = addMonths(year, month, -1);
    setMonth(next.year, next.month);
  };
  const goNext = () => {
    const next = addMonths(year, month, 1);
    setMonth(next.year, next.month);
  };

  return (
    <DndContext
      // Stable id: the cloud dashboard is server-rendered, and dnd-kit's
      // auto-incremented ids differ between server and client (hydration
      // mismatch on aria-describedby).
      id="calendar-dnd"
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex h-full flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="type-display text-2xl capitalize">
              {monthLabel(year, month)}
            </h2>
            <div className="flex items-center">
              <IconButton label="Mes anterior" onClick={goPrev}>
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <IconButton label="Mes siguiente" onClick={goNext}>
                <ChevronRight className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={goToToday}>
            Hoy
          </Button>
        </div>

        <UnscheduledTray
          modules={unscheduled}
          members={project.members}
          lockedIds={lockedIds}
          onOpenModule={openModule}
        />

        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="grid grid-cols-7 border-b border-line">
            {WEEKDAYS_ES.map((day, i) => (
              <div
                key={i}
                className="px-2 py-2 text-center text-xs font-semibold text-muted"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {weeks.flat().map((date) => {
              const iso = toISODate(date);
              return (
                <CalendarDay
                  key={iso}
                  iso={iso}
                  dayNum={date.getDate()}
                  inMonth={date.getMonth() === month}
                  isToday={iso === today}
                  modules={byDate.get(iso) ?? []}
                  members={project.members}
                  lockedIds={lockedIds}
                  onOpenModule={openModule}
                  onQuickAdd={handleQuickAdd}
                />
              );
            })}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeModule ? (
          <div className="w-44 cursor-grabbing">
            <ModuleChipStatic
              module={activeModule}
              members={project.members}
              locked={lockedIds.has(activeModule.id)}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
