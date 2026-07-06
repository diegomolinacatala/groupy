import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCloudProject } from "@/lib/data/cloud/load";
import { CloudProjectProvider } from "@/lib/data/cloud/CloudProjectProvider";
import { DashboardUiProvider } from "@/lib/ui/dashboard-ui";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { WhoAreYouScreen } from "@/components/cloud/WhoAreYouScreen";
import { TemplateLanding } from "@/components/cloud/TemplateLanding";

// Cloud project dashboard, addressed by share code (/p/AF3322F). ONE box for
// every code: a class (template) code renders the template landing, a group
// code the who-are-you / dashboard flow.
// Server component: cookies() inside the Supabase client makes it dynamic,
// so every visit re-reads the project under the visitor's own RLS view.

export default async function CloudProjectPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const result = await loadCloudProject(decodeURIComponent(code));

  if (result.state === "not_found") notFound();

  if (result.state === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <h1 className="type-display text-3xl text-ink">Algo ha fallado</h1>
        <p className="max-w-md text-sm text-muted">{result.message}</p>
        <Link
          href="/"
          className="mt-2 inline-flex h-11 items-center rounded-xl bg-ink px-6 text-sm font-medium text-canvas transition-colors hover:bg-ink-hover"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  if (result.state === "template") {
    return <TemplateLanding preview={result.preview} />;
  }

  if (result.state === "who_are_you") {
    return <WhoAreYouScreen preview={result.preview} />;
  }

  return (
    <CloudProjectProvider project={result.project} ctx={result.ctx}>
      <DashboardUiProvider
        scope={`p:${result.ctx.joinCode}`}
        initialFocusMemberId={result.ctx.memberId}
      >
        <DashboardShell />
      </DashboardUiProvider>
    </CloudProjectProvider>
  );
}
