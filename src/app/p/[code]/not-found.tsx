import Link from "next/link";

export default function ProjectNotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <p className="type-overline">Código no encontrado</p>
      <h1 className="type-display max-w-md text-3xl leading-[1.1] text-ink">
        Este código no corresponde a ningún proyecto
      </h1>
      <p className="max-w-md text-sm text-muted">
        Comprueba que lo has escrito igual que te lo pasaron (sin espacios) o
        pide a tu grupo que te reenvíe el enlace.
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
