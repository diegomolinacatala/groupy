import type { Project, ProjectModule } from "./types";

/**
 * Flow engine — pure derivations over `Project`, no I/O and no React.
 *
 * Groupy models the work as a flow of tasks with two SEPARATE dependency
 * kinds:
 *
 * 1. "direct"  — task → task. `module.dependsOn` lists modules that must be
 *    done before this one unlocks (the padlock).
 * 2. Entregas (deliverable blocks) — modules of type "milestone" act as
 *    ordered delivery blocks. Assigning `module.deliverableId = milestone.id`
 *    derives two extra rules:
 *      a. "block-task": a milestone waits for every module assigned to it
 *         (you can't deliver an entrega with pending tasks).
 *      b. "previous-deliverable": a module assigned to entrega N waits for
 *         entrega N-1 to be marked done (blocks are sequential).
 *
 * A module is LOCKED while any effective prerequisite is not done. The lock
 * is enforced softly at the UI layer (status controls / drags are guarded);
 * the reducer itself never forbids a status change, so relaxing or hardening
 * the rule only touches this file and the components that read it.
 *
 * Everything here is recomputed from scratch on each call — with tens or a
 * few hundred modules that is well below any perf concern, and it keeps the
 * rules trivially editable while the product is still taking shape.
 */

export type FlowState = "locked" | "available" | "done";

export type DependencyKind = "direct" | "block-task" | "previous-deliverable";

export interface FlowLink {
  module: ProjectModule;
  kind: DependencyKind;
}

export interface ModuleFlow {
  module: ProjectModule;
  state: FlowState;
  /** Every prerequisite, done or not — the left side of the mini flowchart. */
  requires: FlowLink[];
  /** Prerequisites still pending — what keeps the module locked. */
  blockers: FlowLink[];
  /** Modules that wait on this one — the right side of the mini flowchart. */
  unlocks: FlowLink[];
  /**
   * Members with a pending module DIRECTLY depending on this one. Drives the
   * coloured padlock in the dependency map ("Carla está esperando esta
   * tarea"). Derived entrega edges are excluded on purpose: milestones are
   * usually assigned to everyone and would turn every square into "all of us
   * are waiting", drowning the signal.
   */
  waitingMemberIds: string[];
}

export interface DeliverableBlock {
  /** The milestone that closes the block; null groups the loose modules. */
  deliverable: ProjectModule | null;
  /** Non-milestone modules assigned to the block, in flow order. */
  modules: ProjectModule[];
}

export interface ProjectFlow {
  byId: Map<string, ModuleFlow>;
  /** Ordered entrega blocks, followed by the "sin entrega" bucket if any. */
  blocks: DeliverableBlock[];
}

const NO_DATE = "9999-12-31";

function byFlowOrder(a: ProjectModule, b: ProjectModule): number {
  const dateA = a.dueDate ?? NO_DATE;
  const dateB = b.dueDate ?? NO_DATE;
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;
  if (a.order !== b.order) return a.order - b.order;
  return a.createdAt.localeCompare(b.createdAt);
}

/** Milestones (entregas) in their sequential order. */
export function orderedDeliverables(project: Project): ProjectModule[] {
  return project.modules
    .filter((m) => m.type === "milestone")
    .sort(byFlowOrder);
}

/**
 * Resolves a module's entrega, tolerating stale data: a `deliverableId`
 * pointing to a deleted module or to one that is no longer a milestone is
 * treated as "sin entrega" instead of blocking anything.
 */
export function deliverableOf(
  project: Project,
  module: ProjectModule,
): ProjectModule | null {
  if (!module.deliverableId || module.type === "milestone") return null;
  const target = project.modules.find((m) => m.id === module.deliverableId);
  return target && target.type === "milestone" ? target : null;
}

