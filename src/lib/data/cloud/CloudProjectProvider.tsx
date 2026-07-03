"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ProjectProvider } from "../ProjectProvider";
import type { Project } from "../types";
import { createCloudMirror, type CloudContext } from "./mirror";
import { saveLastCloudProject } from "./recent";

/**
 * Bridges a server-loaded cloud project into the shared ProjectProvider:
 * same reducer, same UI — every edit additionally mirrored to Supabase.
 */
export function CloudProjectProvider({
  project,
  ctx,
  children,
}: {
  project: Project;
  ctx: CloudContext;
  children: ReactNode;
}) {
  // One mirror (and one ordering queue) per mounted dashboard; lazy state
  // keeps it stable across renders without touching a ref during render.
  const [mirror] = useState(() => createCloudMirror(ctx));

  useEffect(() => {
    saveLastCloudProject({ code: ctx.joinCode, title: project.title });
    // Snapshot on mount only — later title edits update it on the next visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ProjectProvider cloud={{ project, joinCode: ctx.joinCode, mirror }}>
      {children}
    </ProjectProvider>
  );
}
