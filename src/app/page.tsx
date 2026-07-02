"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { hasStoredProject } from "@/lib/data/store";

// Cross-tab aware and hydration-safe: the server snapshot is always
// "no project"; the client snapshot reads localStorage.
function subscribeToStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const FEATURES = [
  {
    number: "01",
    title: "Cinco preguntas",
    body: "El encargo, el equipo y las fechas. Nada más: en dos minutos hay plan.",
  },
  {
    number: "02",
    title: "Un plan repartido",
    body: "Fases con fecha en el calendario y tareas asignadas a cada miembro desde el primer día.",
  },
  {
    number: "03",
    title: "Progreso registrado",
    body: "Tareas, estados y revisiones: quién hizo qué deja de ser una discusión.",
  },
];

export default function Home() {
  const hasProject = useSyncExternalStore(
    subscribeToStorage,
    hasStoredProject,
    () => false,
  );

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <span className="type-display text-xl text-ink">Groupy</span>
        <Link
          href="/dashboard"
          className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          Ver un ejemplo
        </Link>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-3xl px-6 pb-20 pt-[10vh] text-center md:pt-[14vh]">
          <p className="type-overline mb-6">Trabajo en grupo, sin fricción</p>
          <h1 className="type-display mx-auto max-w-2xl text-5xl leading-[1.05] text-ink md:text-6xl">
            Nosotros repartimos el trabajo. Vosotros lo termináis.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted md:text-lg">
            Responde cinco preguntas y Groupy convierte el encargo en un plan
            con fechas y tareas asignadas — y en un registro continuo de quién
            hace qué.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={hasProject ? "/dashboard" : "/setup"}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-ink px-7 text-[15px] font-medium text-canvas transition-colors hover:bg-ink-hover"
            >
              {hasProject ? "Continuar con vuestro proyecto" : "Crear nuestro plan"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            {hasProject && (
              <Link
                href="/setup"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-line bg-surface px-6 text-[15px] font-medium text-ink transition-colors hover:bg-surface-2"
              >
                Empezar uno nuevo
              </Link>
            )}
          </div>
        </section>

        <section className="mx-auto w-full max-w-4xl px-6 pb-24">
          <div className="grid gap-10 border-t border-line pt-10 md:grid-cols-3 md:gap-8">
            {FEATURES.map((feature) => (
              <div key={feature.number}>
                <p className="type-overline mb-3 !text-accent">
                  {feature.number}
                </p>
                <h2 className="type-display text-xl text-ink">
                  {feature.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-6 py-5 md:px-10">
        <p className="text-xs text-muted-2">
          Groupy — prototipo con datos de ejemplo. Ningún dato sale de este
          navegador.
        </p>
      </footer>
    </div>
  );
}
