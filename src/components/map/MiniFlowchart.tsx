"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Lock, PenLine } from "lucide-react";
import { AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import type { FlowLink, ModuleFlow, ProjectFlow } from "@/lib/data/flow";
import { MODULE_TYPE_META, type TeamMember } from "@/lib/data/types";
import { deadlineLabel } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

interface MiniFlowchartProps {
  flow: ProjectFlow;
  centerId: string;
  members: TeamMember[];
  /** Re-centre the chart on another node (navigate the graph). */
  onSelect: (id: string) => void;
  /** Open the module editor. */
  onOpen: (id: string) => void;
}

interface Connector {
  key: string;
  d: string;
  stroke: string;
  dashed: boolean;
}

function kindCaption(kind: FlowLink["kind"], side: "left" | "right"): string | null {
  if (side === "left") {
    if (kind === "previous-deliverable") return "entrega anterior";
    if (kind === "block-task") return "tarea de esta entrega";
    return null;
  }
  if (kind === "previous-deliverable") return "de la siguiente entrega";
  if (kind === "block-task") return "cierra su entrega";
  return null;
}

function stateIcon(entry: ModuleFlow | undefined) {
  if (!entry) return null;
  if (entry.state === "done") {
    return (
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-done text-white">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (entry.state === "locked") {
    return <Lock className="h-3.5 w-3.5 shrink-0 text-muted" />;
  }
  return (
    <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-line-strong" />
  );
}

function SideNode({
  link,
  side,
  entry,
  members,
  onSelect,
  nodeRef,
}: {
  link: FlowLink;
  side: "left" | "right";
  entry: ModuleFlow | undefined;
  members: TeamMember[];
  onSelect: () => void;
  nodeRef: (el: HTMLButtonElement | null) => void;
}) {
  const caption = kindCaption(link.kind, side);
  const assignees = members.filter((m) =>
    link.module.assigneeIds.includes(m.id),
  );
  return (
    <button
      ref={nodeRef}
      type="button"
      onClick={onSelect}
      className="flex w-44 flex-col gap-1.5 rounded-lg border border-line bg-surface p-2.5 text-left shadow-card transition-colors hover:border-line-strong"
    >
      <span className="flex items-start gap-1.5">
        {stateIcon(entry)}
        <span
          className={cn(
            "min-w-0 flex-1 text-xs font-medium leading-snug text-ink",
            link.module.status === "done" && "text-muted line-through",
          )}
        >
          {link.module.title || "Sin título"}
        </span>
      </span>
      <span className="flex items-center justify-between gap-2 pl-5.5">
        {caption ? (
          <span className="text-[10px] uppercase tracking-wide text-muted-2">
            {caption}
          </span>
        ) : (
          <span />
        )}
        <AvatarStack members={assignees} size="xs" max={2} />
      </span>
    </button>
  );
}

/**
 * Three-column flowchart around a task: what it needs (left) and what it
 * unlocks (right), with measured SVG connectors between the real DOM nodes.
 */
export function MiniFlowchart({
  flow,
  centerId,
  members,
  onSelect,
  onOpen,
}: MiniFlowchartProps) {
  const entry = flow.byId.get(centerId);
  const containerRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const nodeEls = useRef(new Map<string, HTMLButtonElement>());
  const [connectors, setConnectors] = useState<Connector[]>([]);

  const requires = useMemo(() => entry?.requires ?? [], [entry]);
  const unlocks = useMemo(() => entry?.unlocks ?? [], [entry]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !entry) return;

    const measure = () => {
      const centerEl = centerRef.current;
      if (!centerEl) return;
      const base = container.getBoundingClientRect();
      const center = centerEl.getBoundingClientRect();
      const next: Connector[] = [];

      const push = (
        link: FlowLink,
        side: "left" | "right",
        el: HTMLButtonElement,
      ) => {
        const rect = el.getBoundingClientRect();
        const fromX =
          side === "left" ? rect.right - base.left : center.right - base.left;
        const toX =
          side === "left" ? center.left - base.left : rect.left - base.left;
        const fromY =
          (side === "left" ? rect : center).top -
          base.top +
          (side === "left" ? rect : center).height / 2;
        const toY =
          (side === "left" ? center : rect).top -
          base.top +
          (side === "left" ? center : rect).height / 2;
        const bend = Math.min(48, Math.abs(toX - fromX) / 2);
        // Pending prerequisites draw "hot" (amber); satisfied ones green;
        // downstream unlocks stay neutral ink until this task is done.
        const stroke =
          side === "left"
            ? link.module.status === "done"
              ? "var(--color-done)"
              : "var(--color-progress)"
            : entry.module.status === "done"
              ? "var(--color-done)"
              : "var(--color-line-strong)";
        next.push({
          key: `${side}:${link.module.id}:${link.kind}`,
          d: `M ${fromX} ${fromY} C ${fromX + bend} ${fromY}, ${toX - bend} ${toY}, ${toX} ${toY}`,
          stroke,
          dashed: link.kind !== "direct",
        });
      };

      for (const link of requires) {
        const el = nodeEls.current.get(`req:${link.module.id}:${link.kind}`);
        if (el) push(link, "left", el);
      }
      for (const link of unlocks) {
        const el = nodeEls.current.get(`unl:${link.module.id}:${link.kind}`);
        if (el) push(link, "right", el);
      }
      setConnectors(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
    // Re-measure when the graph around the centre changes shape.
  }, [entry, centerId, requires, unlocks]);

  if (!entry) return null;

  const meta = MODULE_TYPE_META[entry.module.type];
  const assignees = members.filter((m) =>
    entry.module.assigneeIds.includes(m.id),
  );

  const nodeRef =
    (key: string) => (el: HTMLButtonElement | null): void => {
      if (el) nodeEls.current.set(key, el);
      else nodeEls.current.delete(key);
    };

  return (
    <div ref={containerRef} className="relative overflow-x-auto">
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {connectors.map((c) => (
          <path
            key={c.key}
            d={c.d}
            fill="none"
            stroke={c.stroke}
            strokeWidth={1.5}
            strokeDasharray={c.dashed ? "4 4" : undefined}
          />
        ))}
      </svg>

      <div className="grid min-w-fit grid-cols-[minmax(11rem,1fr)_auto_minmax(11rem,1fr)] items-center gap-x-12 gap-y-3 px-1 py-2">
        {/* Left: prerequisites */}
        <div className="flex flex-col items-end gap-2.5">
          <span className="type-overline">Necesita antes</span>
          {requires.length === 0 ? (
            <p className="w-44 rounded-lg border border-dashed border-line px-3 py-3 text-center text-xs text-muted-2">
              Nada — disponible desde el inicio
            </p>
          ) : (
            requires.map((link) => (
              <SideNode
                key={`${link.module.id}:${link.kind}`}
                link={link}
                side="left"
                entry={flow.byId.get(link.module.id)}
                members={members}
                onSelect={() => onSelect(link.module.id)}
                nodeRef={nodeRef(`req:${link.module.id}:${link.kind}`)}
              />
            ))
          )}
        </div>

        {/* Centre: the selected module */}
        <div className="flex flex-col items-center">
          <span className="type-overline mb-2.5 invisible">·</span>
          <div
            ref={centerRef}
            className="flex w-56 flex-col gap-2 rounded-xl border border-line-strong bg-surface p-3.5 shadow-raised"
          >
            <div className="flex items-center justify-between gap-2">
              <Badge label={meta.label} color={meta.color} soft={meta.soft} />
              {stateIcon(entry)}
            </div>
            <p
              className={cn(
                "text-sm font-medium leading-snug text-ink",
                entry.module.status === "done" && "text-muted line-through",
              )}
            >
              {entry.module.title || "Sin título"}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted">
                {deadlineLabel(entry.module.dueDate)}
              </span>
              <AvatarStack members={assignees} size="xs" max={3} />
            </div>
            <button
              type="button"
              onClick={() => onOpen(entry.module.id)}
              className="mt-0.5 inline-flex items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-ink hover:text-canvas"
            >
              <PenLine className="h-3 w-3" />
              Abrir y editar
            </button>
          </div>
        </div>

        {/* Right: dependents */}
        <div className="flex flex-col items-start gap-2.5">
          <span className="type-overline">Desbloquea</span>
          {unlocks.length === 0 ? (
            <p className="w-44 rounded-lg border border-dashed border-line px-3 py-3 text-center text-xs text-muted-2">
              Ninguna tarea espera esta
            </p>
          ) : (
            unlocks.map((link) => (
              <SideNode
                key={`${link.module.id}:${link.kind}`}
                link={link}
                side="right"
                entry={flow.byId.get(link.module.id)}
                members={members}
                onSelect={() => onSelect(link.module.id)}
                nodeRef={nodeRef(`unl:${link.module.id}:${link.kind}`)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
