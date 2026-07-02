import type {
  ModuleType,
  Project,
  ProjectModule,
  TeamMember,
} from "./types";
import { nextMemberColorKey } from "@/lib/utils/colors";
import { parseISODate, toISODate } from "@/lib/utils/dates";

// Deterministic plan builder: turns the five setup answers into a full
// project — no backend, no AI. Phases are placed as fractions of the
// timeline and assigned round-robin so every member starts with work.

export interface SetupAnswers {
  title: string;
  description: string;
  memberNames: string[]; // first entry acts as coordinator
  startDate: string; // "yyyy-mm-dd"
  dueDate: string; // "yyyy-mm-dd"
  strengths: string[];
}

interface PhaseTemplate {
  at: number; // fraction of the timeline, 0 = start, 1 = due date
  type: ModuleType;
  title: string;
  description: string;
  assign: "all" | "rotate";
  checklist?: string[];
}

const PHASES: PhaseTemplate[] = [
  {
    at: 0,
    type: "milestone",
    title: "Reunión de arranque",
    description:
      "Acordad el alcance, el reparto inicial y cómo os vais a coordinar.",
    assign: "all",
    checklist: [
      "Acotar el tema",
      "Repartir responsabilidades",
      "Fijar canal de comunicación",
    ],
  },
  {
    at: 0.12,
    type: "task",
    title: "Investigación y fuentes",
    description: "Reunid y resumid las fuentes principales del trabajo.",
    assign: "rotate",
  },
  {
    at: 0.25,
    type: "task",
    title: "Esquema del trabajo",
    description:
      "Índice y estructura: qué secciones habrá y quién se encarga de cada una.",
    assign: "rotate",
  },
  {
    at: 0.4,
    type: "objective",
    title: "Primera versión de cada parte",
    description: "Cada miembro entrega un borrador de su sección.",
    assign: "all",
  },
  {
    at: 0.5,
    type: "milestone",
    title: "Revisión intermedia",
    description:
      "Punto de control: qué va bien, qué cojea y qué hay que reajustar.",
    assign: "all",
  },
  {
    at: 0.62,
    type: "task",
    title: "Desarrollo del contenido",
    description: "Completad las secciones con el feedback de la revisión.",
    assign: "rotate",
  },
  {
    at: 0.75,
    type: "task",
    title: "Diseño y formato",
    description: "Unificad estilo, figuras y presentación del documento.",
    assign: "rotate",
  },
  {
    at: 0.88,
    type: "task",
    title: "Revisión cruzada",
    description: "Cada miembro revisa la parte de otro antes de cerrar.",
    assign: "rotate",
    checklist: ["Revisar redacción", "Comprobar referencias"],
  },
  {
    at: 0.95,
    type: "objective",
    title: "Ensayo de la presentación",
    description: "Repartid turnos de palabra y cronometrad el conjunto.",
    assign: "all",
  },
  {
    at: 1,
    type: "milestone",
    title: "Entrega final",
    description: "Entrega del trabajo y presentación.",
    assign: "all",
  },
];

function uid(): string {
  return crypto.randomUUID();
}

function dateAtFraction(start: string, due: string, fraction: number): string {
  const startDate = parseISODate(start);
  const dueDate = parseISODate(due);
  const totalDays = Math.max(
    0,
    Math.round((dueDate.getTime() - startDate.getTime()) / 86_400_000),
  );
  const offset = Math.round(totalDays * fraction);
  const result = new Date(startDate);
  result.setDate(result.getDate() + offset);
  return toISODate(result);
}

function buildMembers(names: string[]): TeamMember[] {
  const members: TeamMember[] = [];
  for (const [index, rawName] of names.entries()) {
    const name = rawName.trim();
    if (!name) continue;
    members.push({
      id: uid(),
      name,
      email: "",
      role: index === 0 ? "Coordinación" : "",
      colorKey: nextMemberColorKey(members.map((m) => m.colorKey)),
      isCoordinator: index === 0,
    });
  }
  return members;
}

/** Builds a complete, dated and assigned project from the setup answers. */
export function buildProjectPlan(answers: SetupAnswers): Project {
  const members = buildMembers(answers.memberNames);
  const allIds = members.map((m) => m.id);
  let rotation = 0;

  const modules: ProjectModule[] = PHASES.map((phase, order) => {
    let assigneeIds: string[] = allIds;
    if (phase.assign === "rotate" && members.length > 0) {
      assigneeIds = [members[rotation % members.length].id];
      rotation += 1;
    }
    return {
      id: uid(),
      title: phase.title,
      description: phase.description,
      type: phase.type,
      status: "todo",
      dueDate: dateAtFraction(answers.startDate, answers.dueDate, phase.at),
      assigneeIds,
      checklist: (phase.checklist ?? []).map((text) => ({
        id: uid(),
        text,
        done: false,
      })),
      order,
      createdAt: new Date().toISOString(),
    };
  });

  return {
    id: uid(),
    title: answers.title.trim() || "Proyecto sin título",
    description: answers.description.trim(),
    startDate: answers.startDate,
    dueDate: answers.dueDate,
    status: "active",
    strengths: answers.strengths.map((s) => s.trim()).filter(Boolean),
    members,
    modules,
    updatedAt: new Date().toISOString(),
  };
}
