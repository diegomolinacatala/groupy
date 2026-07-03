"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { SetupAnswers } from "@/lib/data/plan";
import { cn } from "@/lib/utils/cn";
import { addDaysISO, addMonthsISO, daysBetweenISO } from "@/lib/utils/dates";

// The three wizard questions. Each step renders a heading and one input;
// navigation and the continue button live in SetupWizard.

interface StepProps {
  answers: SetupAnswers;
  patch: (
    partial:
      | Partial<SetupAnswers>
      | ((prev: SetupAnswers) => Partial<SetupAnswers>),
  ) => void;
  onNext: () => void;
}

function WizardHeading({
  overline,
  question,
  helper,
}: {
  overline: string;
  question: string;
  helper?: string;
}) {
  return (
    <div className="mb-8">
      <p className="type-overline mb-3">{overline}</p>
      <h1 className="type-display text-4xl leading-[1.08] text-ink md:text-5xl">
        {question}
      </h1>
      {helper && (
        <p className="mt-3 text-[15px] leading-relaxed text-muted">{helper}</p>
      )}
    </div>
  );
}

const inputClass =
  "h-14 w-full rounded-xl border border-line bg-surface px-4 text-lg text-ink outline-none transition-colors placeholder:text-muted-2 focus:border-ink";

const chipClass = (active: boolean) =>
  cn(
    "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
    active
      ? "border-ink bg-ink text-canvas"
      : "border-line bg-surface text-ink-2 hover:border-line-strong",
  );

export function StepTeam({ answers, patch, onNext }: StepProps) {
  const [draft, setDraft] = useState("");
  const names = answers.memberNames;

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    patch((prev) => ({
      memberNames: prev.memberNames.some(
        (n) => n.toLowerCase() === name.toLowerCase(),
      )
        ? prev.memberNames
        : [...prev.memberNames, name],
    }));
    setDraft("");
  };

  const removeAt = (index: number) =>
    patch((prev) => ({
      memberNames: prev.memberNames.filter((_, i) => i !== index),
    }));

  return (
    <div>
      <WizardHeading
        overline="El equipo"
        question="¿Quiénes sois?"
        helper="Al menos dos. La primera persona coordina."
      />

      <div className="flex gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (draft.trim()) add();
            else onNext();
          }}
          placeholder={names.length === 0 ? "Tu nombre" : "Siguiente persona"}
          aria-label="Nombre del miembro"
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="h-14 shrink-0 rounded-xl border border-line bg-surface px-5 text-[15px] font-medium text-ink transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30"
        >
          Añadir
        </button>
      </div>

      {names.length > 0 && (
        <ul className="animate-rise-delayed mt-6 divide-y divide-line border-y border-line">
          {names.map((name, index) => (
            <li key={name} className="flex items-center gap-4 py-3">
              <span className="w-6 text-sm tabular-nums text-muted-2">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 text-[15px] font-medium text-ink">
                {name}
              </span>
              {index === 0 && (
                <span className="type-overline !text-accent">Coordina</span>
              )}
              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label={`Quitar a ${name}`}
                className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Quick due-date presets, relative to the start date.
const DURATIONS: { label: string; apply: (start: string) => string }[] = [
  { label: "1 semana", apply: (start) => addDaysISO(start, 7) },
  { label: "2 semanas", apply: (start) => addDaysISO(start, 14) },
  { label: "1 mes", apply: (start) => addMonthsISO(start, 1) },
  { label: "2 meses", apply: (start) => addMonthsISO(start, 2) },
];

export function StepDates({ answers, patch, onNext }: StepProps) {
  const { startDate, dueDate } = answers;

  // Moving the start keeps the same span, so the due date never goes stale.
  const handleStartChange = (value: string) => {
    if (!value) return;
    patch((prev) => {
      const span = Math.max(daysBetweenISO(prev.startDate, prev.dueDate), 1);
      return { startDate: value, dueDate: addDaysISO(value, span) };
    });
  };

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onNext();
    }
  };

  return (
    <div>
      <WizardHeading overline="El calendario" question="¿Qué plazo tenéis?" />

      <div className="flex max-w-md gap-3">
        <label className="flex-1">
          <span className="mb-1.5 block text-xs font-medium text-muted">
            Inicio
          </span>
          <input
            autoFocus
            type="date"
            value={startDate}
            onChange={(e) => handleStartChange(e.target.value)}
            onKeyDown={handleEnter}
            aria-label="Fecha de inicio"
            className={cn(inputClass, "tabular-nums")}
          />
        </label>
        <label className="flex-1">
          <span className="mb-1.5 block text-xs font-medium text-muted">
            Entrega
          </span>
          <input
            type="date"
            value={dueDate}
            min={startDate}
            onChange={(e) => e.target.value && patch({ dueDate: e.target.value })}
            onKeyDown={handleEnter}
            aria-label="Fecha de entrega"
            className={cn(inputClass, "tabular-nums")}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {DURATIONS.map(({ label, apply }) => (
          <button
            key={label}
            type="button"
            onClick={() => patch((prev) => ({ dueDate: apply(prev.startDate) }))}
            className={chipClass(apply(startDate) === dueDate)}
          >
            {label}
          </button>
        ))}
      </div>

      {dueDate && dueDate <= startDate && (
        <p className="mt-3 text-sm text-danger">
          La entrega debe ser posterior al inicio.
        </p>
      )}
    </div>
  );
}

const STRENGTH_SUGGESTIONS = [
  "Redacción",
  "Diseño",
  "Presentar en público",
  "Organización",
  "Datos y análisis",
  "Programación",
];

export function StepStrengths({ answers, patch, onNext }: StepProps) {
  const [draft, setDraft] = useState("");
  const strengths = answers.strengths;

  const toggle = (value: string) =>
    patch((prev) => ({
      strengths: prev.strengths.includes(value)
        ? prev.strengths.filter((s) => s !== value)
        : [...prev.strengths, value],
    }));

  const addDraft = () => {
    const value = draft.trim();
    if (!value) return;
    patch((prev) => ({
      strengths: prev.strengths.includes(value)
        ? prev.strengths
        : [...prev.strengths, value],
    }));
    setDraft("");
  };

  return (
    <div>
      <WizardHeading overline="Opcional" question="¿En qué destacáis?" />

      <div className="mb-5 flex flex-wrap gap-2">
        {STRENGTH_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => toggle(suggestion)}
            className={chipClass(strengths.includes(suggestion))}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (draft.trim()) addDraft();
          else onNext();
        }}
        placeholder="Otra fortaleza…"
        aria-label="Añadir fortaleza"
        className={inputClass}
      />

      {strengths.filter((s) => !STRENGTH_SUGGESTIONS.includes(s)).length >
        0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {strengths
            .filter((s) => !STRENGTH_SUGGESTIONS.includes(s))
            .map((strength) => (
              <span
                key={strength}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink py-1.5 pl-4 pr-2 text-sm font-medium text-canvas"
              >
                {strength}
                <button
                  type="button"
                  onClick={() => toggle(strength)}
                  aria-label={`Quitar ${strength}`}
                  className="grid h-5 w-5 place-items-center rounded-full transition-colors hover:bg-ink-hover"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
