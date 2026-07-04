"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Lock } from "lucide-react";
import { claimCloudMember } from "@/lib/data/cloud/actions";
import { saveLastCloudProject } from "@/lib/data/cloud/recent";
import type { ProjectPreview } from "@/lib/data/cloud/schemas";
import { colorForKey, initialsFromName } from "@/lib/utils/colors";
import { cn } from "@/lib/utils/cn";

// Entry gate for a shared project: the visitor taps which declared member
// they are — that single click claims the row (binding their anonymous
// session to it) and drops them straight on the dashboard.

export function WhoAreYouScreen({ preview }: { preview: ProjectPreview }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [enteringName, setEnteringName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const code = preview.project.join_code;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/p/${code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (permissions/insecure context): the visible
      // code is still there to copy by hand.
    }
  };

  // One click: claim the member and refresh — the server component re-renders
  // with the now-claimed session and swaps this screen for the dashboard.
  const handlePick = async (memberId: string, memberName: string) => {
    if (pendingId || enteringName) return;
    setPendingId(memberId);
    setError(null);
    const result = await claimCloudMember({ memberId });
    if (!result.ok) {
      setError(result.error);
      setPendingId(null);
      return;
    }
    saveLastCloudProject({ code, title: preview.project.title });
    setEnteringName(memberName);
    router.refresh();
  };

  // While the refreshed dashboard loads, show loading — not a frozen list.
  if (enteringName) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-6">
        <span className="type-display text-2xl text-ink">Groupy</span>
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-accent" />
        <p className="text-sm text-muted" aria-live="polite">
          Entrando como {enteringName}…
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex items-center justify-center px-5 py-4">
        <span className="type-display text-lg text-ink">Groupy</span>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pt-[10vh]">
        <div className="animate-rise w-full max-w-md">
          <p className="type-overline mb-3">Proyecto compartido</p>
          <h1 className="type-display text-3xl leading-[1.1] text-ink">
            {preview.project.title}
          </h1>
          {preview.project.description && (
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {preview.project.description}
            </p>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            title="Copiar enlace del proyecto"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-accent" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span className="font-mono tracking-[0.15em]">{code}</span>
            <span>{copied ? "Enlace copiado" : "Copiar enlace"}</span>
          </button>

          <h2 className="type-overline mb-1 mt-10">¿Quién eres?</h2>
          <p className="mb-3 text-xs text-muted-2">
            Toca tu nombre para entrar.
          </p>
          <ul className="flex flex-col gap-2">
            {preview.members.map((member) => {
              const color = colorForKey(member.color_key);
              const disabled =
                (member.claimed && !member.is_self) || pendingId !== null;
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      void handlePick(member.id, member.display_name)
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left transition-colors",
                      disabled
                        ? "opacity-55"
                        : "hover:border-line-strong hover:bg-surface-2",
                    )}
                  >
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
                      style={{ backgroundColor: color.bg, color: color.ink }}
                    >
                      {initialsFromName(member.display_name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-ink">
                        {member.display_name}
                      </span>
                      {member.role && (
                        <span className="block truncate text-xs text-muted">
                          {member.role}
                        </span>
                      )}
                    </span>
                    {pendingId === member.id ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent" />
                    ) : member.claimed ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <Lock className="h-3.5 w-3.5" />
                        {member.is_self ? "Tú" : "Ya dentro"}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-accent">
                        Soy yo
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {error && (
            <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink">
              {error}
            </p>
          )}

          <p className="mt-6 text-xs text-muted-2">
            ¿No estás en la lista? Alguien del grupo puede añadirte en
            «Equipo».
          </p>
        </div>
      </main>
    </div>
  );
}
