import {
  CalendarDays,
  Columns3,
  LayoutDashboard,
  ListTodo,
  Sparkles,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import type { DashboardView } from "@/lib/ui/dashboard-ui";

export interface NavItem {
  view: DashboardView;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  /** Overline shown above the group; null for the primary block. */
  title: string | null;
  items: NavItem[];
}

// Flow + map are the primary surfaces; calendar and board stay as secondary
// planning views (locked decision from the flow redesign).
export const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      { view: "flow", label: "Tareas", icon: ListTodo },
      { view: "map", label: "Mapa", icon: Waypoints },
      { view: "overview", label: "Resumen", icon: LayoutDashboard },
    ],
  },
  {
    title: "Más vistas",
    items: [
      { view: "calendar", label: "Calendario", icon: CalendarDays },
      { view: "board", label: "Tablero", icon: Columns3 },
      { view: "team", label: "Equipo", icon: Users },
      { view: "strengths", label: "Fortalezas", icon: Sparkles },
    ],
  },
];

/** Flat list for surfaces without grouping (e.g. the mobile view switcher). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
