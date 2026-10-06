"use client";

import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import type { Project } from "@/lib/data/types";
import { Button } from "@/components/ui/Button";
import { ReportDocument } from "@/components/report/ReportDocument";
import {
  formatDeliveredAt,
  isoDayInSpain,
  printReport,
} from "@/components/report/print";

// The teacher's reading of a delivered report: the same document the group
// saw when they clicked "Entregar", computed as of that day (pace, overdue
// tasks), with a print-to-PDF export like the group's own tab.

export function TeacherReportView({
  project,
  joinCode,
  submittedAt,
}: {
  project: Project;
  joinCode: string;
  submittedAt: string;
}) {
  const names = project.members.map((m) => m.name).join(", ");

  return (
    <div className="min-h-dvh bg-canvas">
      <header
        data-print-hide
        className="flex items-center justify-between border-b border-line px-4 py-3 md:px-8"
      >
        <Link
          href="/profesor"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Tus plantillas
        </Link>
        <Button variant="primary" onClick={() => printReport(project.title)}>
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Descargar PDF</span>
          <span className="sm:hidden">PDF</span>
        </Button>
      </header>

      <main className="p-4 md:p-8 print:p-0">
        <div className="mx-auto w-full max-w-3xl">
          <div data-print-hide className="mb-6">
            <p className="type-overline">Informe entregado</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {names || "Grupo"} · entregado el{" "}
              {formatDeliveredAt(submittedAt)}
            </p>
          </div>
          <ReportDocument
            project={project}
            joinCode={joinCode}
            generatedAt={isoDayInSpain(submittedAt)}
            notice={`Entregado por el grupo el ${formatDeliveredAt(submittedAt)}.`}
          />
        </div>
      </main>
    </div>
  );
}
