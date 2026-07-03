import type {
  Project,
  ProjectBlock,
  ProjectModule,
  TeamMember,
} from "./types";

/**
 * Flow engine — pure derivations over `Project`, no I/O and no React.
 *
 * Two SEPARATE gating mechanisms, never mixed:
 *
 * 1. Candado (task → task). `module.dependsOn` lists tasks that must be done
 *    before this one unlocks. This is the only padlock, and the only edge
 *    kind in the dependency map.
 * 2. Orden de bloques (block → block). Blocks marked "sequence" form a
 *    chain in `block.order`: a sequence block opens when every earlier
 *    sequence block is complete (all of its tasks done). "independent"
 *    blocks are always open. Blocks are containers — they are NOT nodes of
 *    the task graph and never appear in `dependsOn`.
 *
 * A task is LOCKED while any direct prerequisite is pending OR its block
 * hasn't opened. The lock is enforced softly at the UI layer; the reducer
 * never forbids a status change, so relaxing or hardening the rule only
 * touches this file and the components that read it.
 *
 * Everything is recomputed from scratch on each call — trivial at prototype
 * scale, and it keeps the rules easy to edit.
 */

export type FlowState = "locked" | "available" | "done";

/** waiting = a previous sequence block is still incomplete. */
export type BlockState = "waiting" | "open" | "complete";

export interface BlockFlow {
  block: ProjectBlock;
  state: BlockState;
  /** Tasks of this block, in flow order. */
  modules: ProjectModule[];
  doneCount: number;
  /** For waiting blocks: the nearest incomplete sequence block before it. */
  waitsFor: ProjectBlock | null;
}

export interface ModuleFlow {
  module: ProjectModule;
  state: FlowState;
  /** Direct task→task prerequisites, done or not. */
  requires: ProjectModule[];
  /** Direct prerequisites still pending — the closed padlock. */
  blockers: ProjectModule[];
  /** Tasks that directly depend on this one. */
  unlocks: ProjectModule[];
  /** Set when the task's block hasn't opened yet (block gate, not padlock). */
  waitingForBlock: ProjectBlock | null;
  /**
   * Members with a pending task directly depending on this one — drives the
   * tinted padlock ("Carla está esperando esta tarea").
   */
  waitingMemberIds: string[];
}

export interface ProjectFlow {
  byId: Map<string, ModuleFlow>;
  blockById: Map<string, BlockFlow>;
  /** Every block in `order`, each with its tasks. */
  blocks: BlockFlow[];
}

const NO_DATE = "9999-12-31";

function byFlowOrder(a: ProjectModule, b: ProjectModule): number {
  if (a.order !== b.order) return a.order - b.order;
  const dateA = a.dueDate ?? NO_DATE;
  const dateB = b.dueDate ?? NO_DATE;
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;
  return a.createdAt.localeCompare(b.createdAt);
}

/** Blocks in their sequence order. */
export function orderedBlocks(project: Project): ProjectBlock[] {
  return [...project.blocks].sort((a, b) => a.order - b.order);
}

/**
 * Resolves a task's block, tolerating stale data: a `blockId` pointing to a
 * deleted block falls back to the first block (the data layer normalizes on
 * load, so this only covers mid-session races).
 */
export function blockOf(
  project: Project,
  module: ProjectModule,
): ProjectBlock | null {
  const blocks = orderedBlocks(project);
  if (blocks.length === 0) return null;
  return blocks.find((b) => b.id === module.blockId) ?? blocks[0];
}

