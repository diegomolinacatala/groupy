"use client";

import { useState, type ReactNode } from "react";
import { ProjectProvider } from "../ProjectProvider";
import type { Project } from "../types";
import { createCloudMirror } from "./mirror";
import type { TemplateEditorContext } from "./teacher-load";

/**
 * Bridges a server-loaded TEMPLATE into the shared ProjectProvider: the same
 * reducer + mirror the dashboards use, minus everything member-shaped — no
 * live room (there is no team to be present), no claimed identity, and
 * kind: "template" so the shared views hide estado/responsables.
 * postgres_changes still flows (realtime.ts), so two teacher tabs converge.
 */
export function TemplateProvider({
  project,
  ctx,
  children,
}: {
  project: Project;
  ctx: TemplateEditorContext;
  children: ReactNode;
}) {
  const [tabId] = useState(() => crypto.randomUUID());
  const [mirror] = useState(() =>
    // memberId is only consumed by the live room; the mirror never reads it.
    createCloudMirror({ ...ctx, memberId: "", tabId }),
  );

  return (
    <ProjectProvider
      cloud={{
        project,
        joinCode: ctx.joinCode,
        currentMemberId: null,
        mirror,
        projectId: ctx.projectId,
        groupId: ctx.groupId,
        tabId,
        kind: "template",
      }}
    >
      {children}
    </ProjectProvider>
  );
}
