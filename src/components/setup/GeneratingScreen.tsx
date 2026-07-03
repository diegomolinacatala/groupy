"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { buildProjectPlan, type SetupAnswers } from "@/lib/data/plan";
import type { Project } from "@/lib/data/types";
import { saveProject } from "@/lib/data/store";
import { createCloudProject } from "@/lib/data/cloud/actions";
import { projectToCreateInput } from "@/lib/data/cloud/mapping";
import { saveLastCloudProject } from "@/lib/data/cloud/recent";
import { cn } from "@/lib/utils/cn";

// Staged pass between the last question and the dashboard. The plan is built
// immediately and saved to Supabase (share code + cloud project); the pacing
// is presentational, but the final step is real — it completes when the save
// lands, and navigation waits for both.

const STEP_INTERVAL_MS = 850;
const EXIT_DELAY_MS = 700;

export function GeneratingScreen({ answers }: { answers: SetupAnswers }) {
  const router = useRouter();
  const [completed, setCompleted] = useState(0);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const projectRef = useRef<Project | null>(null);

  const lines = [
    "Leyendo vuestras respuestas",
    "Estructurando las fases del proyecto",
    `Repartiendo tareas entre ${answers.memberNames.length} personas`,
    "Colocando fechas en el calendario",
    "Guardando en la nube",
  ];
  const total = lines.length;
  // The first steps run on timers; the last one completes when the save does.
  const animatedTotal = total - 1;

  const runCreate = async () => {
    setCloudError(null);
    const project = projectRef.current ?? buildProjectPlan(answers);
    projectRef.current = project;
    const result = await createCloudProject(projectToCreateInput(project));
    if (result.ok) {
      saveLastCloudProject({ code: result.joinCode, title: project.title });
      setJoinCode(result.joinCode);
    } else {
      setCloudError(result.error);
    }
  };

  // Unlike the old localStorage write, the cloud insert is not idempotent —
  // the ref guards StrictMode's double-mount (refs survive it).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void runCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= animatedTotal; i++) {
      timers.push(setTimeout(() => setCompleted(i), i * STEP_INTERVAL_MS));
    }
    return () => timers.forEach(clearTimeout);
  }, [animatedTotal]);

  useEffect(() => {
    if (!joinCode || completed < animatedTotal) return;
    const timer = setTimeout(
      () => router.push(`/p/${joinCode}`),
      EXIT_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [joinCode, completed, animatedTotal, router]);

  const handleLocalFallback = () => {
    const project = projectRef.current;
    if (project) saveProject(project);
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="h-0.5 w-full bg-surface-3">
        <div className="h-full w-full bg-accent" />
      </div>

      <header className="flex items-center justify-center px-5 py-4">
        <span className="type-display text-lg text-ink">Groupy</span>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pt-[16vh]">
        <div className="animate-rise w-full max-w-md">
          <h1 className="type-display mb-10 text-4xl leading-[1.08] text-ink">
            Montando vuestro plan
          </h1>

          <ul className="flex flex-col gap-5">
            {lines.map((line, index) => {
              const isCloudStep = index === animatedTotal;
              const isDone = isCloudStep
                ? joinCode !== null
                : index < completed;
              const isCurrent = isCloudStep
                ? completed >= animatedTotal && !isDone && !cloudError
                : index === completed;
              return (
                <li
                  key={line}
                  className={cn(
                    "flex items-center gap-3 text-[15px] transition-colors duration-300",
                    isDone
                      ? "text-ink"
                      : isCurrent
                        ? "text-ink-2"
                        : "text-muted-2",
                  )}
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center">
                    {isDone ? (
                      <Check className="h-4 w-4 text-accent" />
                    ) : isCurrent ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent" />
                    ) : (
                      <span className="h-1 w-1 rounded-full bg-muted-2" />
                    )}
                  </span>
                  {line}
                </li>
              );
            })}
          </ul>

          {cloudError && (
            <div className="mt-10 rounded-xl border border-line bg-surface p-4">
              <p className="text-sm font-medium text-ink">
                No se pudo guardar en la nube
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {cloudError}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runCreate()}
                  className="inline-flex h-10 items-center rounded-lg bg-ink px-4 text-sm font-medium text-canvas transition-colors hover:bg-ink-hover"
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={handleLocalFallback}
                  className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm text-ink transition-colors hover:bg-surface-2"
                >
                  Seguir solo en este navegador
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
