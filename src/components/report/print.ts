// Shared helpers for the Informe on screen (group tab + teacher view).

/** Prints only the report document; the tab title becomes the PDF's name. */
export function printReport(title: string): void {
  const previous = document.title;
  document.title = `Informe — ${title || "Groupy"}`;
  // Mobile browsers return from print() before the dialog reads the title;
  // restore it only once printing is really over.
  window.addEventListener(
    "afterprint",
    () => {
      document.title = previous;
    },
    { once: true },
  );
  window.print();
}

const DELIVERED_FORMAT = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

/** "2026-10-06T19:18:00+00:00" → "6 oct, 21:18" (Spain time). */
export function formatDeliveredAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DELIVERED_FORMAT.format(date);
}

const ISO_DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
});

/** The Spain-local calendar day ("yyyy-mm-dd") of an ISO timestamp. */
export function isoDayInSpain(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso.slice(0, 10)
    : ISO_DAY_FORMAT.format(date);
}
