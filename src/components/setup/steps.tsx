"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import type { SetupAnswers } from "@/lib/data/plan";
import { cn } from "@/lib/utils/cn";
import { addDaysISO, addMonthsISO, daysBetweenISO } from "@/lib/utils/dates";

// The six wizard questions. Each step renders a heading and one input;
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

export function StepProject({ answers, patch, onNext }: StepProps) {
  return (
    <div>
      <WizardHeading overline="El proyecto" question="¿Qué vais a hacer?" />

      <input
        autoFocus
        value={answers.title}
        onChange={(e) => patch({ title: e.target.value })}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (answers.title.trim()) onNext();
        }}
        placeholder="Título del trabajo"
        aria-label="Título del proyecto"
        className={inputClass}
      />

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-medium text-muted">
          Objetivos
        </span>
        <textarea
          value={answers.description}
          onChange={(e) => patch({ description: e.target.value })}
          rows={3}
          placeholder="Opcional"
          aria-label="Objetivos"
          className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink outline-none transition-colors placeholder:text-muted-2 focus:border-ink"
        />
      </label>
    </div>
  );
}

/**
 * Shared quick-entry list (team, tasks): type, Enter, type, Enter. Enter on
 * an empty input advances the step.
 */
function QuickList({
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
        helper="Al menos dos. La primera persona coordina."
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
        trailing={(index) =>
          index === 0 ? (
            <span className="type-overline !text-accent">Coordina</span>
          ) : null
        }
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

export function StepWho({ answers, patch, onNext }: StepProps) {
  const selfIndex = answers.selfIndex;

  // Enter with focus outside the list (e.g. right after the step mounts)
  // advances once someone is picked; a focused button handles its own Enter.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || selfIndex === null) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) return;
      event.preventDefault();
      onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selfIndex, onNext]);

  return (
    <div>
      <WizardHeading overline="Tú" question="¿Quién eres?" />

      <ul className="divide-y divide-line border-y border-line">
        {answers.memberNames.map((name, index) => {
          const selected = selfIndex === index;
          return (
            <li key={name}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => patch({ selfIndex: index })}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || !selected) return;
                  e.preventDefault();
                  onNext();
                }}
                className={cn(
                  "flex w-full items-center gap-4 rounded-lg px-2 py-3 text-left transition-colors",
                  selected ? "bg-surface-2" : "hover:bg-surface-2/60",
                )}
              >
                <span className="w-6 text-sm tabular-nums text-muted-2">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "flex-1 text-[15px] font-medium",
                    selected ? "text-ink" : "text-ink-2",
                  )}
                >
                  {name}
                </span>
                {selected && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="type-overline !text-accent">Tú</span>
                    <Check className="h-4 w-4 text-accent" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
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

/**
 * Suggestion chips + free input. Shared by the wizard and the who-are-you
 * screen. `onChange` takes an updater so rapid toggles never read stale state;
 * `onSubmit` fires on Enter over an empty input.
 */
export function StrengthsPicker({
  value,
  onChange,
  onSubmit,
}: {
  value: string[];
  onChange: (updater: (prev: string[]) => string[]) => void;
  onSubmit: () => void;
}) {
  const [draft, setDraft] = useState("");

  const toggle = (item: string) =>
    onChange((prev) =>
      prev.includes(item) ? prev.filter((s) => s !== item) : [...prev, item],
    );

  const addDraft = () => {
    const item = draft.trim();
    if (!item) return;
    onChange((prev) => (prev.includes(item) ? prev : [...prev, item]));
    setDraft("");
  };

  const custom = value.filter((s) => !STRENGTH_SUGGESTIONS.includes(s));

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {STRENGTH_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => toggle(suggestion)}
            className={chipClass(value.includes(suggestion))}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (draft.trim()) addDraft();
          else onSubmit();
        }}
        placeholder="Otra fortaleza…"
        aria-label="Añadir fortaleza"
        className={inputClass}
      />

      {custom.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {custom.map((strength) => (
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

export function StepStrengths({ answers, patch, onNext }: StepProps) {
  return (
    <div>
      <WizardHeading overline="Tus fortalezas" question="¿En qué destacas?" />

      <StrengthsPicker
        value={answers.selfStrengths}
        onChange={(updater) =>
          patch((prev) => ({ selfStrengths: updater(prev.selfStrengths) }))
        }
        onSubmit={onNext}
      />
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
