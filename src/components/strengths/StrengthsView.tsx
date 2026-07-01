"use client";

import { useState } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import { useProject } from "@/lib/data/ProjectProvider";
import { InlineText } from "@/components/ui/InlineText";

export function StrengthsView() {
  const { project, setStrengths } = useProject();
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    setStrengths([...project.strengths, value]);
    setDraft("");
  };

  const updateAt = (index: number, value: string) => {
    const next = project.strengths.map((s, i) => (i === index ? value : s));
    setStrengths(next.filter((s) => s.trim().length > 0));
  };

  const removeAt = (index: number) => {
    setStrengths(project.strengths.filter((_, i) => i !== index));
  };

  return (
    <div className="flex h-full flex-col gap-5 p-4 md:p-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Fortalezas del equipo
        </h2>
        <p className="text-sm text-muted">
          Aquello que hacéis bien juntos. Añade, edita o quita en un clic.
        </p>
      </div>

      <div className="max-w-2xl rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="mb-4 flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Ej. Buena comunicación"
            className="h-10 flex-1 rounded-xl border border-line bg-surface px-3 text-sm outline-none transition-colors placeholder:text-muted-2 focus:border-accent"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Añadir
          </button>
        </div>

        {project.strengths.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Sparkles className="h-6 w-6 text-muted-2" />
            <p className="text-sm text-muted">
              Todavía no hay fortalezas. Añade la primera arriba.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {project.strengths.map((strength, index) => (
              <div
                key={index}
                className="group flex items-center gap-1 rounded-full border border-line bg-surface-2/60 py-1 pl-2 pr-1 transition-colors hover:border-accent/40"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
                <InlineText
                  value={strength}
                  onCommit={(value) => updateAt(index, value)}
                  ariaLabel="Fortaleza"
                  className="!px-1 text-sm font-medium"
                />
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  aria-label="Quitar fortaleza"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
