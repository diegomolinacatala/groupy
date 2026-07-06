"use client";

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { SetupAnswers } from "@/lib/data/plan";
import { cn } from "@/lib/utils/cn";
import { addDaysISO, addMonthsISO, daysBetweenISO } from "@/lib/utils/dates";
import { MEMBER_COLORS, initialsFromName } from "@/lib/utils/colors";

// The four wizard questions. Each step renders a heading and one input;
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

/**
 * Shared quick-entry list (team, tasks): type, Enter, type, Enter. Enter on
 * an empty input advances the step. Also reused by the template landing's
 * "crear grupo" mini-wizard.
 */
export function QuickList({
  items,
  placeholder,
  inputLabel,
  removeLabel,
  onAdd,
  onRemoveAt,
  onNext,
  trailing,
}: {
  items: string[];
  placeholder: string;
  inputLabel: string;
  removeLabel: (item: string) => string;
  onAdd: (value: string) => void;
  onRemoveAt: (index: number) => void;
  onNext: () => void;
  trailing?: (index: number) => ReactNode;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onAdd(value);
    setDraft("");
  };

  return (
    <div>
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
          placeholder={placeholder}
          aria-label={inputLabel}
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

      {items.length > 0 && (
        <ul className="animate-rise-delayed mt-6 divide-y divide-line border-y border-line">
          {items.map((item, index) => (
            <li key={item} className="flex items-center gap-4 py-3">
              <span className="w-6 text-sm tabular-nums text-muted-2">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 text-[15px] font-medium text-ink">
                {item}
              </span>
              {trailing?.(index)}
              <button
                type="button"
                onClick={() => onRemoveAt(index)}
                aria-label={removeLabel(item)}
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

export function StepTeam({ answers, patch, onNext }: StepProps) {
  return (
    <div>
      <WizardHeading
        overline="El equipo"
        question="¿Quiénes sois?"
        helper="Al menos dos personas."
      />

      <QuickList
        items={answers.memberNames}
        placeholder={
          answers.memberNames.length === 0 ? "Tu nombre" : "Siguiente persona"
        }
        inputLabel="Nombre del miembro"
        removeLabel={(name) => `Quitar a ${name}`}
        onAdd={(name) =>
          patch((prev) => ({
            memberNames: prev.memberNames.some(
              (n) => n.toLowerCase() === name.toLowerCase(),
            )
              ? prev.memberNames
              : [...prev.memberNames, name],
          }))
        }
        onRemoveAt={(index) =>
          patch((prev) => {
            const memberNames = prev.memberNames.filter((_, i) => i !== index);
            // Keep the "¿quién eres?" pick pointing at the same person.
            let selfIndex = prev.selfIndex;
            if (selfIndex !== null) {
              if (selfIndex === index) selfIndex = null;
              else if (selfIndex > index) selfIndex -= 1;
            }
            return { memberNames, selfIndex };
          })
        }
        onNext={onNext}
      />
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

/**
 * "¿Quién eres?" — one click picks you AND advances; no confirm button.
 * The wizard passes `onPick` so selection + navigation land in one state
 * update (a patch-then-next pair would read a stale validity check).
 */
export function StepWho({
  answers,
  onPick,
}: {
  answers: SetupAnswers;
  onPick: (index: number) => void;
}) {
  return (
    <div>
      <WizardHeading
        overline="Tú"
        question="¿Quién eres?"
        helper="Toca tu nombre para continuar."
      />

      <ul className="flex flex-col gap-2">
        {answers.memberNames.map((name, index) => {
          // Same palette order the built project will assign (plan.ts cycles
          // the palette in member order), so the preview colours match.
          const color = MEMBER_COLORS[index % MEMBER_COLORS.length];
          return (
            <li key={name}>
              <button
                type="button"
                onClick={() => onPick(index)}
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
                <span className="text-xs font-medium text-accent">Soy yo</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function StepTasks({ answers, patch, onNext }: StepProps) {
  return (
    <div>
      <WizardHeading
        overline="Las tareas"
        question="¿Qué hay que hacer?"
        helper="Al menos una. Luego se reparten arrastrando."
      />

      <QuickList
        items={answers.taskNames}
        placeholder={
          answers.taskNames.length === 0 ? "Primera tarea" : "Siguiente tarea"
        }
        inputLabel="Nombre de la tarea"
        removeLabel={(task) => `Quitar ${task}`}
        onAdd={(task) =>
          patch((prev) => ({
            taskNames: prev.taskNames.some(
              (t) => t.toLowerCase() === task.toLowerCase(),
            )
              ? prev.taskNames
              : [...prev.taskNames, task],
          }))
        }
        onRemoveAt={(index) =>
          patch((prev) => ({
            taskNames: prev.taskNames.filter((_, i) => i !== index),
          }))
        }
        onNext={onNext}
      />
    </div>
  );
}
