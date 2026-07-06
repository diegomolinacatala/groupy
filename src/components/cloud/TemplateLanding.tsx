"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarClock, ListChecks, Plus } from "lucide-react";
import {
  claimCloudMember,
  createGroupFromTemplate,
} from "@/lib/data/cloud/actions";
import { saveLastCloudProject } from "@/lib/data/cloud/recent";
import type { SpawnedGroup, TemplatePreview } from "@/lib/data/cloud/schemas";
import { QuickList } from "@/components/setup/steps";
import {
  colorForKey,
  initialsFromName,
  MEMBER_COLORS,
  nextMemberColorKey,
} from "@/lib/utils/colors";
import { formatShort } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

// What a CLASS code opens: the assignment the teacher prepared, the groups
// that already exist (tap yours → who-are-you) and "crear grupo" — a two-beat
// mini-wizard (¿quiénes sois? → ¿quién eres?) that copies the template's
// tasks into a fresh group and drops you straight into repartir.

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The saving screen stays up at least this long — a beat of "making it". */
const MIN_SAVING_MS = 2000;

type Phase =
  | { step: "browse" }
  | { step: "names" }
  | { step: "who" }
  | { step: "saving" };

/**
 * The whole spawn beat, outside the component (module scope keeps the React
 * Compiler's purity rule happy about Date.now): create → claim → hold the
 * saving screen for its minimum time.
 */
async function spawnGroup(
  template: TemplatePreview["template"],
  names: string[],
  selfIndex: number,
): Promise<{ ok: true; joinCode: string } | { ok: false; error: string }> {
  const startedAt = Date.now();

  // Same palette logic as the wizard: cycle colours in member order.
  const colorKeys: string[] = [];
  for (let i = 0; i < names.length; i++) {
    colorKeys.push(nextMemberColorKey(colorKeys));
  }
  const created = await createGroupFromTemplate({
    code: template.join_code,
    members: names.map((name, i) => ({ name, colorKey: colorKeys[i] })),
  });
  if (!created.ok) return created;

  saveLastCloudProject({ code: created.joinCode, title: template.title });
  // Claim is best-effort: if it fails, the who-are-you screen picks the
  // identity up on landing instead.
  const mine = created.members[selfIndex];
  if (mine) {
    await claimCloudMember({ memberId: mine.id });
  }
  await sleep(Math.max(0, MIN_SAVING_MS - (Date.now() - startedAt)));
  return { ok: true, joinCode: created.joinCode };
}

