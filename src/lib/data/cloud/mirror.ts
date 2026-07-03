import type { ProjectMirror } from "../ProjectProvider";
import {
  addCloudMember,
  deleteCloudMember,
  deleteCloudTask,
  setCloudStrengths,
  updateCloudMember,
  updateCloudProject,
  upsertCloudTask,
} from "./actions";

export interface CloudContext {
  projectId: string;
  groupId: string;
  memberId: string;
  joinCode: string;
}

type SyncResult = { ok: true } | { ok: false; error: string };

/**
 * Fire-and-forget echo of local edits to Supabase. A single promise chain
 * preserves order (a task must exist before its follow-up edits arrive);
 * failures are logged and skipped — the local reducer state stays the source
 * of truth for the session, the next full page load re-reads the DB.
 */
export function createCloudMirror(ctx: CloudContext): ProjectMirror {
  let chain: Promise<void> = Promise.resolve();

  const enqueue = (label: string, run: () => Promise<SyncResult>) => {
    chain = chain.then(async () => {
      try {
        const result = await run();
        if (!result.ok) {
          console.error(`[groupy] no se pudo sincronizar ${label}:`, result.error);
        }
      } catch (err) {
        console.error(`[groupy] no se pudo sincronizar ${label}:`, err);
      }
    });
  };

  return {
    updateProject: (patch) =>
      enqueue("el proyecto", () =>
        updateCloudProject({ projectId: ctx.projectId, patch }),
      ),
    setStrengths: (strengths) =>
      enqueue("los puntos fuertes", () =>
        setCloudStrengths({ groupId: ctx.groupId, strengths }),
      ),
    upsertModule: (module) =>
      enqueue("el módulo", () =>
        upsertCloudTask({ groupId: ctx.groupId, module }),
      ),
    deleteModule: (id) =>
      enqueue("el módulo", () =>
        deleteCloudTask({ groupId: ctx.groupId, taskId: id }),
      ),
    addMember: (member) =>
      enqueue("el equipo", () =>
        addCloudMember({ groupId: ctx.groupId, member }),
      ),
    updateMember: (member) =>
      enqueue("el equipo", () =>
        updateCloudMember({ groupId: ctx.groupId, member }),
      ),
    deleteMember: (id, taskPatches) =>
      enqueue("el equipo", () =>
        deleteCloudMember({ groupId: ctx.groupId, memberId: id, taskPatches }),
      ),
  };
}
