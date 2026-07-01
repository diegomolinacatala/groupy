import {
  CalendarDays,
  Columns3,
  LayoutDashboard,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { DashboardView } from "@/lib/ui/dashboard-ui";

export interface NavItem {
  view: DashboardView;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { view: "overview", label: "Resumen", icon: LayoutDashboard },
  { view: "calendar", label: "Calendario", icon: CalendarDays },
  { view: "board", label: "Tablero", icon: Columns3 },
  { view: "team", label: "Equipo", icon: Users },
  { view: "strengths", label: "Fortalezas", icon: Sparkles },
];
