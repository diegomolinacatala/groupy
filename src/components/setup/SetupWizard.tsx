"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CornerDownLeft } from "lucide-react";
import {
  buildProjectPlan,
  chosenMemberId,
  type SetupAnswers,
} from "@/lib/data/plan";
import { saveLocalIdentity, saveProject } from "@/lib/data/store";
import { claimCloudMember, createCloudProject } from "@/lib/data/cloud/actions";
import { projectToCreateInput } from "@/lib/data/cloud/mapping";
import { saveLastCloudProject } from "@/lib/data/cloud/recent";
import { addMonthsISO, todayISO } from "@/lib/utils/dates";
import { StepDates, StepTasks, StepTeam, StepWho } from "./steps";

// One question per screen, Talli-style: thin progress bar, big serif
// question, a single input, Enter to continue. Straight to the point: no
// title question (the project starts as "Trabajo en grupo", renamed in place
// later) and no strengths step. After the last answer a full loading screen
// covers the cloud save — never shorter than a couple of seconds, and as
// long as the save actually needs.

const TOTAL_STEPS = 4;

type StepIndex = 0 | 1 | 2 | 3;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The saving screen stays up at least this long — a beat of "making it". */
const MIN_SAVING_MS = 2000;

function isStepValid(step: StepIndex, answers: SetupAnswers): boolean {
  switch (step) {
    case 0:
      return answers.memberNames.length >= 2;
    case 1:
      return (
        answers.startDate.length > 0 &&
        answers.dueDate.length > 0 &&
        answers.dueDate > answers.startDate
      );
    case 2:
      return answers.selfIndex !== null;
    case 3:
      return answers.taskNames.length >= 1;
  }
}

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<StepIndex>(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<SetupAnswers>(() => {
    const startDate = todayISO();
    return {
      memberNames: [],
      startDate,
      dueDate: addMonthsISO(startDate, 1),
      selfIndex: null,
      taskNames: [],
    };
  });

  // Accepts an updater so list operations (add member, add task) always read
  // the freshest state, even on rapid consecutive events.
  const patch = (
    partial:
      | Partial<SetupAnswers>
      | ((prev: SetupAnswers) => Partial<SetupAnswers>),
  ) =>
    setAnswers((prev) => ({
      ...prev,
      ...(typeof partial === "function" ? partial(prev) : partial),
    }));

  const valid = isStepValid(step, answers);

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    const startedAt = Date.now();
    const project = buildProjectPlan(answers);
    const memberId = chosenMemberId(answers, project);

    const created = await createCloudProject(projectToCreateInput(project));
    if (!created.ok) {
      setSaveError(created.error);
      setSaving(false);
      return;
    }
    saveLastCloudProject({ code: created.joinCode, title: project.title });
    // Claim is best-effort: if it fails, the who-are-you screen picks the
    // identity up on landing instead.
    if (memberId) {
      await claimCloudMember({ memberId });
    }
    await sleep(Math.max(0, MIN_SAVING_MS - (Date.now() - startedAt)));
    // Keep the loading screen up while the dashboard route loads.
    router.push(`/p/${created.joinCode}`);
  };

  // Cloud unavailable: keep the built project on this device only.
  const continueLocally = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    const project = buildProjectPlan(answers);
    saveProject(project);
    saveLocalIdentity(chosenMemberId(answers, project));
    await sleep(MIN_SAVING_MS);
    router.push("/dashboard");
  };

  const goNext = () => {
    if (!valid || saving) return;
    if (step === TOTAL_STEPS - 1) {
      void finish();
    } else {
      setStep((s) => (s + 1) as StepIndex);
    }
  };

  const goBack = () => {
    if (step > 0 && !saving) setStep((s) => (s - 1) as StepIndex);
  };

  // "¿Quién eres?": one click selects AND advances (no confirm button).
  const pickSelf = (index: number) => {
    if (saving) return;
    patch({ selfIndex: index });
    setStep(3);
  };

  if (saving) return <SavingScreen />;

  const percent = Math.round((step / TOTAL_STEPS) * 100);
  const isLast = step === TOTAL_STEPS - 1;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {/* Progress track */}
      <div className="h-0.5 w-full bg-surface-3">
        <div
          className="h-full bg-accent transition-[width] duration-500"
          style={{ width: `${Math.max(percent, 4)}%` }}
        />
      </div>

      {/* Chrome */}
      <header className="flex items-center justify-between px-5 py-4 md:px-8">
        {step > 0 ? (
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Atrás
          </button>
        ) : (
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Inicio
          </Link>
        )}
        <span className="type-display text-lg text-ink">Groupy</span>
        <span className="w-20 text-right text-sm tabular-nums text-muted">
          {step + 1} / {TOTAL_STEPS}
        </span>
      </header>

      {/* Question area — keyed so each step animates in */}
      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-[8vh] md:pt-[12vh]">
        <div key={step} className="animate-rise w-full max-w-xl">
          {step === 0 && (
            <StepTeam answers={answers} patch={patch} onNext={goNext} />
          )}
          {step === 1 && (
            <StepDates answers={answers} patch={patch} onNext={goNext} />
          )}
          {step === 2 && <StepWho answers={answers} onPick={pickSelf} />}
          {step === 3 && (
            <StepTasks answers={answers} patch={patch} onNext={goNext} />
          )}

          <div className="mt-10">
            {/* On the who-step the click itself continues. */}
            {step !== 2 && (
              <button
                type="button"
                onClick={goNext}
                disabled={!valid}
                className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-ink px-7 text-[15px] font-medium text-canvas transition-colors hover:bg-ink-hover disabled:pointer-events-none disabled:opacity-30"
              >
                {isLast ? "Crear proyecto" : "Continuar"}
                <CornerDownLeft className="h-4 w-4 opacity-60" />
              </button>
            )}

            {saveError && (
              <div className="mt-6 rounded-xl border border-line bg-surface p-4">
                <p className="text-sm font-medium text-ink">
                  No se pudo guardar en la nube
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {saveError}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void finish()}
                    className="inline-flex h-10 items-center rounded-lg bg-ink px-4 text-sm font-medium text-canvas transition-colors hover:bg-ink-hover"
                  >
                    Reintentar
                  </button>
                  <button
                    type="button"
                    onClick={() => void continueLocally()}
                    className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm text-ink transition-colors hover:bg-surface-2"
                  >
                    Seguir en este navegador
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// --- Saving screen -----------------------------------------------------------

const SAVING_MESSAGES = [
  "Creando el proyecto…",
  "Montando el tablero…",
  "Preparando el reparto…",
  "Abriendo…",
];

/** Full-screen loading state after the last answer: wordmark, spinner and a
 *  slowly advancing line of copy. Stays up until the dashboard route loads. */
function SavingScreen() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((i) => Math.min(i + 1, SAVING_MESSAGES.length - 1)),
      900,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-6">
      <span className="type-display text-2xl text-ink">Groupy</span>
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-accent" />
      <p key={index} className="animate-fade text-sm text-muted" aria-live="polite">
        {SAVING_MESSAGES[index]}
      </p>
    </div>
  );
}