/** All prerequisite links of a module, applying the three rules above. */
function requiresOf(
  project: Project,
  module: ProjectModule,
  deliverables: ProjectModule[],
): FlowLink[] {
  const links: FlowLink[] = [];

  for (const depId of module.dependsOn) {
    if (depId === module.id) continue;
    const dep = project.modules.find((m) => m.id === depId);
    if (dep) links.push({ module: dep, kind: "direct" });
  }

  if (module.type === "milestone") {
    for (const member of project.modules) {
      if (member.deliverableId === module.id && member.type !== "milestone") {
        links.push({ module: member, kind: "block-task" });
      }
    }
    return links;
  }

  const block = deliverableOf(project, module);
  if (block) {
    const index = deliverables.findIndex((d) => d.id === block.id);
    const previous = index > 0 ? deliverables[index - 1] : null;
    if (previous) links.push({ module: previous, kind: "previous-deliverable" });
  }

  return links;
}

/** Derives the full flow index (states, blockers, unlocks, entrega blocks). */
export function buildProjectFlow(project: Project): ProjectFlow {
  const deliverables = orderedDeliverables(project);
  const byId = new Map<string, ModuleFlow>();

  for (const mod of project.modules) {
    const requires = requiresOf(project, mod, deliverables);
    const blockers = requires.filter((l) => l.module.status !== "done");
    const state: FlowState =
      mod.status === "done"
        ? "done"
        : blockers.length > 0
          ? "locked"
          : "available";
    byId.set(mod.id, {
      module: mod,
      state,
      requires,
      blockers,
      unlocks: [],
      waitingMemberIds: [],
    });
  }

  // Invert the edges: A requires B  ⇒  B unlocks A.
  for (const flow of byId.values()) {
    for (const link of flow.requires) {
      const target = byId.get(link.module.id);
      if (!target) continue;
      target.unlocks.push({ module: flow.module, kind: link.kind });
      if (link.kind === "direct" && flow.module.status !== "done") {
        for (const memberId of flow.module.assigneeIds) {
          if (!target.waitingMemberIds.includes(memberId)) {
            target.waitingMemberIds.push(memberId);
          }
        }
      }
    }
  }

  const blocks: DeliverableBlock[] = deliverables.map((deliverable) => ({
    deliverable,
    modules: project.modules
      .filter(
        (m) =>
          m.type !== "milestone" &&
          deliverableOf(project, m)?.id === deliverable.id,
      )
      .sort(byFlowOrder),
  }));

  const loose = project.modules
    .filter((m) => m.type !== "milestone" && !deliverableOf(project, m))
    .sort(byFlowOrder);
  if (loose.length > 0) blocks.push({ deliverable: null, modules: loose });

  return { byId, blocks };
}

/** Ids of every locked module — handy for calendar / board decorations. */
export function lockedModuleIds(project: Project): Set<string> {
  const flow = buildProjectFlow(project);
  const locked = new Set<string>();
  for (const [id, entry] of flow.byId) {
    if (entry.state === "locked") locked.add(id);
  }
  return locked;
}

/**
 * Whether adding `candidateDepId` to `moduleId.dependsOn` would create a
 * cycle. Walks the FULL effective graph (direct + derived entrega edges) so
 * a task can't end up waiting on itself through a milestone either.
 */
export function wouldCreateCycle(
  project: Project,
  moduleId: string,
  candidateDepId: string,
): boolean {
  if (moduleId === candidateDepId) return true;
  const deliverables = orderedDeliverables(project);

  // Depth-first from the candidate: if we can reach `moduleId` following
  // prerequisite edges, then `moduleId` is (transitively) a prerequisite of
  // the candidate and the new edge would close a loop.
  const visited = new Set<string>();
  const stack = [candidateDepId];
  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (currentId === moduleId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const current = project.modules.find((m) => m.id === currentId);
    if (!current) continue;
    for (const link of requiresOf(project, current, deliverables)) {
      stack.push(link.module.id);
    }
  }
  return false;
}
