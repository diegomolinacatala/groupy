import {
  CalendarDays,
  CircleUser,
  Columns3,
  Sparkles,
  SquareKanban,
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

// Personal / Organización / Mapa are the central tabs; calendar and board
// stay as secondary planning views.
export const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      { view: "personal", label: "Personal", icon: CircleUser },
      { view: "organization", label: "Organización", icon: Columns3 },
      { view: "map", label: "Mapa", icon: Waypoints },
    ],
  },
  {
    title: "Más vistas",
    items: [
      { view: "calendar", label: "Calendario", icon: CalendarDays },
      { view: "board", label: "Tablero", icon: SquareKanban },
      { view: "team", label: "Equipo", icon: Users },
      { view: "strengths", label: "Fortalezas", icon: Sparkles },
    ],
  },
];

/** Flat list for surfaces without grouping (e.g. the mobile view switcher). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
