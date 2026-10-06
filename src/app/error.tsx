"use client";

import { useEffect } from "react";
import Link from "next/link";

// Last-resort screen for unexpected render errors anywhere in the app: a
// plain Spanish message with a retry, never a blank page or a stack trace.
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <p className="type-overline">Error inesperado</p>
      <h1 className="type-display max-w-md text-3xl leading-[1.1] text-ink">
        Algo ha fallado al cargar esta página
      </h1>
      <p className="max-w-md text-sm text-muted">
        Puede ser un problema momentáneo de conexión. Vuelve a intentarlo; tus
        datos no se han perdido.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-11 items-center rounded-xl bg-ink px-6 text-sm font-medium text-canvas transition-colors hover:bg-ink-hover"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-xl border border-line bg-surface px-6 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
