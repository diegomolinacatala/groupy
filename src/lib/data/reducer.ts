import type {
  Project,
  ProjectBlock,
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
  | { type: "ADD_MODULE"; module: ProjectModule }
  | { type: "UPDATE_MODULE"; id: string; patch: Partial<ProjectModule> }
  | { type: "DELETE_MODULE"; id: string }
  | { type: "REORDER_MODULES"; orderedIds: string[] }
  | { type: "ADD_BLOCK"; block: ProjectBlock }
  | { type: "UPDATE_BLOCK"; id: string; patch: Partial<ProjectBlock> }
  | { type: "DELETE_BLOCK"; id: string }
  | { type: "REORDER_BLOCKS"; orderedIds: string[] }
  | { type: "ADD_MEMBER"; member: TeamMember }
  | { type: "UPDATE_MEMBER"; id: string; patch: Partial<TeamMember> }
  | { type: "DELETE_MEMBER"; id: string };

function touch(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}

/** New `order` per id from its position in `orderedIds`; others keep theirs. */
function orderIndex(orderedIds: string[]): Map<string, number> {
  return new Map(orderedIds.map((id, index) => [id, index]));
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
      // Removing a task also detaches it from every dependency edge.
      return touch({
        ...state,
        modules: state.modules
          .filter((m) => m.id !== action.id)
          .map((m) =>
            m.dependsOn.includes(action.id)
              ? { ...m, dependsOn: m.dependsOn.filter((d) => d !== action.id) }
              : m,
          ),
      });

    case "REORDER_MODULES": {
      const index = orderIndex(action.orderedIds);
      return touch({
        ...state,
        modules: state.modules.map((m) => {
          const order = index.get(m.id);
          return order !== undefined && order !== m.order
            ? { ...m, order }
            : m;
        }),
      });
    }

    case "ADD_BLOCK":
      return touch({ ...state, blocks: [...state.blocks, action.block] });

    case "UPDATE_BLOCK":
      return touch({
        ...state,
        blocks: state.blocks.map((b) =>
          b.id === action.id ? { ...b, ...action.patch } : b,
        ),
      });

    case "DELETE_BLOCK": {
      // Every task lives in exactly one block: orphans move to the first
      // remaining block (by order). Deleting the last block is refused —
      // the UI never offers it.
      const remaining = state.blocks
        .filter((b) => b.id !== action.id)
        .sort((a, b) => a.order - b.order);
      if (remaining.length === 0) return state;
      const fallbackId = remaining[0].id;
      return touch({
        ...state,
        blocks: remaining,
        modules: state.modules.map((m) =>
          m.blockId === action.id ? { ...m, blockId: fallbackId } : m,
        ),
      });
    }

    case "REORDER_BLOCKS": {
      const index = orderIndex(action.orderedIds);
      return touch({
        ...state,
        blocks: state.blocks.map((b) => {
          const order = index.get(b.id);
          return order !== undefined && order !== b.order
            ? { ...b, order }
            : b;
        }),
      });
    }

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
      // Removing a member also detaches them from every task assignment.
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
