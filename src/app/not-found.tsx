import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <p className="type-overline">Página no encontrada</p>
      <h1 className="type-display max-w-md text-3xl leading-[1.1] text-ink">
        Aquí no hay nada
      </h1>
      <p className="max-w-md text-sm text-muted">
        Si te han pasado un código de clase o de grupo, escríbelo en la página
        de inicio.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex h-11 items-center rounded-xl bg-ink px-6 text-sm font-medium text-canvas transition-colors hover:bg-ink-hover"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
