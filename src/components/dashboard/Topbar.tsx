"use client";

import { useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  CircleUserRound,
  Link2,
  Plus,
  Users,
} from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { useLiveRoom } from "@/lib/data/cloud/live";
import { useDashboardUi } from "@/lib/ui/dashboard-ui";
import { InlineText } from "@/components/ui/InlineText";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Popover } from "@/components/ui/Popover";
import { Badge } from "@/components/ui/Badge";
import { NAV_ITEMS } from "./nav";
import { cn } from "@/lib/utils/cn";
import { formatShort } from "@/lib/utils/dates";
import {
  PROJECT_STATUS_META,
  type ProjectStatus,
} from "@/lib/data/types";

const STATUS_COLOR: Record<ProjectStatus, { color: string; soft: string }> = {
  active: { color: "var(--color-done)", soft: "var(--color-done-soft)" },
  in_review: {
    color: "var(--color-progress)",
    soft: "var(--color-progress-soft)",
  },
  closed: { color: "var(--color-todo)", soft: "var(--color-todo-soft)" },
};

const STATUS_ORDER: ProjectStatus[] = ["active", "in_review", "closed"];

const firstName = (name: string): string =>
  name.trim().split(/\s+/)[0] || name;

export function Topbar() {
  const { project, updateProject, addModule, joinCode } = useProject();
  const { view, setView, openModule } = useDashboardUi();

  const statusStyle = STATUS_COLOR[project.status];

  const handleAdd = () => {
    const id = addModule();
    openModule(id);
  };

  return (
    <header className="shrink-0 border-b border-line bg-surface/80 backdrop-blur">
      {/* Mobile view switcher (sidebar is hidden below md) */}
      <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 md:hidden">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.view}
            type="button"
            onClick={() => setView(item.view)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
              view === item.view
                ? "bg-accent-soft text-accent"
                : "text-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-6">
        <div className="min-w-0 flex-1">
          <InlineText
            value={project.title}
            onCommit={(title) => updateProject({ title })}
            placeholder="Título del proyecto"
            ariaLabel="Título del proyecto"
            className="type-display -ml-1.5 text-xl md:text-2xl"
          />
          <div className="ml-0.5 mt-0.5 flex items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              Plazo {formatShort(project.dueDate)}
            </span>

            <Popover
              align="start"
              portal
              trigger={({ toggle }) => (
                <button type="button" onClick={toggle}>
                  <Badge
                    label={PROJECT_STATUS_META[project.status].label}
                    color={statusStyle.color}
                    soft={statusStyle.soft}
                  />
                </button>
              )}
              className="w-44"
            >
              {(close) => (
                <div>
                  {STATUS_ORDER.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        updateProject({ status });
                        close();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: STATUS_COLOR[status].color }}
                      />
                      {PROJECT_STATUS_META[status].label}
                    </button>
                  ))}
                </div>
              )}
            </Popover>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {joinCode && <ShareCodeChip code={joinCode} />}
          <IdentityChip />
          <Button variant="primary" onClick={handleAdd}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Tarea</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

/**
 * Who am I, always in sight. Shows your avatar + name; the popover lists the
 * team with you marked. In local (demo) mode clicking a teammate switches the
 * device to that identity; in cloud mode the identity is the claimed member
 * and stays fixed to this device.
 */
function IdentityChip() {
  const { project, mode, currentMemberId, setCurrentMember } = useProject();
  const { setView } = useDashboardUi();
  // Presence (cloud only): who has this project open right now.
  const room = useLiveRoom();
  const online = room?.onlineMemberIds ?? null;
  const othersOnline = online
    ? [...online].filter((id) => id !== currentMemberId).length
    : 0;

  const me = project.members.find((m) => m.id === currentMemberId) ?? null;
  const canSwitch = mode === "local";

  return (
    <Popover
      align="end"
      portal
      className="w-64"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          title={me ? `Estás dentro como ${me.name}` : "Elige quién eres"}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-xl border px-2.5 text-xs font-medium transition-colors",
            me
              ? "border-line bg-surface text-ink-2 hover:bg-surface-2"
              : "border-accent/60 bg-accent-soft text-accent hover:border-accent",
          )}
        >
          {me ? (
            <>
              <span className="relative inline-flex">
                <Avatar member={me} size="xs" />
                {othersOnline > 0 && (
                  <span
                    aria-hidden
                    title={`${othersOnline} más en línea`}
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-surface"
                    style={{ backgroundColor: "var(--color-done)" }}
                  />
                )}
              </span>
              <span className="hidden max-w-28 truncate sm:inline">
                {firstName(me.name)}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </>
          ) : (
            <>
              <CircleUserRound className="h-4 w-4" />
              ¿Quién eres?
            </>
          )}
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col">
          <p className="px-2 pb-2 pt-1 text-xs leading-relaxed text-muted">
            {me
              ? mode === "cloud"
                ? `En este dispositivo eres ${firstName(me.name)}.${
                    online && online.size > 0
                      ? ` · ${online.size} en línea`
                      : ""
                  }`
                : "Estás usando la demo como…"
              : "Elige quién eres para ver tu vista Principal."}
          </p>

          <div className="flex flex-col gap-0.5">
            {project.members.map((member) => {
              const isMe = member.id === currentMemberId;
              const clickable = canSwitch || isMe;
              const isOnline = online?.has(member.id) ?? false;
              return (
                <button
                  key={member.id}
                  type="button"
                  disabled={!clickable}
                  onClick={() => {
                    if (canSwitch && !isMe) setCurrentMember(member.id);
                    close();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                    isMe && "bg-surface-2",
                    clickable ? "hover:bg-surface-2" : "opacity-70",
                  )}
                >
                  <Avatar member={member} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {member.name}
                  </span>
                  {isOnline && !isMe && (
                    <span
                      title="En línea ahora"
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: "var(--color-done)" }}
                    />
                  )}
                  {isMe && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                      <Check className="h-3.5 w-3.5" />
                      Tú
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 border-t border-line pt-1.5">
            <button
              type="button"
              onClick={() => {
                setView("team");
                close();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2"
            >
              <Users className="h-4 w-4 text-muted" />
              Ver el equipo
            </button>
            <p className="px-2 pb-1 pt-1.5 text-[11px] leading-relaxed text-muted-2">
              {mode === "cloud"
                ? "Tu identidad queda vinculada a este dispositivo."
                : "En la demo puedes cambiar de persona con un clic."}
            </p>
          </div>
        </div>
      )}
    </Popover>
  );
}

/** Cloud-mode only: the project's share code; clicking copies the join link. */
function ShareCodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/p/${code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable: the code itself is visible to copy by hand.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copiar enlace para el grupo"
      className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-accent" />
      ) : (
        <Link2 className="h-3.5 w-3.5" />
      )}
      <span className="font-mono tracking-[0.15em]">
        {copied ? "Copiado" : code}
      </span>
    </button>
  );
}
