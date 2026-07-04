"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ProjectProvider } from "../ProjectProvider";
import type { Project } from "../types";
import { createCloudMirror, type CloudContext } from "./mirror";
import { LiveRoomProvider } from "./live";
import { saveLastCloudProject } from "./recent";

/**
 * Bridges a server-loaded cloud project into the shared ProjectProvider:
 * same reducer, same UI — every edit additionally mirrored to Supabase,
 * teammates' edits streamed back in (realtime.ts), and the ephemeral layer
 * (presence, cursors, flying tasks) running on its own broadcast channel.
 */
export function CloudProjectProvider({
  project,
  ctx,
  children,
}: {
  project: Project;
  /** Server-loaded context; the tab id is minted client-side below. */
  ctx: Omit<CloudContext, "tabId">;
  children: ReactNode;
}) {
  // One id per mounted dashboard: stamps this tab's writes (echo suppression)
  // and keys its presence in the live room.
  const [tabId] = useState(() => crypto.randomUUID());
  // One mirror (and one ordering queue) per mounted dashboard; lazy state
  // keeps it stable across renders without touching a ref during render.
  const [mirror] = useState(() => createCloudMirror({ ...ctx, tabId }));

  useEffect(() => {
    saveLastCloudProject({ code: ctx.joinCode, title: project.title });
    // Snapshot on mount only — later title edits update it on the next visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LiveRoomProvider
      groupId={ctx.groupId}
      memberId={ctx.memberId}
      tabId={tabId}
    >
      <ProjectProvider
        cloud={{
          project,
          joinCode: ctx.joinCode,
          currentMemberId: ctx.memberId,
          mirror,
          projectId: ctx.projectId,
          groupId: ctx.groupId,
          tabId,
        }}
      >
        {children}
      </ProjectProvider>
    </LiveRoomProvider>
  );
}
