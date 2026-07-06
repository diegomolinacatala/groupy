"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  LayoutTemplate,
  Link2,
  LogOut,
  Plus,
  Trash2,
} from "lucide-react";
import type { SpawnedGroup, TeacherTemplate } from "@/lib/data/cloud/schemas";
import {
  createTeacherTemplate,
  deleteTeacherTemplate,
} from "@/lib/data/cloud/template-actions";
import { signOutTeacher } from "@/lib/auth/teacher-actions";
import { IconButton } from "@/components/ui/IconButton";
import { colorForKey, initialsFromName } from "@/lib/utils/colors";
import { formatShort } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

// The teacher's home: their templates, each with its CLASS code and the
// groups spawned from it. Deliberately roster-only — who is in each group and
// who has claimed their seat. Progress, tasks and checklists stay invisible
// until the final report (the hard rule).

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

export function TeacherHome({
  templates,
  email,
}: {
  templates: TeacherTemplate[];
  email: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    const result = await createTeacherTemplate();
    if (!result.ok) {
      setError(result.error);
      setCreating(false);
      return;
    }
    router.push(`/profesor/plantilla/${result.templateId}`);
  };

  const handleSignOut = async () => {
    await signOutTeacher();
    router.refresh();
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex items-center justify-between border-b border-line px-6 py-4 md:px-10">
        <Link href="/" className="type-display text-xl text-ink">
          Groupy
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">{email}</span>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="h-4 w-4" />
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 pb-24 pt-10 md:pt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="type-overline mb-2">Profesor</p>
            <h1 className="type-display text-4xl leading-[1.05] text-ink">
              Tus plantillas
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-medium text-canvas transition-colors hover:bg-ink-hover disabled:pointer-events-none disabled:opacity-40"
          >
            {creating ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-canvas/40 border-t-canvas" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Nueva plantilla
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {templates.length === 0 ? (
          <EmptyState onCreate={() => void handleCreate()} creating={creating} />
        ) : (
          <ul className="mt-8 flex flex-col gap-4">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onDeleted={() => router.refresh()}
              />
            ))}
          </ul>
        )}

        <p className="mt-10 text-xs leading-relaxed text-muted-2">
          Verás qué grupos se han creado y quién ha entrado en cada uno — nunca
          su trabajo en curso. El informe llega cuando el proyecto se cierra.
        </p>
      </main>
    </div>
  );
}

function EmptyState({
  onCreate,
  creating,
}: {
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <div className="mt-8 flex flex-col items-start gap-4 rounded-2xl border border-dashed border-line-strong bg-surface p-8">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft">
        <LayoutTemplate className="h-6 w-6 text-accent" />
      </span>
      <div>
        <h2 className="type-display text-2xl text-ink">
          Crea tu primera plantilla
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
          Define las tareas y las fechas del trabajo una sola vez. Con el
          código de clase, cada grupo entra, pone sus nombres y se reparte las
          tareas — sin cuentas ni correos.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        disabled={creating}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-medium text-canvas transition-colors hover:bg-ink-hover disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
        Nueva plantilla
      </button>
    </div>
  );
}

function TemplateCard({
  template,
  onDeleted,
}: {
  template: TeacherTemplate;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting) return;
    const groups = template.groups.length;
    const warning =
      groups > 0
        ? `¿Eliminar «${template.title}»? Los ${groups} grupos ya creados seguirán trabajando, pero el código de clase dejará de funcionar.`
        : `¿Eliminar «${template.title}»?`;
    if (!window.confirm(warning)) return;
    setDeleting(true);
    const result = await deleteTeacherTemplate({ templateId: template.id });
    if (!result.ok) {
      window.alert(result.error);
      setDeleting(false);
      return;
    }
    onDeleted();
  };

  return (
    <li
      className={cn(
        "rounded-2xl border border-line bg-surface p-5 shadow-card transition-opacity",
        deleting && "opacity-50",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <Link
            href={`/profesor/plantilla/${template.id}`}
            className="type-display block truncate text-xl text-ink hover:underline"
          >
            {template.title || "Sin título"}
          </Link>
          <p className="mt-1 text-xs text-muted">
            {template.task_count}{" "}
            {template.task_count === 1 ? "tarea" : "tareas"}
            {" · "}
            Entrega {formatShort(template.due_date)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <CopyLinkChip code={template.join_code} label="Código de clase" />
          <Link
            href={`/profesor/plantilla/${template.id}`}
            className="inline-flex h-9 items-center rounded-xl border border-line bg-surface px-3.5 text-xs font-medium text-ink transition-colors hover:bg-surface-2"
          >
            Editar
          </Link>
          <IconButton
            label="Eliminar plantilla"
            tone="danger"
            onClick={() => void handleDelete()}
          >
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        {template.groups.length === 0 ? (
          <p className="text-xs text-muted-2">
            Ningún grupo todavía — comparte el código de clase y aparecerán
            aquí.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {template.groups.map((group) => (
              <GroupRow key={group.join_code} group={group} />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

/** One spawned group: roster avatars + names + claimed count + its link. */
function GroupRow({ group }: { group: SpawnedGroup }) {
  const claimed = group.members.filter((m) => m.claimed).length;
  const names = group.members.map((m) => firstName(m.display_name)).join(", ");

  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-2/60">
      <span className="flex -space-x-1.5">
        {group.members.slice(0, 5).map((member, index) => {
          const color = colorForKey(member.color_key);
          return (
            <span
              key={index}
              title={member.display_name}
              className={cn(
                "grid h-6 w-6 place-items-center rounded-full text-[9px] font-semibold ring-2 ring-surface",
                !member.claimed && "opacity-40",
              )}
              style={{ backgroundColor: color.bg, color: color.ink }}
            >
              {initialsFromName(member.display_name)}
            </span>
          );
        })}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-ink-2">
        {names || "Grupo sin nombres"}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-muted">
        {claimed}/{group.members.length} dentro
      </span>
      <CopyLinkChip code={group.join_code} label="Enlace del grupo" compact />
    </li>
  );
}

/** Copies the join link for a code; shows the code as the label. */
function CopyLinkChip({
  code,
  label,
  compact = false,
}: {
  code: string;
  label: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/p/${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable: the visible code is still there to copy.
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      title={`${label} — copiar enlace`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface text-xs text-muted transition-colors hover:bg-surface-2 hover:text-ink",
        compact ? "h-7 px-2" : "h-9 px-3",
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-accent" />
      ) : (
        <Link2 className="h-3.5 w-3.5" />
      )}
      <span className="font-mono tracking-[0.12em]">
        {copied ? "Copiado" : code}
      </span>
    </button>
  );
}
