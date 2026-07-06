import {
  buildProjectFlow,
  type BlockState,
  type FlowState,
} from "./flow";
import type {
  Project,
  ProjectBlock,
  ProjectModule,
  TeamMember,
} from "./types";
import { daysBetweenISO, todayISO } from "@/lib/utils/dates";

/**
 * Report engine — pure derivations over `Project`, no I/O and no React.
 * Everything the teacher-facing report shows is computed here so the view
 * layer stays presentational and the numbers stay testable.
 *
 * The core idea mirrors the app's philosophy: work is weighted by task
 * IMPORTANCE (1–10), and a task shared by several members splits its weight
 * evenly among them. That keeps "who did what" honest: finishing one big
 * task counts more than three trivial ones.
 */

export interface ReportTotals {
  tasks: number;
  done: number;
  inProgress: number;
  todo: number;
  /** % of importance-weighted work completed (0–100, rounded). */
  weightedPercent: number;
  /** Plain done/total % (0–100, rounded) — shown next to the weighted one. */
  plainPercent: number;
}

export type PaceVerdict = "completado" | "adelantado" | "al_dia" | "por_detras";

export interface ReportPace {
  /** Share of the project window already spent (0–1). Null without dates. */
  timeFraction: number | null;
  /** Whole days until the deadline (negative = overdue). Null without date. */
  daysLeft: number | null;
  /** weightedPercent − time%, in points. Null without dates. */
  delta: number | null;
  verdict: PaceVerdict | null;
}

export interface MemberWaiting {
  module: ProjectModule;
  /** Teammates whose pending tasks depend on this one. */
  waiters: TeamMember[];
}

export interface MemberReport {
  member: TeamMember;
  assigned: number;
  done: number;
  inProgress: number;
  /** Importance-weighted work assigned to this member (split on shares). */
  weightedAssigned: number;
  weightedDone: number;
  /** Share (0–1) of the team's COMPLETED weighted work. */
  contributionShare: number;
  /** Share (0–1) of the team's ASSIGNED weighted work. */
  loadShare: number;
  checklistDone: number;
  checklistTotal: number;
  /** This member's pending tasks that other people are waiting on. */
  waiting: MemberWaiting[];
  /** Up to 3 completed tasks, biggest first — the individual highlights. */
  topDone: ProjectModule[];
}

export interface BlockReport {
  block: ProjectBlock;
  state: BlockState;
  total: number;
  done: number;
  /** Importance-weighted completion of the block (0–100, rounded). */
  percent: number;
}

export interface ReportRow {
  module: ProjectModule;
  blockName: string;
  state: FlowState;
  overdue: boolean;
}

export interface BlockedRow {
  module: ProjectModule;
  /** Human reason: the pending prerequisite or the waiting block. */
  reason: string;
}

export interface ReportRisks {
  overdue: ReportRow[];
  blocked: BlockedRow[];
  unassignedCount: number;
  /** Share (0–1) of total project weight sitting on unassigned tasks. */
  unassignedWeightShare: number;
  /** Completed weight not attributable to anyone (done without assignee). */
  doneUnassignedWeight: number;
}

export interface ProjectReport {
  /** "yyyy-mm-dd" the snapshot was taken. */
  generatedAt: string;
  totals: ReportTotals;
  pace: ReportPace;
  members: MemberReport[];
  blocks: BlockReport[];
  risks: ReportRisks;
  /** Every task, grouped by block order then flow order — the appendix. */
  rows: ReportRow[];
  /** Auto-written executive summary, one paragraph per entry. */
  summary: string[];
}

const round = (value: number): number => Math.round(value);
const pct = (fraction: number): number => round(fraction * 100);

