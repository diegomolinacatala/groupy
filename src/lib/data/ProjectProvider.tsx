"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  ChecklistItem,
  ModuleStatus,
  Project,
  ProjectBlock,
  ProjectModule,
  TaskDocType,
  TeamMember,
} from "./types";
import { clampImportance, IMPORTANCE_DEFAULT } from "./types";
import { projectReducer } from "./reducer";
import {
  loadLocalIdentity,
  loadProject,
  resetProject,
  saveLocalIdentity,
  saveProject,
  subscribeLocalIdentity,
} from "./store";
import { orderedBlocks, wouldCreateCycle } from "./flow";
import { nextMemberColorKey } from "@/lib/utils/colors";

const PLACEHOLDER: Project = {
  id: "",
  title: "",
  description: "",
  startDate: null,
  dueDate: null,
  status: "active",
  blocks: [],
  members: [],
  modules: [],
  updatedAt: "",
};

export interface NewModuleInput {
  title?: string;
  dueDate?: string | null;
  /** Pre-assign the new task to a block; defaults to the first block. */
  blockId?: string | null;
  /** Pre-assign to a member (the per-column "+" in Organización). */
  assigneeId?: string | null;
  docType?: TaskDocType | null;
}

export interface NewMemberInput {
  name?: string;
  email?: string;
  role?: string;
}

export type ProjectMetaPatch = Partial<
  Pick<Project, "title" | "description" | "startDate" | "dueDate" | "status">
>;

/**
 * Echoes each local edit to a remote store. Calls are fire-and-forget: the
 * reducer state is the source of truth for the session, the mirror only has
 * to eventually converge (ordering is the mirror's own responsibility).
 */
export interface ProjectMirror {
  updateProject: (patch: ProjectMetaPatch) => void;
  upsertModule: (module: ProjectModule) => void;
  deleteModule: (id: string) => void;
  upsertBlock: (block: ProjectBlock) => void;
  deleteBlock: (id: string) => void;
  addMember: (member: TeamMember) => void;
  updateMember: (member: TeamMember) => void;
  deleteMember: (
    id: string,
    taskPatches: { id: string; assigneeIds: string[] }[],
  ) => void;
  setMemberStrengths: (memberId: string, strengths: string[]) => void;
}

export interface CloudBinding {
  /** Server-loaded snapshot; the reducer takes over from here. */
  project: Project;
  joinCode: string;
  /** The group_members row claimed by this browser's anonymous session. */
  currentMemberId: string | null;
  mirror: ProjectMirror;
}

interface ProjectApi {
  updateProject: (patch: ProjectMetaPatch) => void;
  addModule: (input?: NewModuleInput) => string;
  updateModule: (id: string, patch: Partial<ProjectModule>) => void;
  deleteModule: (id: string) => void;
  moveModuleToDate: (id: string, dueDate: string | null) => void;
  setModuleStatus: (id: string, status: ModuleStatus) => void;
  toggleAssignee: (moduleId: string, memberId: string) => void;
  /** Single-owner assignment (Organización drag): null clears. */
  assignToMember: (moduleId: string, memberId: string | null) => void;
  /** Adds/removes a direct dependency; silently refuses cycles. */
  toggleDependency: (moduleId: string, depId: string) => void;
  /** Moves the task to another block. */
  setModuleBlock: (moduleId: string, blockId: string) => void;
  setImportance: (moduleId: string, importance: number) => void;
  /** Rewrites `order` following the given id order (subset allowed). */
  reorderModules: (orderedIds: string[]) => void;
  addBlock: (input?: { name?: string; mode?: ProjectBlock["mode"] }) => string;
  updateBlock: (id: string, patch: Partial<ProjectBlock>) => void;
  /** Refused while it is the last block; its tasks move to the first one. */
  deleteBlock: (id: string) => void;
  reorderBlocks: (orderedIds: string[]) => void;
  addChecklistItem: (moduleId: string, text: string) => void;
  updateChecklistItem: (
    moduleId: string,
    itemId: string,
    patch: Partial<ChecklistItem>,
  ) => void;
  deleteChecklistItem: (moduleId: string, itemId: string) => void;
  addMember: (input?: NewMemberInput) => string;
  updateMember: (id: string, patch: Partial<TeamMember>) => void;
  deleteMember: (id: string) => void;
  setMemberStrengths: (memberId: string, strengths: string[]) => void;
  /** Local mode only: picks "quién soy" on this device; cloud is fixed. */
  setCurrentMember: (memberId: string | null) => void;
  reset: () => void;
}