export function TemplateLanding({ preview }: { preview: TemplatePreview }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ step: "browse" });
  const [names, setNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { template } = preview;

  const createGroup = async (selfIndex: number) => {
    setPhase({ step: "saving" });
    setError(null);
    const result = await spawnGroup(template, names, selfIndex);
    if (!result.ok) {
      setError(result.error);
      setPhase({ step: "who" });
      return;
    }
    // Keep the loading screen up while the dashboard route loads.
    router.push(`/p/${result.joinCode}`);
  };

  if (phase.step === "saving") return <SavingScreen />;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex items-center justify-between px-5 py-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Inicio
        </Link>
        <span className="type-display text-lg text-ink">Groupy</span>
        <span className="w-16" aria-hidden />
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-[8vh]">
        <div className="animate-rise w-full max-w-md">
          <p className="type-overline mb-3">Trabajo de clase</p>
          <h1 className="type-display text-3xl leading-[1.1] text-ink">
            {template.title || "Trabajo en grupo"}
          </h1>
          {template.description && (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
              {template.description}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Entrega {formatShort(template.due_date)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5" />
              {template.task_count}{" "}
              {template.task_count === 1 ? "tarea" : "tareas"} preparadas
            </span>
          </div>

          {preview.is_owner && (
            <Link
              href={`/profesor/plantilla/${template.id}`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-accent/50 bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:border-accent"
            >
              Es tu plantilla — editarla
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}

          {phase.step === "browse" && (
            <BrowseGroups
              preview={preview}
              onCreate={() => {
                setError(null);
                setPhase({ step: "names" });
              }}
            />
          )}

          {phase.step === "names" && (
            <section className="mt-10">
              <h2 className="type-overline mb-1">Vuestro grupo</h2>
              <p className="mb-4 text-sm text-muted">
                ¿Quiénes sois? Al menos dos personas.
              </p>
              <QuickList
                items={names}
                placeholder={names.length === 0 ? "Tu nombre" : "Siguiente persona"}
                inputLabel="Nombre del miembro"
                removeLabel={(name) => `Quitar a ${name}`}
                onAdd={(name) =>
                  setNames((prev) =>
                    prev.some((n) => n.toLowerCase() === name.toLowerCase())
                      ? prev
                      : [...prev, name],
                  )
                }
                onRemoveAt={(index) =>
                  setNames((prev) => prev.filter((_, i) => i !== index))
                }
                onNext={() => {
                  if (names.length >= 2) setPhase({ step: "who" });
                }}
              />
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  disabled={names.length < 2}
                  onClick={() => setPhase({ step: "who" })}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-6 text-sm font-medium text-canvas transition-colors hover:bg-ink-hover disabled:pointer-events-none disabled:opacity-30"
                >
                  Continuar
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPhase({ step: "browse" })}
                  className="text-sm text-muted hover:text-ink"
                >
                  Atrás
                </button>
              </div>
            </section>
          )}

          {phase.step === "who" && (
            <section className="mt-10">
              <h2 className="type-overline mb-1">Tú</h2>
              <p className="mb-3 text-sm text-muted">
                ¿Quién eres? Toca tu nombre para crear el grupo.
              </p>
              <ul className="flex flex-col gap-2">
                {names.map((name, index) => {
                  const color = MEMBER_COLORS[index % MEMBER_COLORS.length];
                  return (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => void createGroup(index)}
                        className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left shadow-card transition-colors hover:border-line-strong hover:bg-surface-2"
                      >
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
                          style={{ backgroundColor: color.bg, color: color.ink }}
                        >
                          {initialsFromName(name)}
                        </span>
                        <span className="flex-1 text-[15px] font-medium text-ink">
                          {name}
                        </span>
                        <span className="text-xs font-medium text-accent">
                          Soy yo
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {error && (
                <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={() => setPhase({ step: "names" })}
                className="mt-4 text-sm text-muted hover:text-ink"
              >
                Atrás
              </button>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function BrowseGroups({
  preview,
  onCreate,
}: {
  preview: TemplatePreview;
  onCreate: () => void;
}) {
  return (
    <>
      <section className="mt-10">
        <h2 className="type-overline mb-1">Grupos</h2>
        {preview.groups.length === 0 ? (
          <p className="mb-3 text-sm text-muted">
            Nadie ha creado un grupo todavía. Sed los primeros.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              ¿Tu grupo ya existe? Entra y elige tu nombre.
            </p>
            <ul className="flex flex-col gap-2">
              {preview.groups.map((group) => (
                <GroupCard
                  key={group.join_code}
                  group={group}
                  isMine={group.join_code === preview.my_group_code}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface text-[15px] font-medium text-ink transition-colors hover:border-accent hover:bg-surface-2 hover:text-accent"
      >
        <Plus className="h-4 w-4" />
        Crear vuestro grupo
      </button>
    </>
  );
}

/** One existing group: roster avatars + names; tap → its who-are-you page. */
function GroupCard({ group, isMine }: { group: SpawnedGroup; isMine: boolean }) {
  const claimed = group.members.filter((m) => m.claimed).length;
  const names = group.members.map((m) => firstName(m.display_name)).join(", ");

  return (
    <li>
      <Link
        href={`/p/${group.join_code}`}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border bg-surface px-4 py-3 transition-colors hover:bg-surface-2",
          isMine
            ? "border-accent/60 shadow-card"
            : "border-line hover:border-line-strong",
        )}
      >
        <span className="flex shrink-0 -space-x-1.5">
          {group.members.slice(0, 4).map((member, index) => {
            const color = colorForKey(member.color_key);
            return (
              <span
                key={index}
                title={member.display_name}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full text-[10px] font-semibold ring-2 ring-surface",
                  !member.claimed && "opacity-40",
                )}
                style={{ backgroundColor: color.bg, color: color.ink }}
              >
                {initialsFromName(member.display_name)}
              </span>
            );
          })}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">
            {names || "Grupo"}
          </span>
          <span className="block text-xs text-muted">
            {claimed}/{group.members.length} dentro
          </span>
        </span>
        {isMine ? (
          <span className="shrink-0 text-xs font-medium text-accent">
            Tu grupo
          </span>
        ) : (
          <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
        )}
      </Link>
    </li>
  );
}

/** Same saving beat as the wizard: wordmark, spinner, rotating copy. */
function SavingScreen() {
  const [index, setIndex] = useState(0);
  const messages = [
    "Creando vuestro grupo…",
    "Copiando las tareas del profesor…",
    "Montando el tablero…",
    "Abriendo…",
  ];

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((i) => Math.min(i + 1, messages.length - 1)),
      900,
    );
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-6">
      <span className="type-display text-2xl text-ink">Groupy</span>
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-accent" />
      <p key={index} className="animate-fade text-sm text-muted" aria-live="polite">
        {messages[index]}
      </p>
    </div>
  );
}
