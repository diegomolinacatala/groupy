"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { SetupAnswers } from "@/lib/data/plan";
import { addMonthsISO, todayISO } from "@/lib/utils/dates";
import { GeneratingScreen } from "./GeneratingScreen";
import { StepDates, StepStrengths, StepTeam } from "./steps";

// One question per screen, Talli-style: thin progress bar, big serif
// question, a single input, Enter to continue. Three steps, then a short
// "building your plan" pass that writes the generated project to storage.
// The project gets a default title, renamable inline from the dashboard.

const TOTAL_STEPS = 3;

type StepIndex = 0 | 1 | 2;

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
      return true; // strengths are optional
  }
}

export function SetupWizard() {
  const [step, setStep] = useState<StepIndex>(0);
  const [generating, setGenerating] = useState(false);
  const [answers, setAnswers] = useState<SetupAnswers>(() => {
    const startDate = todayISO();
    return {
      title: "Trabajo en grupo",
      description: "",
      memberNames: [],
      startDate,
      dueDate: addMonthsISO(startDate, 1),
      strengths: [],
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

  const goNext = () => {
    if (!valid) return;
    if (step === TOTAL_STEPS - 1) {
      setGenerating(true);
    } else {
      setStep((s) => (s + 1) as StepIndex);
    }
  };

  const goBack = () => {
    if (step > 0) setStep((s) => (s - 1) as StepIndex);
  };

  if (generating) {
    return <GeneratingScreen answers={answers} />;
  }

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
          {step === 2 && (
            <StepStrengths answers={answers} patch={patch} onNext={goNext} />
          )}

          <div className="mt-10 flex items-center gap-4">
            <button
              type="button"
              onClick={goNext}
              disabled={!valid}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-ink px-7 text-[15px] font-medium text-canvas transition-colors hover:bg-ink-hover disabled:pointer-events-none disabled:opacity-30"
            >
              {isLast ? "Crear nuestro plan" : "Continuar"}
            </button>
            {valid && !isLast && (
              <span className="hidden text-xs text-muted-2 sm:block">
                o pulsa Enter
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
