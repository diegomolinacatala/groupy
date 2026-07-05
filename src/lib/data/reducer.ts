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
  | { type: "DELETE_MEMBER"; id: string }
  // --- Remote application (realtime) ---------------------------------------
  // Upsert-by-id semantics with an equality bail: applying an event that
  // changes nothing returns the SAME state reference (no re-render), which is
  // also what neutralizes any echo the origin-tag filter didn't catch.
  | { type: "APPLY_REMOTE_MODULE"; module: ProjectModule }
  | { type: "APPLY_REMOTE_BLOCK"; block: ProjectBlock }
  // A deleted `tasks` row is a TAREA or a BLOQUE — only the id survives the
  // delete event, so the reducer decides by looking the id up.
  | { type: "APPLY_REMOTE_TASKROW_DELETE"; id: string }
  | { type: "APPLY_REMOTE_MEMBER"; member: TeamMember }
  | { type: "APPLY_REMOTE_MEMBER_DELETE"; id: string }
  | {
      type: "APPLY_REMOTE_PROJECT";
      patch: Partial<
        Pick<
          Project,
          "title" | "description" | "startDate" | "dueDate" | "status"
        >
      >;
    }
  | {
      type: "APPLY_REMOTE_STRENGTHS";
      record: Record<string, string[]>;
    };

/**
 * The remote-application subset of {@link ProjectAction}: the actions the
 * realtime layer (postgres_changes) and the broadcast-first fast path
 * (live.tsx) dispatch when a teammate's edit arrives. Every variant is pure
 * data, so it round-trips as a broadcast JSON payload unchanged.
 */
export type RemoteAction = Extract<
  ProjectAction,
  { type: `APPLY_REMOTE_${string}` }
>;

function touch(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}

// --- Equality helpers for remote application --------------------------------
// Field-by-field (never JSON.stringify: key order differs between locally
// built objects and DB-mapped rows). createdAt is deliberately excluded from
// module equality — the same instant arrives as "…Z" locally and "…+00:00"
// from Supabase.

function sameStrings(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameModule(a: ProjectModule, b: ProjectModule): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.description === b.description &&
    a.status === b.status &&
    a.dueDate === b.dueDate &&
    sameStrings(a.assigneeIds, b.assigneeIds) &&
    a.checklist.length === b.checklist.length &&
    a.checklist.every((item, i) => {
      const other = b.checklist[i];
      return (
        item.id === other.id &&
        item.text === other.text &&
        item.done === other.done
      );
    }) &&
    sameStrings(a.dependsOn, b.dependsOn) &&
    a.blockId === b.blockId &&
    a.importance === b.importance &&
    a.docType === b.docType &&
    a.mapX === b.mapX &&
    a.mapY === b.mapY &&
    a.order === b.order
  );
}

function sameBlock(a: ProjectBlock, b: ProjectBlock): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.mode === b.mode &&
    a.order === b.order
  );
}

function sameMember(a: TeamMember, b: TeamMember): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.email === b.email &&
    a.role === b.role &&
    a.colorKey === b.colorKey &&
    a.isCoordinator === b.isCoordinator &&
    sameStrings(a.strengths, b.strengths)
  );
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

    // --- Remote application (realtime) --------------------------------------

    case "APPLY_REMOTE_MODULE": {
      // Normalize blockId against the CURRENT block list, the same tolerance
      // blockOf() applies: a block deleted mid-race falls back to the first.
      const blocks = [...state.blocks].sort((a, b) => a.order - b.order);
      const blockId =
        action.module.blockId && blocks.some((b) => b.id === action.module.blockId)
          ? action.module.blockId
          : (blocks[0]?.id ?? action.module.blockId);
      const incoming = { ...action.module, blockId };
      const existing = state.modules.find((m) => m.id === incoming.id);
      if (!existing) {
        return touch({ ...state, modules: [...state.modules, incoming] });
      }
      // Keep the local createdAt string: same instant, possibly different
      // format — swapping it would churn sort tiebreaks for nothing.
      const next = { ...incoming, createdAt: existing.createdAt };
      if (sameModule(existing, next)) return state;
      return touch({
        ...state,
        modules: state.modules.map((m) => (m.id === next.id ? next : m)),
      });
    }

    case "APPLY_REMOTE_BLOCK": {
      const existing = state.blocks.find((b) => b.id === action.block.id);
      if (!existing) {
        return touch({ ...state, blocks: [...state.blocks, action.block] });
      }
      if (sameBlock(existing, action.block)) return state;
      return touch({
        ...state,
        blocks: state.blocks.map((b) =>
          b.id === action.block.id ? action.block : b,
        ),
      });
    }

    case "APPLY_REMOTE_TASKROW_DELETE":
      // DELETE_BLOCK refuses to drop the last block — correct here too: if
      // the remote group really emptied its blocks, the client-side "one
      // block always exists" invariant wins until the next full load.
      return state.blocks.some((b) => b.id === action.id)
        ? projectReducer(state, { type: "DELETE_BLOCK", id: action.id })
        : state.modules.some((m) => m.id === action.id)
          ? projectReducer(state, { type: "DELETE_MODULE", id: action.id })
          : state;

    case "APPLY_REMOTE_MEMBER": {
      const existing = state.members.find((m) => m.id === action.member.id);
      if (!existing) {
        return touch({ ...state, members: [...state.members, action.member] });
      }
      // Strengths travel on the groups row, not the member row — keep local.
      const next = { ...action.member, strengths: existing.strengths };
      if (sameMember(existing, next)) return state;
      return touch({
        ...state,
        members: state.members.map((m) => (m.id === next.id ? next : m)),
      });
    }

    case "APPLY_REMOTE_MEMBER_DELETE":
      return state.members.some((m) => m.id === action.id)
        ? projectReducer(state, { type: "DELETE_MEMBER", id: action.id })
        : state;

    case "APPLY_REMOTE_PROJECT": {
      const patch = action.patch;
      const dirty = (Object.keys(patch) as (keyof typeof patch)[]).some(
        (key) => patch[key] !== undefined && patch[key] !== state[key],
      );
      if (!dirty) return state;
      return touch({ ...state, ...patch });
    }

    case "APPLY_REMOTE_STRENGTHS": {
      let changed = false;
      const members = state.members.map((m) => {
        const strengths = action.record[m.id] ?? [];
        if (sameStrings(m.strengths, strengths)) return m;
        changed = true;
        return { ...m, strengths };
      });
      if (!changed) return state;
      return touch({ ...state, members });
    }

    default:
      return state;
  }
}
