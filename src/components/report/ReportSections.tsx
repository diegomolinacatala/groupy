"use client";

import type { ReactNode } from "react";
import { Check, Lock } from "lucide-react";
import type { Project } from "@/lib/data/types";
import {
  BLOCK_MODE_META,
  MODULE_STATUS_META,
} from "@/lib/data/types";
import type {
  BlockReport,
  MemberReport,
  ProjectReport,
  ReportRow,
} from "@/lib/data/report";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { DocTypeBadge } from "@/components/ui/DocTypeBadge";
import { colorForKey } from "@/lib/utils/colors";
import { formatShort } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { ReportSectionTitle, WeightDash } from "./primitives";

const pct = (fraction: number): number => Math.round(fraction * 100);

const firstName = (name: string): string =>
  name.trim().split(/\s+/)[0] || name;

// --- 3 · Contribución individual --------------------------------------------

export function MemberSection({ members }: { members: MemberReport[] }) {
  if (members.length === 0) return null;
  return (
    <section>
      <ReportSectionTitle index="03" title="Contribución individual" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {members.map((entry) => (
          <MemberCard key={entry.member.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}

function MemberCard({ entry }: { entry: MemberReport }) {
  const color = colorForKey(entry.member.colorKey);
  const pending = entry.assigned - entry.done - entry.inProgress;
  return (
    <article
      className="break-inside-avoid rounded-2xl border border-line border-l-4 bg-surface p-4"
      style={{ borderLeftColor: color.bg }}
    >
      <header className="flex items-center gap-3">
        <Avatar member={entry.member} size="md" />
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-ink">
            {entry.member.name}
          </h4>
          <p className="truncate text-xs text-muted">
            {entry.member.role || "Miembro del equipo"}
          </p>
        </div>
        <span
          className="ml-auto shrink-0 text-right"
          title="Parte del trabajo completado del equipo que ha aportado"
        >
          <span className="type-display block text-2xl leading-none text-ink">
            {pct(entry.contributionShare)}%
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted">
            del trabajo hecho
          </span>
        </span>
      </header>

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
        <MemberFigure label="Hechas" value={entry.done} />
        <MemberFigure label="En curso" value={entry.inProgress} />
        <MemberFigure label="Pendientes" value={pending} />
      </dl>

      {/* Weighted personal progress: done weight over assigned weight. */}
      <div className="mt-3">
        <div className="flex items-baseline justify-between text-[11px] text-muted">
          <span>Avance sobre su carga asignada</span>
          <span className="tabular-nums">
            {entry.weightedAssigned === 0
              ? "—"
              : `${pct(entry.weightedDone / entry.weightedAssigned)}%`}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full"
            style={{
              width:
                entry.weightedAssigned === 0
                  ? "0%"
                  : `${pct(entry.weightedDone / entry.weightedAssigned)}%`,
              backgroundColor: color.bg,
            }}
          />
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-1 text-xs text-ink-2">
        <li>
          Carga asignada: {pct(entry.loadShare)}% del trabajo repartido
          {entry.assigned > 0 &&
            ` (${entry.assigned} ${entry.assigned === 1 ? "tarea" : "tareas"})`}
        </li>
        {entry.checklistTotal > 0 && (
          <li>
            Pasos de checklist: {entry.checklistDone} de {entry.checklistTotal}{" "}
            completados
          </li>
        )}
        {entry.waiting.length > 0 && (
          <li style={{ color: "var(--color-progress)" }}>
            {entry.waiting.length === 1
              ? "1 tarea suya frena a"
              : `${entry.waiting.length} tareas suyas frenan a`}{" "}
            {waitersLabel(entry)}
          </li>
        )}
      </ul>

      {entry.topDone.length > 0 && (
        <div className="mt-3 border-t border-line pt-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Aportaciones destacadas
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {entry.topDone.map((mod) => (
              <li
                key={mod.id}
                className="flex items-center gap-1.5 text-xs text-ink-2"
              >
                <Check
                  className="h-3 w-3 shrink-0"
                  style={{ color: "var(--color-done)" }}
                />
                <span className="min-w-0 truncate">
                  {mod.title || "Sin título"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function MemberFigure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="type-display text-lg leading-none text-ink">{value}</dd>
      <dt className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">
        {label}
      </dt>
    </div>
  );
}

function waitersLabel(entry: MemberReport): string {
  const names = new Set<string>();
  for (const w of entry.waiting) {
    for (const person of w.waiters) names.add(firstName(person.name));
  }
  const list = [...names];
  if (list.length <= 2) return list.join(" y ");
  return `${list[0]} y ${list.length - 1} más`;
}

// --- 4 · Bloques de trabajo --------------------------------------------------

const BLOCK_STATE_LABEL: Record<BlockReport["state"], string> = {
  waiting: "A la espera",
  open: "En marcha",
  complete: "Completado",
};

export function BlocksSection({ blocks }: { blocks: BlockReport[] }) {
  if (blocks.length === 0) return null;
  return (
    <section className="break-inside-avoid">
      <ReportSectionTitle index="04" title="Bloques de trabajo" />
      <div className="mt-4 flex flex-col gap-3">
        {blocks.map((entry, index) => (
          <div key={entry.block.id} className="flex items-center gap-3">
            <span className="w-5 shrink-0 text-xs tabular-nums text-muted-2">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium text-ink">
                  {entry.block.name}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {BLOCK_MODE_META[entry.block.mode].label} ·{" "}
                    {BLOCK_STATE_LABEL[entry.state]}
                  </span>
                </p>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {entry.done}/{entry.total} · {entry.percent}%
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${entry.percent}%`,
                    backgroundColor:
                      entry.state === "complete"
                        ? "var(--color-done)"
                        : "var(--color-accent)",
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// --- 5 · Puntos de atención ---------------------------------------------------

export function RisksSection({ report }: { report: ProjectReport }) {
  const { risks } = report;
  const empty =
    risks.overdue.length === 0 &&
    risks.blocked.length === 0 &&
    risks.unassignedCount === 0;

  return (
    <section className="break-inside-avoid">
      <ReportSectionTitle index="05" title="Puntos de atención" />
      {empty ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-2">
          <Check
            className="h-4 w-4"
            style={{ color: "var(--color-done)" }}
          />
          Sin tareas fuera de plazo, bloqueadas ni sin responsable en el
          momento del informe.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3 text-sm">
          {risks.overdue.length > 0 && (
            <RiskList
              title={`Fuera de plazo (${risks.overdue.length})`}
              items={risks.overdue.map(
                (row) =>
                  `${row.module.title || "Sin título"} — vencía el ${formatShort(row.module.dueDate)}`,
              )}
              color="var(--color-danger)"
            />
          )}
          {risks.blocked.length > 0 && (
            <RiskList
              title={`Bloqueadas por dependencias (${risks.blocked.length})`}
              items={risks.blocked.map(
                (b) => `${b.module.title || "Sin título"} — ${b.reason}`,
              )}
              color="var(--color-progress)"
            />
          )}
          {risks.unassignedCount > 0 && (
            <RiskList
              title={`Sin responsable (${risks.unassignedCount})`}
              items={[
                `Representan un ${Math.round(risks.unassignedWeightShare * 100)}% del trabajo total del proyecto.`,
              ]}
              color="var(--color-todo)"
            />
          )}
        </div>
      )}
    </section>
  );
}

function RiskList({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold" style={{ color }}>
        {title}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5 text-xs text-ink-2">
        {items.map((text, i) => (
          <li key={i} className="pl-3">
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- 6 · Anexo: registro de tareas -------------------------------------------

export function AppendixSection({
  rows,
  project,
}: {
  rows: ReportRow[];
  project: Project;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <ReportSectionTitle index="06" title="Anexo · Registro de tareas" />
      <table className="mt-4 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line-strong">
            <Th className="w-[38%]">Tarea</Th>
            <Th>Bloque</Th>
            <Th>Responsables</Th>
            <Th>Peso</Th>
            <Th>Fecha</Th>
            <Th className="text-right">Estado</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <AppendixRow key={row.module.id} row={row} project={project} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "py-2 pr-3 text-[10px] font-semibold uppercase tracking-wider text-muted",
        className,
      )}
    >
      {children}
    </th>
  );
}

function AppendixRow({ row, project }: { row: ReportRow; project: Project }) {
  const mod = row.module;
  const status = MODULE_STATUS_META[mod.status];
  const assignees = project.members.filter((m) =>
    mod.assigneeIds.includes(m.id),
  );
  return (
    <tr className="break-inside-avoid border-b border-line align-middle">
      <td className="py-2 pr-3">
        <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
          {row.state === "locked" && (
            <Lock className="h-3 w-3 shrink-0 text-muted" />
          )}
          <DocTypeBadge docType={mod.docType} />
          <span className="min-w-0">{mod.title || "Sin título"}</span>
        </span>
      </td>
      <td className="py-2 pr-3 text-xs text-muted">{row.blockName}</td>
      <td className="py-2 pr-3">
        {assignees.length === 0 ? (
          <span className="text-xs text-muted-2">—</span>
        ) : (
          <AvatarStack members={assignees} size="xs" max={3} />
        )}
      </td>
      <td className="py-2 pr-3">
        <WeightDash importance={mod.importance} />
      </td>
      <td
        className="py-2 pr-3 text-xs tabular-nums"
        style={{
          color: row.overdue ? "var(--color-danger)" : "var(--color-muted)",
        }}
      >
        {mod.dueDate ? formatShort(mod.dueDate) : "—"}
      </td>
      <td className="py-2 text-right">
        <Badge label={status.label} color={status.color} soft={status.soft} />
      </td>
    </tr>
  );
}

// --- Cierre: nota metodológica ------------------------------------------------

export function MethodNote() {
  return (
    <footer className="mt-10 break-inside-avoid border-t border-line pt-4">
      <p className="type-overline">Nota metodológica</p>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Groupy genera este informe automáticamente a partir del registro de
        trabajo del grupo: tareas, responsables, estados, dependencias y pasos
        completados. Cada tarea pondera según su importancia (1–10) y, cuando
        una tarea es compartida, su peso se reparte a partes iguales entre las
        personas responsables. El documento refleja la situación en la fecha de
        generación y acompaña a la entrega del trabajo: no la sustituye.
      </p>
    </footer>
  );
}
