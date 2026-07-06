import Link from "next/link";
import { getTeacherUser } from "@/lib/auth/teacher";
import { loadTeacherOverview } from "@/lib/data/cloud/teacher-load";
import { TeacherAccess } from "@/components/teacher/TeacherAccess";
import { TeacherHome } from "@/components/teacher/TeacherHome";

// The teacher's area. One route, two states: without a (real) account it is
// the access screen; with one, the templates home. Students' anonymous
// sessions do NOT count as signed in here.

export default async function TeacherPage() {
  const teacher = await getTeacherUser();
  if (!teacher) return <TeacherAccess />;

  const overview = await loadTeacherOverview();
  // The RPC answers null when the session isn't a real account; getTeacherUser
  // already filtered that, so this only fires on races (e.g. just signed out).
  if (overview.state === "unauthenticated") return <TeacherAccess />;

  if (overview.state === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <h1 className="type-display text-3xl text-ink">Algo ha fallado</h1>
        <p className="max-w-md text-sm text-muted">{overview.message}</p>
        <Link
          href="/"
          className="mt-2 inline-flex h-11 items-center rounded-xl bg-ink px-6 text-sm font-medium text-canvas transition-colors hover:bg-ink-hover"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <TeacherHome templates={overview.templates} email={teacher.email ?? ""} />
  );
}
