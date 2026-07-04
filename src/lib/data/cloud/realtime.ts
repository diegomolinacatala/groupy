"use client";

import { useEffect, useRef } from "react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import type { ProjectAction } from "../reducer";
import {
  jsonToMemberStrengths,
  memberRowToTeamMember,
  rowsToProject,
  taskRowToBlock,
  taskRowToModule,
  toIsoDate,
} from "./mapping";

// Durable live sync for a cloud dashboard: one channel of postgres_changes
// over the four tables the UI renders, translated into APPLY_REMOTE_* reducer
// actions. RLS does the access control (a subscriber only receives rows their
// SELECT policies allow — the teacher hard rule holds); this hook only maps.
//
// Echo handling: task rows carry `last_origin` (the writing tab's ephemeral
// id) — events born in this tab are dropped here, everything else lands in
// the reducer, whose equality bail absorbs any echo this filter can't see
// (member/group/project rows have no origin column).
//
// DELETE events arrive WITHOUT a filter: once a row is gone only its primary
// key survives, so group filters can't match. Applying a delete for an id we
// never knew is a no-op by design.

interface CloudRealtimeArgs {
  projectId: string;
  groupId: string;
  tabId: string;
  apply: (action: ProjectAction) => void;
}

/** Full re-read (same shape as the server loader) — used after reconnects. */
async function fetchSnapshot(
  projectId: string,
  groupId: string,
): Promise<ProjectAction | null> {
  const supabase = createClient();
  const [projectRes, groupRes, membersRes, tasksRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("groups").select("*").eq("id", groupId).single(),
    supabase
      .from("group_members")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at")
      .order("id"),
    supabase
      .from("tasks")
      .select("*")
      .eq("group_id", groupId)
      .order("sort_order")
      .order("created_at"),
  ]);
  if (projectRes.error || groupRes.error || membersRes.error || tasksRes.error) {
    return null;
  }
  return {
    type: "HYDRATE",
    project: rowsToProject(
      projectRes.data,
      groupRes.data,
      membersRes.data,
      tasksRes.data,
    ),
  };
}

export function useCloudRealtime({
  projectId,
  groupId,
  tabId,
  apply,
}: CloudRealtimeArgs) {
  // Latest apply behind a ref so the subscription effect never re-runs.
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  }, [apply]);

  useEffect(() => {
    // Local (demo) dashboards call this hook with empty ids — no-op.
    if (!projectId || !groupId) return;

    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    // Set after the FIRST successful subscribe: a later re-subscribe means a
    // gap in the event stream → re-read everything once.
    let everSubscribed = false;

    const onTaskRow = (
      payload: RealtimePostgresChangesPayload<Tables<"tasks">>,
    ) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as Partial<Tables<"tasks">>).id;
        if (id) applyRef.current({ type: "APPLY_REMOTE_TASKROW_DELETE", id });
        return;
      }
      const row = payload.new;
      if (row.group_id !== groupId) return; // unfiltered delete sub overlap-guard
      if (row.last_origin === tabId) return; // our own echo
      if (row.type === "milestone") {
        applyRef.current({
          type: "APPLY_REMOTE_BLOCK",
          block: taskRowToBlock(row),
        });
      } else {
        applyRef.current({
          type: "APPLY_REMOTE_MODULE",
          module: taskRowToModule(row),
        });
      }
    };

    const onMemberRow = (
      payload: RealtimePostgresChangesPayload<Tables<"group_members">>,
    ) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as Partial<Tables<"group_members">>).id;
        if (id) applyRef.current({ type: "APPLY_REMOTE_MEMBER_DELETE", id });
        return;
      }
      const row = payload.new;
      if (row.group_id !== groupId) return;
      applyRef.current({
        type: "APPLY_REMOTE_MEMBER",
        // Strengths live on the groups row; the reducer preserves local ones.
        member: memberRowToTeamMember(row, {}),
      });
    };

    const onGroupRow = (
      payload: RealtimePostgresChangesPayload<Tables<"groups">>,
    ) => {
      if (payload.eventType !== "UPDATE") return;
      applyRef.current({
        type: "APPLY_REMOTE_STRENGTHS",
        record: jsonToMemberStrengths(payload.new.strengths),
      });
    };

    const onProjectRow = (
      payload: RealtimePostgresChangesPayload<Tables<"projects">>,
    ) => {
      if (payload.eventType !== "UPDATE") return;
      const row = payload.new;
      applyRef.current({
        type: "APPLY_REMOTE_PROJECT",
        patch: {
          title: row.title,
          description: row.description,
          startDate: toIsoDate(row.start_date),
          dueDate: toIsoDate(row.due_at),
          status: row.status,
        },
      });
    };

    const subscribe = async () => {
      // Realtime authenticates with the session token; make sure the cookie
      // session is loaded before joining, or RLS would see an anonymous
      // visitor and deliver nothing — silently.
      await supabase.auth.getSession();
      if (cancelled) return;

      channel = supabase
        .channel(`db:${groupId}`)
        .on<Tables<"tasks">>(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "tasks",
            filter: `group_id=eq.${groupId}`,
          },
          onTaskRow,
        )
        .on<Tables<"tasks">>(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "tasks",
            filter: `group_id=eq.${groupId}`,
          },
          onTaskRow,
        )
        .on<Tables<"tasks">>(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "tasks" },
          onTaskRow,
        )
        .on<Tables<"group_members">>(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "group_members",
            filter: `group_id=eq.${groupId}`,
          },
          onMemberRow,
        )
        .on<Tables<"group_members">>(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "group_members",
            filter: `group_id=eq.${groupId}`,
          },
          onMemberRow,
        )
        .on<Tables<"group_members">>(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "group_members" },
          onMemberRow,
        )
        .on<Tables<"groups">>(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "groups",
            filter: `id=eq.${groupId}`,
          },
          onGroupRow,
        )
        .on<Tables<"projects">>(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "projects",
            filter: `id=eq.${projectId}`,
          },
          onProjectRow,
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          if (!everSubscribed) {
            everSubscribed = true;
            return;
          }
          // Rejoined after a drop: events were missed — re-read everything.
          void fetchSnapshot(projectId, groupId).then((action) => {
            if (!cancelled && action) applyRef.current(action);
          });
        });
    };

    void subscribe();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [projectId, groupId, tabId]);
}
