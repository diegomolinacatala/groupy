import type {
  Project,
  ProjectModule,
  TeamMember,
} from "./types";

// Pure, immutable reducer. Every action returns a new Project (no mutation),
// keeping state changes predictable and easy to persist / undo later.

export type ProjectAction =
  | { type: "HYDRATE"; project: Project }
  | { type: "RESET"; project: Project }
  | {
      type: "UPDATE_PROJECT";
      patch: Partial<
        Pick<
          Project,
          "title" | "description" | "startDate" | "dueDate" | "status"
        >
      >;
    }
  | { type: "SET_STRENGTHS"; strengths: string[] }
  | { type: "ADD_MODULE"; module: ProjectModule }
  | { type: "UPDATE_MODULE"; id: string; patch: Partial<ProjectModule> }
  | { type: "DELETE_MODULE"; id: string }
  | { type: "ADD_MEMBER"; member: TeamMember }
  | { type: "UPDATE_MEMBER"; id: string; patch: Partial<TeamMember> }
  | { type: "DELETE_MEMBER"; id: string };

function touch(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}

export function projectReducer(
  state: Project,
  action: ProjectAction,
): Project {
  switch (action.type) {
    case "HYDRATE":
    case "RESET":
      return action.project;

    case "UPDATE_PROJECT":
      return touch({ ...state, ...action.patch });

    case "SET_STRENGTHS":
      return touch({ ...state, strengths: action.strengths });

    case "ADD_MODULE":
      return touch({ ...state, modules: [...state.modules, action.module] });

    case "UPDATE_MODULE":
      return touch({
        ...state,
        modules: state.modules.map((m) =>
          m.id === action.id ? { ...m, ...action.patch } : m,
        ),
      });

    case "DELETE_MODULE":
      // Removing a module also detaches it from every dependency edge and
      // clears entrega assignments that pointed to it.
      return touch({
        ...state,
        modules: state.modules
          .filter((m) => m.id !== action.id)
          .map((m) => {
            const dropsDep = m.dependsOn.includes(action.id);
            const dropsDeliverable = m.deliverableId === action.id;
            if (!dropsDep && !dropsDeliverable) return m;
            return {
              ...m,
              dependsOn: dropsDep
                ? m.dependsOn.filter((d) => d !== action.id)
                : m.dependsOn,
              deliverableId: dropsDeliverable ? null : m.deliverableId,
            };
          }),
      });

    case "ADD_MEMBER":
      return touch({ ...state, members: [...state.members, action.member] });

    case "UPDATE_MEMBER":
      return touch({
        ...state,
        members: state.members.map((m) =>
          m.id === action.id ? { ...m, ...action.patch } : m,
        ),
      });

    case "DELETE_MEMBER":
      // Removing a member also detaches them from every module assignment.
      return touch({
        ...state,
        members: state.members.filter((m) => m.id !== action.id),
        modules: state.modules.map((m) =>
          m.assigneeIds.includes(action.id)
            ? { ...m, assigneeIds: m.assigneeIds.filter((a) => a !== action.id) }
            : m,
        ),
      });

    default:
      return state;
  }
}
