// Small, dependency-free date helpers. All calendar dates are handled as
// local "yyyy-mm-dd" strings to avoid timezone drift.

export const WEEKDAYS_ES = ["L", "M", "X", "J", "V", "S", "D"] as const;

export const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const MONTHS_SHORT_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

const pad = (n: number): string => String(n).padStart(2, "0");

/** Local Date -> "yyyy-mm-dd". */
export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "yyyy-mm-dd" -> local Date at midnight. */
export function parseISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function isSameISODay(a: string, b: string): boolean {
  return a === b;
}

/** Monday-first weekday index (0 = Monday ... 6 = Sunday). */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * A 6x7 matrix of Date objects covering the month that contains `year/month`,
 * padded with leading/trailing days so weeks are Monday-first and complete.
 */
export function getMonthMatrix(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - mondayIndex(first));

  const weeks: Date[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function addMonths(year: number, month: number, delta: number): {
  year: number;
  month: number;
} {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function monthLabel(year: number, month: number): string {
  return `${MONTHS_ES[month]} ${year}`;
}

/** "2026-03-12" -> "12 mar 2026". */
export function formatShort(value: string | null): string {
  if (!value) return "Sin fecha";
  const d = parseISODate(value);
  return `${d.getDate()} ${MONTHS_SHORT_ES[d.getMonth()]} ${d.getFullYear()}`;
}

/** "2026-03-12" -> "jueves, 12 de marzo". */
export function formatLong(value: string | null): string {
  if (!value) return "Sin fecha";
  const d = parseISODate(value);
  const weekday = d.toLocaleDateString("es-ES", { weekday: "long" });
  return `${weekday}, ${d.getDate()} de ${MONTHS_ES[d.getMonth()]}`;
}

/** Whole days from today until `value` (negative = overdue). */
export function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const today = parseISODate(todayISO());
  const target = parseISODate(value);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Human, low-noise relative deadline label. */
export function deadlineLabel(value: string | null): string {
  const days = daysUntil(value);
  if (days === null) return "Sin fecha";
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days === -1) return "Ayer";
  if (days < 0) return `Hace ${Math.abs(days)} días`;
  return `En ${days} días`;
}
