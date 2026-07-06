import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getTeacherUser } from "@/lib/auth/teacher";
import { loadTemplateEditor } from "@/lib/data/cloud/teacher-load";
import { TemplateProvider } from "@/lib/data/cloud/TemplateProvider";
import { DashboardUiProvider } from "@/lib/ui/dashboard-ui";
import { TemplateEditor } from "@/components/teacher/TemplateEditor";

// One template's editor, teacher-only. RLS is the real gate (someone else's
// template loads as not_found); the redirect just lands signed-out visitors
// on the access screen instead of a dead 404.

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const teacher = await getTeacherUser();
  if (!teacher) redirect("/profesor");

  const result = await loadTemplateEditor(id);
  if (result.state === "not_found") notFound();

  if (result.state === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <h1 className="type-display text-3xl text-ink">Algo ha fallado</h1>
        <p className="max-w-md text-sm text-muted">{result.message}</p>
        <Link
          href="/profesor"
          className="mt-2 inline-flex h-11 items-center rounded-xl bg-ink px-6 text-sm font-medium text-canvas transition-colors hover:bg-ink-hover"
        >
          Volver a tus plantillas
        </Link>
      </div>
    );
  }

  return (
    <TemplateProvider project={result.project} ctx={result.ctx}>
      <DashboardUiProvider scope={`t:${result.ctx.projectId}`}>
        <TemplateEditor />
      </DashboardUiProvider>
    </TemplateProvider>
  );
}
