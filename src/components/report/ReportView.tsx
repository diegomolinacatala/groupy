"use client";

import { Download } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { buildReport, formatFullES, type ProjectReport } from "@/lib/data/report";
import type { Project, TeamMember } from "@/lib/data/types";
import { PROJECT_STATUS_META } from "@/lib/data/types";
import { Button } from "@/components/ui/Button";
import { colorForKey } from "@/lib/utils/colors";
import { formatShort } from "@/lib/utils/dates";
import {
  ReportBar,
  ReportMeta,
  ReportSectionTitle,
  ReportStat,
} from "./primitives";
import {
  AppendixSection,
  BlocksSection,
  MemberSection,
  MethodNote,
  RisksSection,
} from "./ReportSections";

// Informe — the companion artifact of the whole app: a formal, teacher-facing
// snapshot of who did what, generated from the group's task log. On screen it
// reads like a document; "Descargar PDF" prints ONLY the document (the app
// chrome carries data-print-hide) so the browser's save-as-PDF is the export.

const pct = (fraction: number): number => Math.round(fraction * 100);

export function ReportView() {
  const { project, joinCode } = useProject();
  const report = buildReport(project);

  const handleDownload = () => {
    // The print dialog uses the tab title as the default PDF file name.
    const previous = document.title;
    document.title = `Informe — ${project.title || "Groupy"}`;
    window.print();
    document.title = previous;
  };

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
              cada persona. Descárgalo en PDF y entregadlo junto al trabajo.
            </p>
          </div>
          <Button variant="primary" onClick={handleDownload}>
            <Download className="h-4 w-4" />
            Descargar PDF
          </Button>
        </div>

        <article className="report-document rounded-3xl border border-line bg-surface px-6 py-8 shadow-card sm:px-10 sm:py-12">
          <ReportCover
            project={project}
            report={report}
            joinCode={joinCode}
          />
          <SummarySection report={report} />
          <ContributionSection report={report} />
          <MemberSection members={report.members} />
          <BlocksSection blocks={report.blocks} />
          <RisksSection report={report} />
          <AppendixSection rows={report.rows} project={project} />
          <MethodNote />
        </article>
      </div>
    </div>
  );
}

// --- Portada -----------------------------------------------------------------

function ReportCover({
  project,
  report,
  joinCode,
}: {
  project: Project;
  report: ProjectReport;
  joinCode: string | null;
}) {
  return (
    <header>
      <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3">
        <span className="type-display text-lg text-ink">Groupy</span>
        <span className="type-overline">Informe de seguimiento</span>
      </div>

      <h1 className="type-display mt-8 text-4xl leading-[1.05] text-ink">
        {project.title || "Trabajo en grupo"}
      </h1>
      {project.description && (
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {project.description}
        </p>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <ReportMeta
          label="Generado"
          value={formatFullES(report.generatedAt)}
        />
        <ReportMeta label="Entrega" value={formatShort(project.dueDate)} />
        <ReportMeta
          label="Equipo"
          value={`${project.members.length} ${project.members.length === 1 ? "miembro" : "miembros"}`}
        />
        <ReportMeta
          label="Estado"
          value={
            joinCode
              ? `${PROJECT_STATUS_META[project.status].label} · ${joinCode}`
              : PROJECT_STATUS_META[project.status].label
          }
        />
      </dl>

      <p className="mt-6 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-xs leading-relaxed text-ink-2">
        Documento dirigido al profesorado. Generado automáticamente a partir
        del registro de trabajo del grupo en Groupy — sin intervención manual
        sobre los datos.
      </p>
    </header>
  );
}

// --- 01 · Resumen --------------------------------------------------------------

function SummarySection({ report }: { report: ProjectReport }) {
  const { totals, pace } = report;
  const timePercent =
    pace.timeFraction === null ? null : pct(pace.timeFraction);
  const attention =
    report.risks.overdue.length +
    report.risks.blocked.length +
    report.risks.unassignedCount;

  return (
    <section>
      <ReportSectionTitle index="01" title="Resumen" />

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <ReportStat
          label="Avance"
          value={`${totals.weightedPercent}%`}
          hint="Ponderado por importancia"
        />
        <ReportStat
          label="Tareas"
          value={`${totals.done}/${totals.tasks}`}
          hint={`${totals.inProgress} en curso · ${totals.todo} pendientes`}
        />
        <ReportStat
          label="Plazo"
          value={timePercent === null ? "—" : `${timePercent}%`}
          hint={
            pace.daysLeft === null
              ? "Sin fechas definidas"
              : pace.daysLeft >= 0
                ? `Quedan ${pace.daysLeft} días`
                : `Vencido hace ${Math.abs(pace.daysLeft)} días`
          }
        />
        <ReportStat
          label="Atención"
          value={attention}
          hint="Fuera de plazo, bloqueadas o sin dueño"
        />
      </div>

      {timePercent !== null && (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/40 p-4">
          <ReportBar
            label="Trabajo completado"
            percent={totals.weightedPercent}
            color="var(--color-accent)"
          />
          <ReportBar
            label="Plazo consumido"
            percent={timePercent}
            color="var(--color-ink)"
          />
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2.5">
        {report.summary.map((paragraph, i) => (
          <p key={i} className="text-sm leading-relaxed text-ink-2">
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  );
}

// --- 02 · Reparto del trabajo completado ---------------------------------------

interface ContributionSegment {
  key: string;
  label: string;
  color: string;
  share: number;
  member: TeamMember | null;
}

function ContributionSection({ report }: { report: ProjectReport }) {
  const memberDone = report.members.reduce((s, m) => s + m.weightedDone, 0);
  const totalDone = memberDone + report.risks.doneUnassignedWeight;
  if (totalDone === 0) {
    return (
      <section className="break-inside-avoid">
        <ReportSectionTitle index="02" title="Reparto del trabajo completado" />
        <p className="mt-3 text-sm text-muted">
          Todavía no hay tareas completadas, así que no puede analizarse el
          reparto del trabajo hecho.
        </p>
      </section>
    );
  }

  const segments: ContributionSegment[] = report.members
    .filter((m) => m.weightedDone > 0)
    .map((m) => ({
      key: m.member.id,
      label: m.member.name,
      color: colorForKey(m.member.colorKey).bg,
      share: m.weightedDone / totalDone,
      member: m.member,
    }));
  if (report.risks.doneUnassignedWeight > 0) {
    segments.push({
      key: "unassigned",
      label: "Sin responsable",
      color: "var(--color-muted-2)",
      share: report.risks.doneUnassignedWeight / totalDone,
      member: null,
    });
  }

  return (
    <section className="break-inside-avoid">
      <ReportSectionTitle index="02" title="Reparto del trabajo completado" />
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Cada franja representa la parte del trabajo ya completado que aporta
        cada miembro, ponderando las tareas por su importancia.
      </p>

      <div className="mt-4 flex h-4 overflow-hidden rounded-full">
        {segments.map((segment) => (
          <div
            key={segment.key}
            title={`${segment.label}: ${pct(segment.share)}%`}
            style={{
              width: `${segment.share * 100}%`,
              backgroundColor: segment.color,
            }}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className="inline-flex items-center gap-1.5 text-xs text-ink-2"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            {segment.label}
            <span className="tabular-nums text-muted">
              {pct(segment.share)}%
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}
