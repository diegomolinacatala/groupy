"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { buildProjectPlan, type SetupAnswers } from "@/lib/data/plan";
import { saveProject } from "@/lib/data/store";
import { cn } from "@/lib/utils/cn";

// Short staged pass between the last question and the dashboard: the plan
// is built and persisted immediately; the pacing is purely presentational
// so the hand-off reads as deliberate work, not a flash of redirect.

const STEP_INTERVAL_MS = 850;
const EXIT_DELAY_MS = 700;

export function GeneratingScreen({ answers }: { answers: SetupAnswers }) {
  const router = useRouter();
  const [completed, setCompleted] = useState(0);

  const lines = [
    "Leyendo vuestras respuestas",
    "Estructurando las fases del proyecto",
    `Repartiendo tareas entre ${answers.memberNames.length} personas`,
    "Colocando fechas en el calendario",
  ];
  const total = lines.length;

  // Saving twice under StrictMode's double-mount is harmless (last write
  // wins); the cleanup clears the first run's timers so pacing stays correct.
  useEffect(() => {
    saveProject(buildProjectPlan(answers));

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= total; i++) {
      timers.push(setTimeout(() => setCompleted(i), i * STEP_INTERVAL_MS));
    }
    timers.push(
      setTimeout(
        () => router.push("/dashboard"),
        total * STEP_INTERVAL_MS + EXIT_DELAY_MS,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [answers, router, total]);

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
              const isDone = index < completed;
              const isCurrent = index === completed;
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
        </div>
      </main>
    </div>
  );
}
