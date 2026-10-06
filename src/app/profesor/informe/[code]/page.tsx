import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTeacherUser } from "@/lib/auth/teacher";
import { loadTeacherReport } from "@/lib/data/cloud/teacher-load";
import { TeacherReportView } from "@/components/teacher/TeacherReportView";

// A group's delivered report, teacher-only. RLS is the real gate: a code
// that isn't a group spawned from one of THIS teacher's templates simply
// doesn't resolve (404). Live work is never read here — only the snapshot.

export default async function TeacherReportPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!/^[A-Za-z0-9]{4,12}$/.test(code)) notFound();

  const teacher = await getTeacherUser();
  if (!teacher) redirect("/profesor");

  const result = await loadTeacherReport(code);
  if (result.state === "not_found") notFound();

  if (result.state === "ready") {
    return (
      <TeacherReportView
        project={result.project}
        joinCode={result.joinCode}
        submittedAt={result.submittedAt}
      />
    );
  }

  const copy =
    result.state === "not_delivered"
      ? {
          overline: result.title || "Grupo",
          title: "Este grupo aún no ha entregado su informe",
          body: "Cuando lo entreguen desde su pestaña Informe, aparecerá aquí.",
        }
      : {
          overline: "Error",
          title: "No se ha podido abrir el informe",
          body: result.message,
        };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <p className="type-overline">{copy.overline}</p>
      <h1 className="type-display max-w-md text-3xl leading-[1.1] text-ink">
        {copy.title}
      </h1>
      <p className="max-w-md text-sm text-muted">{copy.body}</p>
      <Link
        href="/profesor"
        className="mt-2 inline-flex h-11 items-center rounded-xl bg-ink px-6 text-sm font-medium text-canvas transition-colors hover:bg-ink-hover"
      >
        Volver a tus plantillas
      </Link>
    </div>
  );
}
