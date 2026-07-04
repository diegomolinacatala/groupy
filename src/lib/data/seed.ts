import type {
  Project,
  ProjectBlock,
  ProjectModule,
  TeamMember,
} from "./types";
import { toISODate } from "@/lib/utils/dates";

// Per the project contract, all engineering validation uses DUMMY DATA only —
// never real class rosters. This seed builds a believable group project around
// "today": three sequence blocks mid-flight plus an independent one, direct
// task→task locks (including a cross-person one) and varied importance sizes.

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
    role: "Redacción",
    colorKey: "violet",
    isCoordinator: false,
    strengths: ["Organización", "Redacción"],
  };
  const bruno: TeamMember = {
    id: uid(),
    name: "Bruno Sáez",
    email: "bruno.saez@example.edu",
    role: "Investigación",
    colorKey: "blue",
    isCoordinator: false,
    strengths: ["Datos y análisis"],
  };
  const carla: TeamMember = {
    id: uid(),
    name: "Carla Ndiaye",
    email: "carla.ndiaye@example.edu",
    role: "Diseño",
    colorKey: "emerald",
    isCoordinator: false,
    strengths: ["Diseño"],
  };
  const diego: TeamMember = {
    id: uid(),
    name: "Diego Roure",
    email: "diego.roure@example.edu",
    role: "Desarrollo",
    colorKey: "amber",
    isCoordinator: false,
    strengths: ["Programación", "Presentar en público"],
  };

  const members = [alba, bruno, carla, diego];

  const investigacion: ProjectBlock = {
    id: uid(),
    name: "Investigación",
    mode: "sequence",
    order: 0,
  };
  const redaccion: ProjectBlock = {
    id: uid(),
    name: "Redacción",
    mode: "sequence",
    order: 1,
  };
  const presentacion: ProjectBlock = {
    id: uid(),
    name: "Presentación",
    mode: "sequence",
    order: 2,
  };
  const gestion: ProjectBlock = {
    id: uid(),
    name: "Gestión",
    mode: "independent",
    order: 3,
  };

  // Ids up-front so dependsOn can reference them.
  const temaId = uid();
  const fuentesId = uid();
  const fichasId = uid();
  const esquemaId = uid();
  const marcoId = uid();
  const analisisId = uid();
  const figurasId = uid();
  const revisionId = uid();
  const plantillaId = uid();
  const diapositivasId = uid();
  const ensayoId = uid();
  const actaId = uid();
  const plazosId = uid();

  const base = {
    description: "",
    checklist: [] as ProjectModule["checklist"],
    createdAt: new Date().toISOString(),
    // Null = the corkboard auto-lays these out by dependency depth.
    mapX: null,
    mapY: null,
  };

  const modules: ProjectModule[] = [
    // Investigación — first sequence block, casi completa.
    {
      ...base,
      id: temaId,
      title: "Acotar el tema",
      status: "done",
      dueDate: relDate(-6),
      assigneeIds: [alba.id],
      dependsOn: [],
      blockId: investigacion.id,
      importance: 7,
      docType: null,
      order: 0,
    },
    {
      ...base,
      id: fuentesId,
      title: "Buscar fuentes",
      status: "done",
      dueDate: relDate(-3),
      assigneeIds: [bruno.id],
      dependsOn: [temaId],
      blockId: investigacion.id,
      importance: 6,
      docType: "sheet",
      order: 1,
    },
    {
      ...base,
      id: fichasId,
      title: "Fichas de lectura",
      status: "in_progress",
      dueDate: relDate(1),
      assigneeIds: [bruno.id],
      dependsOn: [fuentesId],
      blockId: investigacion.id,
      importance: 5,
      docType: "doc",
      order: 2,
    },
    // Redacción — second sequence block, waits for Investigación.
    {
      ...base,
      id: esquemaId,
      title: "Esquema del documento",
      status: "todo",
      dueDate: relDate(4),
      assigneeIds: [alba.id],
      dependsOn: [],
      blockId: redaccion.id,
      importance: 8,
      docType: "doc",
      order: 3,
    },
    {
      ...base,
      id: marcoId,
      title: "Marco teórico",
      status: "todo",
      dueDate: relDate(8),
      assigneeIds: [bruno.id],
      dependsOn: [esquemaId],
      blockId: redaccion.id,
      importance: 7,
      docType: "doc",
      order: 4,
    },
    {
      ...base,
      id: analisisId,
      title: "Análisis de resultados",
      status: "todo",
      dueDate: relDate(10),
      assigneeIds: [diego.id],
      dependsOn: [esquemaId],
      blockId: redaccion.id,
      importance: 9,
      docType: "doc",
      order: 5,
    },
    {
      ...base,
      id: figurasId,
      title: "Figuras y tablas",
      status: "todo",
      dueDate: relDate(12),
      // Cross-person lock: Diego's análisis blocks Carla's figuras —
      // the "Diego está bloqueando" notice in the Personal view.
      assigneeIds: [carla.id],
      dependsOn: [analisisId],
      blockId: redaccion.id,
      importance: 5,
      docType: "image",
      order: 6,
    },
    {
      ...base,
      id: revisionId,
      title: "Revisión cruzada",
      status: "todo",
      dueDate: relDate(14),
      assigneeIds: [alba.id],
      dependsOn: [marcoId, analisisId],
      blockId: redaccion.id,
      importance: 6,
      docType: null,
      order: 7,
    },
    // Presentación — third sequence block.
    {
      ...base,
      id: plantillaId,
      title: "Plantilla de diapositivas",
      status: "todo",
      dueDate: relDate(15),
      assigneeIds: [carla.id],
      dependsOn: [],
      blockId: presentacion.id,
      importance: 6,
      docType: "slides",
      order: 8,
    },
    {
      ...base,
      id: diapositivasId,
      title: "Montar diapositivas",
      status: "todo",
      dueDate: relDate(18),
      assigneeIds: [diego.id],
      dependsOn: [plantillaId],
      blockId: presentacion.id,
      importance: 7,
      docType: "slides",
      order: 9,
    },
    {
      ...base,
      id: ensayoId,
      title: "Ensayo general",
      status: "todo",
      dueDate: relDate(21),
      assigneeIds: members.map((m) => m.id),
      dependsOn: [diapositivasId],
      blockId: presentacion.id,
      importance: 8,
      docType: null,
      order: 10,
    },
    // Gestión — independent, always available.
    {
      ...base,
      id: actaId,
      title: "Acta de reuniones",
      status: "in_progress",
      dueDate: null,
      assigneeIds: [alba.id],
      dependsOn: [],
      blockId: gestion.id,
      importance: 3,
      docType: "doc",
      order: 11,
    },
    {
      ...base,
      id: plazosId,
      title: "Control de plazos",
      status: "todo",
      dueDate: null,
      assigneeIds: [],
      dependsOn: [],
      blockId: gestion.id,
      importance: 4,
      docType: "sheet",
      order: 12,
    },
  ];

  return {
    id: uid(),
    title: "Proyecto de Diseño de Servicios",
    description:
      "Investigación, memoria escrita y presentación final del caso de estudio.",
    startDate: relDate(-6),
    dueDate: relDate(23),
    status: "active",
    blocks: [investigacion, redaccion, presentacion, gestion],
    members,
    modules,
    updatedAt: new Date().toISOString(),
  };
}
