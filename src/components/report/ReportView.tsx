"use client";

import { useEffect, useState } from "react";
import { Download, Send } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { Button } from "@/components/ui/Button";
import { callCloud } from "@/lib/data/cloud/call";
import {
  getReportDelivery,
  submitReportToTeacher,
} from "@/lib/data/cloud/report-actions";
import { ReportDocument } from "./ReportDocument";
import { formatDeliveredAt, printReport } from "./print";

// Informe — the companion artifact of the whole app: a formal, teacher-facing
// snapshot of who did what, generated from the group's task log. On screen it
// reads like a document; "Descargar PDF" prints ONLY the document (the app
// chrome carries data-print-hide) so the browser's save-as-PDF is the export.
// Groups that came from a class code can also hand it to their teacher.

export function ReportView() {
  const { project, joinCode, mode } = useProject();

  return (
    <div className="p-4 md:p-8 print:p-0">
      <div className="mx-auto w-full max-w-3xl">
        {/* Screen-only toolbar: never part of the document. */}
        <div
          data-print-hide
          className="mb-6 flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <p className="type-overline">Informe</p>
            <h2 className="type-display mt-1 text-3xl text-ink">
              Para el profesor
            </h2>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">
              Una foto fiel de lo que lleváis hecho, con la contribución de
              cada persona.
            </p>
          </div>
          <Button
            // Cloud groups get "Entregar" as the main action just below.
            variant={mode === "cloud" ? "secondary" : "primary"}
            onClick={() => printReport(project.title)}
          >
            <Download className="h-4 w-4" />
            Descargar PDF
          </Button>
        </div>

        {mode === "cloud" && joinCode && <DeliveryPanel joinCode={joinCode} />}

        <ReportDocument project={project} joinCode={joinCode} />
      </div>
    </div>
  );
}

type Delivery =
  | { state: "loading" }
  | { state: "unavailable" }
  | { state: "ready"; submittedAt: string | null }
  | { state: "error"; message: string };

/**
 * Hand-in to the teacher (cloud groups spawned from a class code only). The
 * server snapshots the real rows, so what the teacher gets is exactly this
 * document as of the click. Delivering again replaces the previous copy.
 */
function DeliveryPanel({ joinCode }: { joinCode: string }) {
  const { flushCloud } = useProject();
  const [delivery, setDelivery] = useState<Delivery>({ state: "loading" });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void callCloud(() => getReportDelivery({ joinCode })).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setDelivery({ state: "error", message: result.error });
      } else if (!result.canDeliver) {
        setDelivery({ state: "unavailable" });
      } else {
        setDelivery({ state: "ready", submittedAt: result.submittedAt });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [joinCode]);

  if (delivery.state === "loading" || delivery.state === "unavailable") {
    return null;
  }
  if (delivery.state === "error") {
    return (
      <p
        data-print-hide
        className="mb-6 rounded-xl bg-surface-2 px-4 py-3 text-xs text-muted"
      >
        No se ha podido comprobar si el informe está entregado: {delivery.message}
      </p>
    );
  }

  const submittedAt = delivery.submittedAt;

  const handleSubmit = async () => {
    if (sending) return;
    const question = submittedAt
      ? "¿Volver a entregar el informe? El profesor verá esta versión en lugar de la anterior."
      : "¿Entregar el informe al profesor? Recibirá una copia de cómo está el trabajo ahora mismo. Si lo necesitáis, podréis volver a entregarlo.";
    if (!window.confirm(question)) return;
    setSending(true);
    setSendError(null);
    // The server snapshots the DB: let edits still in flight land first.
    await flushCloud();
    const result = await callCloud(() => submitReportToTeacher({ joinCode }));
    setSending(false);
    if (!result.ok) {
      setSendError(result.error);
      return;
    }
    setDelivery({ state: "ready", submittedAt: result.submittedAt });
  };

  return (
    <section
      data-print-hide
      className="mb-6 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          {submittedAt ? "Informe entregado" : "Entregar al profesor"}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          {submittedAt
            ? `El profesor tiene la versión del ${formatDeliveredAt(submittedAt)}. Si seguís trabajando, podéis volver a entregarlo.`
            : "El profesor no ve vuestro trabajo en curso: solo lo que le entreguéis desde aquí."}
        </p>
        {sendError && (
          <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            {sendError}
          </p>
        )}
      </div>
      <Button
        variant={submittedAt ? "secondary" : "primary"}
        onClick={() => void handleSubmit()}
        disabled={sending}
        className="shrink-0"
      >
        {sending ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {submittedAt ? "Volver a entregar" : "Entregar"}
      </Button>
    </section>
  );
}
