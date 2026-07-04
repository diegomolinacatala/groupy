import { z } from "zod";

// Zod contracts for the cloud slice. Every Server Function parses its input
// with these before touching Supabase — actions are reachable by direct POST,
// so the client's TypeScript types guarantee nothing.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const checklistItemSchema = z.object({
  id: z.uuid(),
  text: z.string().max(500),
  done: z.boolean(),
});

export const teamMemberSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  email: z.string().max(200),
  role: z.string().max(100),
  colorKey: z.string().max(40),
  isCoordinator: z.boolean(),
  // Carried in the local model; persisted via the group's strengths record,
  // never on the member row.
  strengths: z.array(z.string().max(100)).max(30).default([]),
});

export const projectBlockSchema = z.object({
  id: z.uuid(),
  name: z.string().max(200),
  mode: z.enum(["sequence", "independent"]),
  order: z.number().int().min(0).max(100_000),
});

export const projectModuleSchema = z.object({
  id: z.uuid(),
  title: z.string().max(200),
  description: z.string().max(4000),
  status: z.enum(["todo", "in_progress", "done"]),
  dueDate: isoDate.nullable(),
  assigneeIds: z.array(z.uuid()).max(20),
  checklist: z.array(checklistItemSchema).max(100),
  // Flow fields — persisted since the task-flow columns migration. Defaults
  // keep pre-redesign payloads valid. Importance is continuous (real in DB).
  dependsOn: z.array(z.uuid()).max(50).default([]),
  blockId: z.uuid().nullable().default(null),
  importance: z.number().min(1).max(10).default(5),
  docType: z
    .enum(["doc", "slides", "sheet", "pdf", "code", "image"])
    .nullable()
    .default(null),
  mapX: z.number().min(0).max(1).nullable().default(null),
  mapY: z.number().min(0).max(1).nullable().default(null),
  order: z.number().int().min(0).max(100_000),
  // offset:true is LOAD-BEARING: Supabase returns created_at as
  // "…+00:00" (not "…Z"), and without it every edit to a cloud-loaded task
  // failed validation — the mirror dropped the write silently.
  createdAt: z.iso.datetime({ offset: true }),
});

export const createProjectInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000),
  startDate: isoDate.nullable(),
  dueDate: isoDate.nullable(),
  members: z.array(teamMemberSchema).min(1).max(20),
  blocks: z.array(projectBlockSchema).max(50),
  modules: z.array(projectModuleSchema).max(300),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

// Patch of the shared project meta — title may be empty mid-edit (the inline
// title field commits whatever the user leaves).
export const projectMetaPatchSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
  startDate: isoDate.nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  status: z.enum(["active", "in_review", "closed"]).optional(),
});

export const updateProjectInputSchema = z.object({
  projectId: z.uuid(),
  patch: projectMetaPatchSchema,
});

export const memberStrengthsInputSchema = z.object({
  memberId: z.uuid(),
  strengths: z.array(z.string().min(1).max(100)).max(30),
});

export const upsertTaskInputSchema = z.object({
  groupId: z.uuid(),
  module: projectModuleSchema,
});

export const upsertBlockInputSchema = z.object({
  groupId: z.uuid(),
  block: projectBlockSchema,
});

export const deleteTaskInputSchema = z.object({
  groupId: z.uuid(),
  taskId: z.uuid(),
});

export const memberInputSchema = z.object({
  groupId: z.uuid(),
  member: teamMemberSchema,
});

export const deleteMemberInputSchema = z.object({
  groupId: z.uuid(),
  memberId: z.uuid(),
  // Tasks that referenced the removed member, with their already-filtered
  // assignee lists (the reducer computes these as part of DELETE_MEMBER).
  taskPatches: z
    .array(z.object({ id: z.uuid(), assigneeIds: z.array(z.uuid()).max(20) }))
    .max(300),
});

export const claimInputSchema = z.object({
  memberId: z.uuid(),
});

// --- RPC response contracts -------------------------------------------------

export const rpcCreateResultSchema = z.object({
  project_id: z.uuid(),
  group_id: z.uuid(),
  join_code: z.string().min(4).max(12),
});

export const rpcClaimResultSchema = z.object({
  member_id: z.uuid(),
  group_id: z.uuid(),
  project_id: z.uuid(),
  join_code: z.string().min(4).max(12),
});

export const projectPreviewSchema = z.object({
  project: z.object({
    id: z.uuid(),
    title: z.string(),
    description: z.string(),
    status: z.enum(["active", "in_review", "closed"]),
    join_code: z.string(),
  }),
  members: z.array(
    z.object({
      id: z.uuid(),
      display_name: z.string(),
      role: z.string(),
      color_key: z.string(),
      is_coordinator: z.boolean(),
      claimed: z.boolean(),
      is_self: z.boolean(),
    }),
  ),
  my_member_id: z.uuid().nullable(),
});
export type ProjectPreview = z.infer<typeof projectPreviewSchema>;
