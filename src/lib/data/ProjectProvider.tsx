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

interface ProjectApi {
  updateProject: (
    patch: Partial<
      Pick<Project, "title" | "description" | "startDate" | "dueDate" | "status">
    >,
  ) => void;
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
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, dispatch] = useReducer(projectReducer, PLACEHOLDER);
  // Derived, not state: avoids a setState-in-effect. PLACEHOLDER has an empty
  // id; once hydrated from storage the project carries a real id.
  const isReady = project.id !== "";

  useEffect(() => {
    dispatch({ type: "HYDRATE", project: loadProject() });
  }, []);

  useEffect(() => {
    if (project.id !== "") saveProject(project);
  }, [project]);

  // The React Compiler memoizes this; no manual useMemo/useCallback needed.
  const findModule = (id: string) => project.modules.find((m) => m.id === id);

  const api: ProjectApi = {
    updateProject: (patch) => dispatch({ type: "UPDATE_PROJECT", patch }),
    setStrengths: (strengths) => dispatch({ type: "SET_STRENGTHS", strengths }),

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
      return newModule.id;
    },

    updateModule: (id, patch) => dispatch({ type: "UPDATE_MODULE", id, patch }),
    deleteModule: (id) => dispatch({ type: "DELETE_MODULE", id }),
    moveModuleToDate: (id, dueDate) =>
      dispatch({ type: "UPDATE_MODULE", id, patch: { dueDate } }),
    setModuleStatus: (id, status) =>
      dispatch({ type: "UPDATE_MODULE", id, patch: { status } }),

    toggleAssignee: (moduleId, memberId) => {
      const mod = findModule(moduleId);
      if (!mod) return;
      const assigneeIds = mod.assigneeIds.includes(memberId)
        ? mod.assigneeIds.filter((a) => a !== memberId)
        : [...mod.assigneeIds, memberId];
      dispatch({ type: "UPDATE_MODULE", id: moduleId, patch: { assigneeIds } });
    },

    addChecklistItem: (moduleId, text) => {
      const mod = findModule(moduleId);
      if (!mod) return;
      const item: ChecklistItem = {
        id: crypto.randomUUID(),
        text,
        done: false,
      };
      dispatch({
        type: "UPDATE_MODULE",
        id: moduleId,
        patch: { checklist: [...mod.checklist, item] },
      });
    },

    updateChecklistItem: (moduleId, itemId, patch) => {
      const mod = findModule(moduleId);
      if (!mod) return;
      dispatch({
        type: "UPDATE_MODULE",
        id: moduleId,
        patch: {
          checklist: mod.checklist.map((c) =>
            c.id === itemId ? { ...c, ...patch } : c,
          ),
        },
      });
    },

    deleteChecklistItem: (moduleId, itemId) => {
      const mod = findModule(moduleId);
      if (!mod) return;
      dispatch({
        type: "UPDATE_MODULE",
        id: moduleId,
        patch: {
          checklist: mod.checklist.filter((c) => c.id !== itemId),
        },
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
        return member.id;
      },

      updateMember: (id, patch) =>
        dispatch({ type: "UPDATE_MEMBER", id, patch }),
      deleteMember: (id) => dispatch({ type: "DELETE_MEMBER", id }),

    reset: () => dispatch({ type: "RESET", project: resetProject() }),
  };

  const value: ProjectContextValue = { project, isReady, ...api };

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