/** "2026-07-05" -> "5 de julio de 2026". */
export function formatFullES(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const firstName = (name: string): string =>
  name.trim().split(/\s+/)[0] || name;

function buildTotals(project: Project): ReportTotals {
  const tasks = project.modules.length;
  const done = project.modules.filter((m) => m.status === "done").length;
  const inProgress = project.modules.filter(
    (m) => m.status === "in_progress",
  ).length;
  const totalWeight = project.modules.reduce((s, m) => s + m.importance, 0);
  const doneWeight = project.modules
    .filter((m) => m.status === "done")
    .reduce((s, m) => s + m.importance, 0);
  return {
    tasks,
    done,
    inProgress,
    todo: tasks - done - inProgress,
    weightedPercent: totalWeight === 0 ? 0 : pct(doneWeight / totalWeight),
    plainPercent: tasks === 0 ? 0 : pct(done / tasks),
  };
}

function buildPace(
  project: Project,
  totals: ReportTotals,
  today: string,
): ReportPace {
  const daysLeft = project.dueDate
    ? daysBetweenISO(today, project.dueDate)
    : null;
  if (!project.startDate || !project.dueDate) {
    return { timeFraction: null, daysLeft, delta: null, verdict: null };
  }
  const window = daysBetweenISO(project.startDate, project.dueDate);
  if (window <= 0) {
    return { timeFraction: null, daysLeft, delta: null, verdict: null };
  }
  const gone = daysBetweenISO(project.startDate, today);
  const timeFraction = Math.min(1, Math.max(0, gone / window));
  const delta = totals.weightedPercent - pct(timeFraction);
  const verdict: PaceVerdict =
    totals.tasks > 0 && totals.done === totals.tasks
      ? "completado"
      : delta >= 8
        ? "adelantado"
        : delta <= -8
          ? "por_detras"
          : "al_dia";
  return { timeFraction, daysLeft, delta, verdict };
}

function buildMembers(
  project: Project,
  flow: ReturnType<typeof buildProjectFlow>,
): MemberReport[] {
  const perMember = project.members.map((member) => {
    const mine = project.modules.filter((m) =>
      m.assigneeIds.includes(member.id),
    );
    const doneTasks = mine.filter((m) => m.status === "done");
    // A shared task splits its importance evenly among its assignees.
    const weightOf = (m: ProjectModule) =>
      m.assigneeIds.length === 0 ? 0 : m.importance / m.assigneeIds.length;
    const weightedAssigned = mine.reduce((s, m) => s + weightOf(m), 0);
    const weightedDone = doneTasks.reduce((s, m) => s + weightOf(m), 0);

    const waiting: MemberWaiting[] = mine
      .filter((m) => m.status !== "done")
      .map((m) => {
        const entry = flow.byId.get(m.id);
        if (!entry) return null;
        const waiterIds = new Set<string>();
        for (const dependent of entry.unlocks) {
          if (dependent.status === "done") continue;
          for (const id of dependent.assigneeIds) {
            if (id !== member.id) waiterIds.add(id);
          }
        }
        if (waiterIds.size === 0) return null;
        return {
          module: m,
          waiters: project.members.filter((p) => waiterIds.has(p.id)),
        };
      })
      .filter((w): w is MemberWaiting => w !== null);

    return {
      member,
      assigned: mine.length,
      done: doneTasks.length,
      inProgress: mine.filter((m) => m.status === "in_progress").length,
      weightedAssigned,
      weightedDone,
      contributionShare: 0, // filled once team totals are known
      loadShare: 0,
      checklistDone: mine.reduce(
        (s, m) => s + m.checklist.filter((c) => c.done).length,
        0,
      ),
      checklistTotal: mine.reduce((s, m) => s + m.checklist.length, 0),
      waiting,
      topDone: [...doneTasks]
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 3),
    };
  });

  const teamDone = perMember.reduce((s, m) => s + m.weightedDone, 0);
  const teamAssigned = perMember.reduce((s, m) => s + m.weightedAssigned, 0);
  return perMember.map((m) => ({
    ...m,
    contributionShare: teamDone === 0 ? 0 : m.weightedDone / teamDone,
    loadShare: teamAssigned === 0 ? 0 : m.weightedAssigned / teamAssigned,
  }));
}

function buildBlocks(
  flow: ReturnType<typeof buildProjectFlow>,
): BlockReport[] {
  return flow.blocks.map((entry) => {
    const totalWeight = entry.modules.reduce((s, m) => s + m.importance, 0);
    const doneWeight = entry.modules
      .filter((m) => m.status === "done")
      .reduce((s, m) => s + m.importance, 0);
    return {
      block: entry.block,
      state: entry.state,
      total: entry.modules.length,
      done: entry.doneCount,
      percent: totalWeight === 0 ? 0 : pct(doneWeight / totalWeight),
    };
  });
}

function buildRows(
  flow: ReturnType<typeof buildProjectFlow>,
  today: string,
): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const blockFlow of flow.blocks) {
    for (const mod of blockFlow.modules) {
      const entry = flow.byId.get(mod.id);
      rows.push({
        module: mod,
        blockName: blockFlow.block.name,
        state: entry?.state ?? (mod.status === "done" ? "done" : "available"),
        overdue:
          mod.status !== "done" && mod.dueDate !== null && mod.dueDate < today,
      });
    }
  }
  return rows;
}