interface ProjectContextValue extends ProjectApi {
  project: Project;
  isReady: boolean;
  /** "local" = localStorage demo, "cloud" = Supabase-backed shared project. */
  mode: "local" | "cloud";
  joinCode: string | null;
  /** Member this session acts as (claimed in cloud, picked in local). */
  currentMemberId: string | null;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({
  children,
  cloud,
}: {
  children: ReactNode;
  cloud?: CloudBinding;
}) {
  // Cloud mode starts hydrated (server-fetched snapshot), so isReady is
  // immediately true and no storage effect runs.
  const [project, dispatch] = useReducer(
    projectReducer,
    cloud ? cloud.project : PLACEHOLDER,
  );
  const isReady = project.id !== "";
  const isCloud = cloud !== undefined;
  const mirror = cloud?.mirror ?? null;

  // Local identity is device state, not project state — read through an
  // external store so SSR markup never depends on localStorage.
  const localMemberId = useSyncExternalStore(
    subscribeLocalIdentity,
    loadLocalIdentity,
    () => null,
  );

  useEffect(() => {
    if (!isCloud) dispatch({ type: "HYDRATE", project: loadProject() });
  }, [isCloud]);

  useEffect(() => {
    if (!isCloud && project.id !== "") saveProject(project);
  }, [isCloud, project]);

  const currentMemberId = isCloud
    ? cloud.currentMemberId
    : localMemberId && project.members.some((m) => m.id === localMemberId)
      ? localMemberId
      : null;

  // The React Compiler memoizes this; no manual useMemo/useCallback needed.
  const findModule = (id: string) => project.modules.find((m) => m.id === id);

  // Single funnel for module edits: the mirror needs the merged module (a row
  // upsert), not the raw patch, and this is where both are known.
  const applyModulePatch = (id: string, patch: Partial<ProjectModule>) => {
    const current = findModule(id);
    dispatch({ type: "UPDATE_MODULE", id, patch });
    if (current) mirror?.upsertModule({ ...current, ...patch });
  };

  const api: ProjectApi = {
    updateProject: (patch) => {
      dispatch({ type: "UPDATE_PROJECT", patch });
      mirror?.updateProject(patch);
    },

    addModule: (input = {}) => {
      const firstBlock = orderedBlocks(project)[0];
      const newModule: ProjectModule = {
        id: crypto.randomUUID(),
        title: input.title ?? "",
        description: "",
        status: "todo",
        dueDate: input.dueDate ?? null,
        assigneeIds: input.assigneeId ? [input.assigneeId] : [],
        checklist: [],
        dependsOn: [],
        blockId: input.blockId ?? firstBlock?.id ?? null,
        importance: IMPORTANCE_DEFAULT,
        docType: input.docType ?? null,
        order: project.modules.length,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: "ADD_MODULE", module: newModule });
      mirror?.upsertModule(newModule);
      return newModule.id;
    },

    updateModule: applyModulePatch,
    deleteModule: (id) => {
      dispatch({ type: "DELETE_MODULE", id });
      mirror?.deleteModule(id);
    },
    moveModuleToDate: (id, dueDate) => applyModulePatch(id, { dueDate }),
    setModuleStatus: (id, status) => applyModulePatch(id, { status }),

    toggleAssignee: (moduleId, memberId) => {
      const mod = findModule(moduleId);
      if (!mod) return;
      const assigneeIds = mod.assigneeIds.includes(memberId)
        ? mod.assigneeIds.filter((a) => a !== memberId)
        : [...mod.assigneeIds, memberId];
      applyModulePatch(moduleId, { assigneeIds });
    },

    assignToMember: (moduleId, memberId) => {
      applyModulePatch(moduleId, {
        assigneeIds: memberId ? [memberId] : [],
      });
    },

    toggleDependency: (moduleId, depId) => {
      const mod = findModule(moduleId);
      if (!mod || moduleId === depId) return;
      if (mod.dependsOn.includes(depId)) {
        applyModulePatch(moduleId, {
          dependsOn: mod.dependsOn.filter((d) => d !== depId),
        });
        return;
      }
      // Belt and braces: the map view already rejects cyclic drops.
      if (wouldCreateCycle(project, moduleId, depId)) return;
      applyModulePatch(moduleId, { dependsOn: [...mod.dependsOn, depId] });
    },

    setModuleBlock: (moduleId, blockId) => {
      if (!project.blocks.some((b) => b.id === blockId)) return;
      applyModulePatch(moduleId, { blockId });
    },

    setImportance: (moduleId, importance) => {
      applyModulePatch(moduleId, { importance: clampImportance(importance) });
    },

    reorderModules: (orderedIds) => {
      dispatch({ type: "REORDER_MODULES", orderedIds });
      // Mirror each re-ordered row with its new order value.
      const index = new Map(orderedIds.map((id, i) => [id, i]));
      for (const mod of project.modules) {
        const order = index.get(mod.id);
        if (order !== undefined && order !== mod.order) {
          mirror?.upsertModule({ ...mod, order });
        }
      }
    },

    addBlock: (input = {}) => {
      const block: ProjectBlock = {
        id: crypto.randomUUID(),
        name: input.name ?? "Nuevo bloque",
        mode: input.mode ?? "independent",
        order: project.blocks.length,
      };
      dispatch({ type: "ADD_BLOCK", block });
      mirror?.upsertBlock(block);
      return block.id;
    },

    updateBlock: (id, patch) => {
      const current = project.blocks.find((b) => b.id === id);
      dispatch({ type: "UPDATE_BLOCK", id, patch });
      if (current) mirror?.upsertBlock({ ...current, ...patch });
    },

    deleteBlock: (id) => {
      if (project.blocks.length <= 1) return;
      dispatch({ type: "DELETE_BLOCK", id });
      mirror?.deleteBlock(id);
    },

    reorderBlocks: (orderedIds) => {
      dispatch({ type: "REORDER_BLOCKS", orderedIds });
      const index = new Map(orderedIds.map((id, i) => [id, i]));
      for (const block of project.blocks) {
        const order = index.get(block.id);
        if (order !== undefined && order !== block.order) {
          mirror?.upsertBlock({ ...block, order });
        }
      }
    },

    addChecklistItem: (moduleId, text) => {
      const mod = findModule(moduleId);
      if (!mod) return;
      const item: ChecklistItem = {
        id: crypto.randomUUID(),
        text,
        done: false,
      };
      applyModulePatch(moduleId, { checklist: [...mod.checklist, item] });
    },

    updateChecklistItem: (moduleId, itemId, patch) => {
      const mod = findModule(moduleId);
      if (!mod) return;
      applyModulePatch(moduleId, {
        checklist: mod.checklist.map((c) =>
          c.id === itemId ? { ...c, ...patch } : c,
        ),
      });
    },

    deleteChecklistItem: (moduleId, itemId) => {
      const mod = findModule(moduleId);
      if (!mod) return;
      applyModulePatch(moduleId, {
        checklist: mod.checklist.filter((c) => c.id !== itemId),
      });
    },

    addMember: (input = {}) => {
      const member: TeamMember = {
        id: crypto.randomUUID(),
        name: input.name ?? "Nuevo miembro",
        email: input.email ?? "",
        role: input.role ?? "",
        colorKey: nextMemberColorKey(project.members.map((m) => m.colorKey)),
        isCoordinator: false,
        strengths: [],
      };
      dispatch({ type: "ADD_MEMBER", member });
      mirror?.addMember(member);
      return member.id;
    },

    updateMember: (id, patch) => {
      const current = project.members.find((m) => m.id === id);
      dispatch({ type: "UPDATE_MEMBER", id, patch });
      if (current) mirror?.updateMember({ ...current, ...patch });
    },

    deleteMember: (id) => {
      // Same cascade the reducer applies, precomputed so the mirror can
      // detach the member from those task rows too.
      const taskPatches = project.modules
        .filter((m) => m.assigneeIds.includes(id))
        .map((m) => ({
          id: m.id,
          assigneeIds: m.assigneeIds.filter((a) => a !== id),
        }));
      dispatch({ type: "DELETE_MEMBER", id });
      mirror?.deleteMember(id, taskPatches);
    },

    setMemberStrengths: (memberId, strengths) => {
      const clean = strengths.map((s) => s.trim()).filter(Boolean);
      dispatch({
        type: "UPDATE_MEMBER",
        id: memberId,
        patch: { strengths: clean },
      });
      // Strengths live on the group's jsonb record, not the member row —
      // a dedicated mirror call, not updateMember.
      mirror?.setMemberStrengths(memberId, clean);
    },

    setCurrentMember: (memberId) => {
      if (!isCloud) saveLocalIdentity(memberId);
    },

    // "Restore demo data" only makes sense for the local prototype; cloud
    // dashboards hide the button and this stays a no-op as a belt-and-braces.
    reset: () => {
      if (!isCloud) dispatch({ type: "RESET", project: resetProject() });
    },
  };

  const value: ProjectContextValue = {
    project,
    isReady,
    mode: isCloud ? "cloud" : "local",
    joinCode: cloud?.joinCode ?? null,
    currentMemberId,
    ...api,
  };

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return ctx;
}
