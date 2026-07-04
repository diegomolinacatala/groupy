import {
  CalendarDays,
  Columns3,
  Home,
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

// Principal / Organización / Mapa are the central tabs; calendar and board
// stay as secondary planning views.
export const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      { view: "personal", label: "Principal", icon: Home },
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
    ],
  },
];

/** Flat list for surfaces without grouping (e.g. the mobile view switcher). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