function buildRisks(
  project: Project,
  flow: ReturnType<typeof buildProjectFlow>,
  rows: ReportRow[],
): ReportRisks {
  const blocked: BlockedRow[] = [];
  for (const row of rows) {
    if (row.state !== "locked") continue;
    const entry = flow.byId.get(row.module.id);
    if (!entry) continue;
    const reason =
      entry.blockers.length > 0
        ? `Espera a «${entry.blockers[0].title || "Sin título"}»`
        : entry.waitingForBlock
          ? `Espera al bloque «${entry.waitingForBlock.name}»`
          : "Bloqueada";
    blocked.push({ module: row.module, reason });
  }

  const unassigned = project.modules.filter((m) => m.assigneeIds.length === 0);
  const totalWeight = project.modules.reduce((s, m) => s + m.importance, 0);
  const unassignedWeight = unassigned.reduce((s, m) => s + m.importance, 0);
  const doneUnassignedWeight = unassigned
    .filter((m) => m.status === "done")
    .reduce((s, m) => s + m.importance, 0);

  return {
    overdue: rows.filter((r) => r.overdue),
    blocked,
    unassignedCount: unassigned.length,
    unassignedWeightShare:
      totalWeight === 0 ? 0 : unassignedWeight / totalWeight,
    doneUnassignedWeight,
  };
}

function buildSummary(
  project: Project,
  report: Omit<ProjectReport, "summary">,
): string[] {
  const { totals, pace, members, risks } = report;
  const paragraphs: string[] = [];

  if (totals.tasks === 0) {
    return [
      "El grupo todavía no ha registrado tareas, por lo que este informe no contiene datos de avance.",
    ];
  }

  paragraphs.push(
    `A ${formatFullES(report.generatedAt)}, el equipo ha completado ` +
      `${totals.done} de ${totals.tasks} tareas: un ${totals.weightedPercent}% ` +
      `del trabajo total, ponderando cada tarea por su importancia.`,
  );

  if (pace.timeFraction !== null && pace.verdict !== null) {
    const timeSpent = pct(pace.timeFraction);
    const deadline =
      pace.daysLeft !== null && pace.daysLeft >= 0
        ? `quedan ${pace.daysLeft} días para la entrega`
        : `la fecha de entrega venció hace ${Math.abs(pace.daysLeft ?? 0)} días`;
    const verdictText: Record<PaceVerdict, string> = {
      completado: "El trabajo está completado.",
      adelantado: "El grupo avanza por delante del calendario.",
      al_dia: "El ritmo de trabajo está alineado con el calendario.",
      por_detras:
        "El ritmo va por detrás del calendario y convendría reforzarlo en las próximas semanas.",
    };
    paragraphs.push(
      `Se ha consumido el ${timeSpent}% del plazo (${deadline}). ` +
        verdictText[pace.verdict],
    );
  }

  const contributors = members.filter((m) => m.weightedAssigned > 0);
  const teamDone = members.reduce((s, m) => s + m.weightedDone, 0);
  if (teamDone > 0 && members.length > 1) {
    const top = [...members].sort(
      (a, b) => b.contributionShare - a.contributionShare,
    )[0];
    const shares = contributors.map((m) => m.contributionShare);
    const spread = Math.max(...shares) - Math.min(...shares);
    if (top.contributionShare >= 0.55) {
      paragraphs.push(
        `${firstName(top.member.name)} concentra el ` +
          `${pct(top.contributionShare)}% del trabajo completado hasta ahora; ` +
          `el detalle individual se recoge en la sección de contribución.`,
      );
    } else if (spread <= 0.2) {
      paragraphs.push(
        "El trabajo completado está repartido de forma equilibrada entre los miembros del equipo.",
      );
    } else {
      paragraphs.push(
        "El reparto del trabajo completado presenta diferencias entre miembros; el detalle individual se recoge más abajo.",
      );
    }
  }

  const riskParts: string[] = [];
  if (risks.overdue.length > 0) {
    riskParts.push(
      `${risks.overdue.length} ${risks.overdue.length === 1 ? "tarea fuera de plazo" : "tareas fuera de plazo"}`,
    );
  }
  if (risks.blocked.length > 0) {
    riskParts.push(
      `${risks.blocked.length} ${risks.blocked.length === 1 ? "bloqueada por dependencias" : "bloqueadas por dependencias"}`,
    );
  }
  if (risks.unassignedCount > 0) {
    riskParts.push(
      `${risks.unassignedCount} sin responsable (un ${pct(risks.unassignedWeightShare)}% del trabajo)`,
    );
  }
  paragraphs.push(
    riskParts.length === 0
      ? "No hay tareas fuera de plazo, bloqueadas ni sin responsable en el momento de generar este informe."
      : `Puntos de atención: ${riskParts.join("; ")}.`,
  );

  return paragraphs;
}

/** Builds the full snapshot the teacher-facing report renders. */
export function buildReport(
  project: Project,
  generatedAt: string = todayISO(),
): ProjectReport {
  const flow = buildProjectFlow(project);
  const totals = buildTotals(project);
  const pace = buildPace(project, totals, generatedAt);
  const members = buildMembers(project, flow);
  const blocks = buildBlocks(flow);
  const rows = buildRows(flow, generatedAt);
  const risks = buildRisks(project, flow, rows);

  const partial = {
    generatedAt,
    totals,
    pace,
    members,
    blocks,
    risks,
    rows,
  };
  return { ...partial, summary: buildSummary(project, partial) };
}
