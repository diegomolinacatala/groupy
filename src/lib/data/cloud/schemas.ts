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
});

export const projectModuleSchema = z.object({
  id: z.uuid(),
  title: z.string().max(200),
  description: z.string().max(4000),
  type: z.enum(["task", "milestone", "objective"]),
  status: z.enum(["todo", "in_progress", "done"]),
  dueDate: isoDate.nullable(),
  assigneeIds: z.array(z.uuid()).max(20),
  checklist: z.array(checklistItemSchema).max(100),
  order: z.number().int().min(0).max(100_000),
  createdAt: z.iso.datetime(),
});

export const createProjectInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000),
  startDate: isoDate.nullable(),
  dueDate: isoDate.nullable(),
  strengths: z.array(z.string().min(1).max(100)).max(30),
  members: z.array(teamMemberSchema).min(1).max(20),
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

export const strengthsInputSchema = z.object({
  groupId: z.uuid(),
  strengths: z.array(z.string().min(1).max(100)).max(30),
});

export const upsertTaskInputSchema = z.object({
  groupId: z.uuid(),
  module: projectModuleSchema,
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
