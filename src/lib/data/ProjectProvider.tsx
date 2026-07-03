"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import type {
  ChecklistItem,
  ModuleStatus,
  ModuleType,
  Project,
  ProjectModule,
  TeamMember,
} from "./types";
import { projectReducer } from "./reducer";
import { loadProject, saveProject, resetProject } from "./store";
import { nextMemberColorKey } from "@/lib/utils/colors";

const PLACEHOLDER: Project = {
  id: "",
  title: "",
  description: "",
  startDate: null,
  dueDate: null,
  status: "active",
  strengths: [],
  members: [],
  modules: [],
  updatedAt: "",
};

export interface NewModuleInput {
  title?: string;
  type?: ModuleType;
  dueDate?: string | null;
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
  setStrengths: (strengths: string[]) => void;
  upsertModule: (module: ProjectModule) => void;
  deleteModule: (id: string) => void;
  addMember: (member: TeamMember) => void;
  updateMember: (member: TeamMember) => void;
  deleteMember: (
    id: string,
    taskPatches: { id: string; assigneeIds: string[] }[],
  ) => void;
}

export interface CloudBinding {
  /** Server-loaded snapshot; the reducer takes over from here. */
  project: Project;
  joinCode: string;
  mirror: ProjectMirror;
}

interface ProjectApi {
  updateProject: (patch: ProjectMetaPatch) => void;
  setStrengths: (strengths: string[]) => void;
  addModule: (input?: NewModuleInput) => string;
  updateModule: (id: string, patch: Partial<ProjectModule>) => void;
  deleteModule: (id: string) => void;
  moveModuleToDate: (id: string, dueDate: string | null) => void;
  setModuleStatus: (id: string, status: ModuleStatus) => void;
  toggleAssignee: (moduleId: string, memberId: string) => void;
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
  reset: () => void;
}

interface ProjectContextValue extends ProjectApi {
  project: Project;
  isReady: boolean;
  /** "local" = localStorage demo, "cloud" = Supabase-backed shared project. */
  mode: "local" | "cloud";
  joinCode: string | null;
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

  useEffect(() => {
    if (!isCloud) dispatch({ type: "HYDRATE", project: loadProject() });
  }, [isCloud]);

  useEffect(() => {
    if (!isCloud && project.id !== "") saveProject(project);
  }, [isCloud, project]);

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
    setStrengths: (strengths) => {
      dispatch({ type: "SET_STRENGTHS", strengths });
      mirror?.setStrengths(strengths);
    },

    addModule: (input = {}) => {
      const newModule: ProjectModule = {
        id: crypto.randomUUID(),
        title: input.title ?? "",
        description: "",
        type: input.type ?? "task",
        status: "todo",
        dueDate: input.dueDate ?? null,
        assigneeIds: [],
        checklist: [],
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