/** Derives the full flow index: block states, task states, edges. */
export function buildProjectFlow(project: Project): ProjectFlow {
  const blocks = orderedBlocks(project);

  // Group tasks into their blocks (stale/null blockId → first block).
  const tasksByBlock = new Map<string, ProjectModule[]>(
    blocks.map((b) => [b.id, []]),
  );
  for (const mod of project.modules) {
    const block = blockOf(project, mod);
    if (block) tasksByBlock.get(block.id)!.push(mod);
  }
  for (const list of tasksByBlock.values()) list.sort(byFlowOrder);

  // Block states. A block is complete when all of its tasks are done (an
  // empty block never holds the chain). A sequence block opens when every
  // earlier sequence block is complete; independent blocks are always open.
  const blockById = new Map<string, BlockFlow>();
  const blockFlows: BlockFlow[] = [];
  let pendingSequenceBlock: ProjectBlock | null = null;
  for (const block of blocks) {
    const modules = tasksByBlock.get(block.id)!;
    const doneCount = modules.filter((m) => m.status === "done").length;
    const complete = doneCount === modules.length;
    let state: BlockState;
    let waitsFor: ProjectBlock | null = null;
    if (block.mode === "independent") {
      state = complete && modules.length > 0 ? "complete" : "open";
    } else if (pendingSequenceBlock) {
      state = "waiting";
      waitsFor = pendingSequenceBlock;
    } else {
      state = complete && modules.length > 0 ? "complete" : "open";
    }
    if (block.mode === "sequence" && !complete) {
      pendingSequenceBlock = block;
    }
    const flow: BlockFlow = { block, state, modules, doneCount, waitsFor };
    blockById.set(block.id, flow);
    blockFlows.push(flow);
  }

  // Task states.
  const byId = new Map<string, ModuleFlow>();
  for (const mod of project.modules) {
    const requires: ProjectModule[] = [];
    for (const depId of mod.dependsOn) {
      if (depId === mod.id) continue;
      const dep = project.modules.find((m) => m.id === depId);
      if (dep) requires.push(dep);
    }
    const blockers = requires.filter((d) => d.status !== "done");
    const block = blockOf(project, mod);
    const blockFlow = block ? blockById.get(block.id) : null;
    // The gate names the block being waited on, not the task's own block.
    const waitingForBlock =
      blockFlow && blockFlow.state === "waiting" ? blockFlow.waitsFor : null;
    const state: FlowState =
      mod.status === "done"
        ? "done"
        : blockers.length > 0 || waitingForBlock
          ? "locked"
          : "available";
    byId.set(mod.id, {
      module: mod,
      state,
      requires,
      blockers,
      unlocks: [],
      waitingForBlock,
      waitingMemberIds: [],
    });
  }

  // Invert the edges: A requires B  ⇒  B unlocks A.
  for (const flow of byId.values()) {
    for (const dep of flow.requires) {
      const target = byId.get(dep.id);
      if (!target) continue;
      target.unlocks.push(flow.module);
      if (flow.module.status !== "done") {
        for (const memberId of flow.module.assigneeIds) {
          if (!target.waitingMemberIds.includes(memberId)) {
            target.waitingMemberIds.push(memberId);
          }
        }
      }
    }
  }

  return { byId, blockById, blocks: blockFlows };
}

/** Ids of every locked task — handy for calendar / board decorations. */
export function lockedModuleIds(project: Project): Set<string> {
  const flow = buildProjectFlow(project);
  const locked = new Set<string>();
  for (const [id, entry] of flow.byId) {
    if (entry.state === "locked") locked.add(id);
  }
  return locked;
}

/**
 * Members (other than `selfId`) whose pending tasks are blocking this one —
 * the short "Diego está bloqueando" notice. Direct deps only.
 */
export function blockingMembers(
  entry: ModuleFlow,
  members: TeamMember[],
  selfId: string | null,
): TeamMember[] {
  const ids = new Set<string>();
  for (const blocker of entry.blockers) {
    for (const memberId of blocker.assigneeIds) {
      if (memberId !== selfId) ids.add(memberId);
    }
  }
  return members.filter((m) => ids.has(m.id));
}

/**
 * Whether adding `candidateDepId` to `moduleId.dependsOn` would create a
 * cycle. Task→task edges only — blocks are not part of this graph.
 */
export function wouldCreateCycle(
  project: Project,
  moduleId: string,
  candidateDepId: string,
): boolean {
  if (moduleId === candidateDepId) return true;

  // Depth-first from the candidate: if we can reach `moduleId` following
  // dependency edges, the new edge would close a loop.
  const visited = new Set<string>();
  const stack = [candidateDepId];
  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (currentId === moduleId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const current = project.modules.find((m) => m.id === currentId);
    if (!current) continue;
    for (const depId of current.dependsOn) stack.push(depId);
  }
  return false;
}
