"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CornerDownLeft } from "lucide-react";
import { buildProjectPlan, chosenMemberId, type SetupAnswers } from "@/lib/data/plan";
import { saveLocalIdentity, saveProject } from "@/lib/data/store";
import {
  claimCloudMember,
  createCloudProject,
  setCloudMemberStrengths,
} from "@/lib/data/cloud/actions";
import { projectToCreateInput } from "@/lib/data/cloud/mapping";
import { saveLastCloudProject } from "@/lib/data/cloud/recent";
import { addMonthsISO, todayISO } from "@/lib/utils/dates";
import {
  StepDates,
  StepProject,
  StepStrengths,
  StepTasks,
  StepTeam,
  StepWho,
} from "./steps";

// One question per screen, Talli-style: thin progress bar, big serif
// question, a single input, Enter to continue. The cloud save happens at the
// end, behind the final button — no staged "saving" screen; on success you
// land straight on the shared dashboard (Organización tab).

const TOTAL_STEPS = 6;

type StepIndex = 0 | 1 | 2 | 3 | 4 | 5;

function isStepValid(step: StepIndex, answers: SetupAnswers): boolean {
  switch (step) {
    case 0:
      return answers.title.trim().length > 0;
    case 1:
      return answers.memberNames.length >= 2;
    case 2:
      return (
        answers.startDate.length > 0 &&
        answers.dueDate.length > 0 &&
        answers.dueDate > answers.startDate
      );
    case 3:
      return answers.selfIndex !== null;
    case 4:
      return true; // strengths are optional
    case 5:
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
      title: "",
      description: "",
      memberNames: [],
      startDate,
      dueDate: addMonthsISO(startDate, 1),
      selfIndex: null,
      selfStrengths: [],
      taskNames: [],
    };
  });

  // Accepts an updater so list operations (add member, toggle strength)
  // always read the freshest state, even on rapid consecutive events.
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
    const project = buildProjectPlan(answers);
    const memberId = chosenMemberId(answers, project);

    const created = await createCloudProject(projectToCreateInput(project));
    if (!created.ok) {
      setSaveError(created.error);
      setSaving(false);
      return;
    }
    saveLastCloudProject({ code: created.joinCode, title: project.title });
    // Claim + strengths are best-effort: if either fails, the who-are-you
    // screen picks the identity up on landing instead.
    if (memberId) {
      const claimed = await claimCloudMember({ memberId });
      if (claimed.ok && answers.selfStrengths.length > 0) {
        await setCloudMemberStrengths({
          memberId,
          strengths: answers.selfStrengths,
        });
      }
    }
    router.push(`/p/${created.joinCode}`);
  };

  // Cloud unavailable: keep the built project on this device only.
  const continueLocally = () => {
    const project = buildProjectPlan(answers);
    saveProject(project);
    saveLocalIdentity(chosenMemberId(answers, project));
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
            <StepProject answers={answers} patch={patch} onNext={goNext} />
          )}
          {step === 1 && (
            <StepTeam answers={answers} patch={patch} onNext={goNext} />
          )}
          {step === 2 && (
            <StepDates answers={answers} patch={patch} onNext={goNext} />
          )}
          {step === 3 && (
            <StepWho answers={answers} patch={patch} onNext={goNext} />
          )}
          {step === 4 && (
            <StepStrengths answers={answers} patch={patch} onNext={goNext} />
          )}
          {step === 5 && (
            <StepTasks answers={answers} patch={patch} onNext={goNext} />
          )}

          <div className="mt-10">
            <button
              type="button"
              onClick={goNext}
              disabled={!valid || saving}
              className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-ink px-7 text-[15px] font-medium text-canvas transition-colors hover:bg-ink-hover disabled:pointer-events-none disabled:opacity-30"
            >
              {isLast ? "Crear proyecto" : "Continuar"}
              {saving ? (
                <span className="h-4 w-4 animate-spin rounded-full border-[1.5px] border-canvas/30 border-t-canvas" />
              ) : (
                <CornerDownLeft className="h-4 w-4 opacity-60" />
              )}
            </button>

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
                    onClick={continueLocally}
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
