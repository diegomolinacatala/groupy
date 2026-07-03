import type { Project, ProjectModule, TeamMember } from "./types";
import { toISODate } from "@/lib/utils/dates";

// Per the project contract, all engineering validation uses DUMMY DATA only —
// never real class rosters. This seed builds a believable group project around
// "today" so the calendar always opens populated.

function uid(): string {
  return crypto.randomUUID();
}

/** ISO date offset from today by `days`. */
function relDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function createSeedProject(): Project {
  const alba: TeamMember = {
    id: uid(),
    name: "Alba Ferrer",
    email: "alba.ferrer@example.edu",
    role: "Coordinadora",
    colorKey: "violet",
    isCoordinator: true,
  };
  const bruno: TeamMember = {
    id: uid(),
    name: "Bruno Sáez",
    email: "bruno.saez@example.edu",
    role: "Investigación",
    colorKey: "blue",
    isCoordinator: false,
  };
  const carla: TeamMember = {
    id: uid(),
    name: "Carla Ndiaye",
    email: "carla.ndiaye@example.edu",
    role: "Diseño",
    colorKey: "emerald",
    isCoordinator: false,
  };
  const diego: TeamMember = {
    id: uid(),
    name: "Diego Roure",
    email: "diego.roure@example.edu",
    role: "Desarrollo",
    colorKey: "amber",
    isCoordinator: false,
  };

  const members = [alba, bruno, carla, diego];

  // Ids up-front so the flow chain (dependsOn / deliverableId) can reference
  // them. The demo shows both dependency kinds: direct task→task locks and
  // sequential entrega blocks (kickoff → intermedia → final).
  const kickoffId = uid();
  const biblioId = uid();
  const identidadId = uid();
  const prototipoId = uid();
  const intermediaId = uid();
  const memoriaId = uid();
  const ensayoId = uid();
  const finalId = uid();

  const modules: ProjectModule[] = [
    {
      id: kickoffId,
      title: "Definir el tema y la pregunta de investigación",
      description:
        "Reunión inicial para acotar el alcance y repartir responsabilidades.",
      type: "milestone",
      status: "done",
      dueDate: relDate(-6),
      assigneeIds: [alba.id, bruno.id],
      checklist: [
        { id: uid(), text: "Lluvia de ideas", done: true },
        { id: uid(), text: "Elegir tema", done: true },
        { id: uid(), text: "Redactar pregunta", done: true },
      ],
      dependsOn: [],
      deliverableId: null,
      order: 0,
      createdAt: new Date().toISOString(),
    },
    {
      id: biblioId,
      title: "Revisión bibliográfica",
      description: "Buscar y resumir 8-10 fuentes fiables.",
      type: "task",
      status: "in_progress",
      dueDate: relDate(-1),
      assigneeIds: [bruno.id],
      checklist: [
        { id: uid(), text: "Buscar fuentes", done: true },
        { id: uid(), text: "Fichas de lectura", done: false },
      ],
      dependsOn: [],
      deliverableId: intermediaId,
      order: 1,
      createdAt: new Date().toISOString(),
    },
    {
      id: identidadId,
      title: "Diseñar la identidad visual",
      description: "Paleta, tipografía y plantilla de diapositivas.",
      type: "task",
      status: "in_progress",
      dueDate: relDate(2),
      assigneeIds: [carla.id],
      checklist: [
        { id: uid(), text: "Moodboard", done: true },
        { id: uid(), text: "Plantilla", done: false },
      ],
      dependsOn: [],
      deliverableId: intermediaId,
      order: 2,
      createdAt: new Date().toISOString(),
    },
    {
      id: prototipoId,
      title: "Prototipo funcional",
      description: "Primera versión navegable de la demo.",
      type: "task",
      status: "todo",
      dueDate: relDate(5),
      assigneeIds: [diego.id, carla.id],
      checklist: [],
      dependsOn: [identidadId],
      deliverableId: intermediaId,
      order: 3,
      createdAt: new Date().toISOString(),
    },
    {
      id: intermediaId,
      title: "Entrega intermedia",
      description: "Subir avance y recibir feedback del profesor.",
      type: "milestone",
      status: "todo",
      dueDate: relDate(9),
      assigneeIds: members.map((m) => m.id),
      checklist: [],
      dependsOn: [],
      deliverableId: null,
      order: 4,
      createdAt: new Date().toISOString(),
    },
    {
      id: memoriaId,
      title: "Redactar la memoria final",
      description: "Documento completo con conclusiones y referencias.",
      type: "task",
      status: "todo",
      dueDate: relDate(16),
      assigneeIds: [alba.id, bruno.id],
      checklist: [],
      dependsOn: [biblioId],
      deliverableId: finalId,
      order: 5,
      createdAt: new Date().toISOString(),
    },
    {
      id: ensayoId,
      title: "Ensayo de la presentación",
      description: "Repartir turnos y cronometrar.",
      type: "objective",
      status: "todo",
      dueDate: relDate(20),
      assigneeIds: members.map((m) => m.id),
      checklist: [],
      dependsOn: [prototipoId],
      deliverableId: finalId,
      order: 6,
      createdAt: new Date().toISOString(),
    },
    {
      id: finalId,
      title: "Entrega final",
      description: "Presentación en clase y subida del proyecto.",
      type: "milestone",
      status: "todo",
      dueDate: relDate(23),
      assigneeIds: members.map((m) => m.id),
      checklist: [],
      dependsOn: [],
      deliverableId: null,
      order: 7,
      createdAt: new Date().toISOString(),
    },
  ];

  return {
    id: uid(),
    title: "Proyecto de Diseño de Servicios",
    description:
      "Trabajo en grupo multi-semana: investigación, prototipo y presentación final.",
    startDate: relDate(-6),
    dueDate: relDate(23),
    status: "active",
    strengths: [
      "Buena comunicación",
      "Reparto claro de tareas",
      "Creatividad en diseño",
      "Cumplimos los plazos",
    ],
    members,
    modules,
    updatedAt: new Date().toISOString(),
  };
}
