export function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
        <span className="text-sm text-muted">Cargando tu proyecto…</span>
      </div>
    </div>
  );
}
