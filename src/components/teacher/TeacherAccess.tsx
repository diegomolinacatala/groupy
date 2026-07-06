"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MailCheck } from "lucide-react";
import { signInTeacher, signUpTeacher } from "@/lib/auth/teacher-actions";
import { Segmented } from "@/components/ui/Segmented";

// Entry gate for the teacher role: email + password (locked decision). The
// students' world stays account-free — this screen exists ONLY for whoever
// creates templates and, later, reads reports.

type AccessMode = "signin" | "signup";

const inputClass =
  "h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px] text-ink outline-none transition-colors placeholder:text-muted-2 focus:border-ink";

export function TeacherAccess() {
  const router = useRouter();
  const [mode, setMode] = useState<AccessMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    const credentials = { email: email.trim(), password };
    const result =
      mode === "signin"
        ? await signInTeacher(credentials)
        : await signUpTeacher(credentials);

    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    if (result.needsEmailConfirmation) {
      setConfirmationSent(true);
      setPending(false);
      return;
    }
    // The server component re-renders with the session and swaps in the home.
    router.refresh();
  };

  if (confirmationSent) {
    return (
      <AccessFrame>
        <div className="animate-rise flex flex-col items-start gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft">
            <MailCheck className="h-6 w-6 text-accent" />
          </span>
          <h1 className="type-display text-3xl leading-[1.1] text-ink">
            Revisa tu correo
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            Te hemos enviado un enlace de confirmación a{" "}
            <span className="font-medium text-ink">{email.trim()}</span>.
            Confírmalo y vuelve aquí para entrar.
          </p>
          <button
            type="button"
            onClick={() => {
              setConfirmationSent(false);
              setMode("signin");
            }}
            className="text-sm font-medium text-accent hover:underline"
          >
            Ya lo he confirmado — entrar
          </button>
        </div>
      </AccessFrame>
    );
  }

  return (
    <AccessFrame>
      <div className="animate-rise">
        <p className="type-overline mb-3">Profesores</p>
        <h1 className="type-display text-4xl leading-[1.08] text-ink">
          Una plantilla, un código, toda la clase.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Prepara las tareas y fechas una vez y comparte el código: cada grupo
          entra sin cuentas y se reparte el trabajo. Tú no verás su trabajo en
          curso — solo el informe final.
        </p>

        <div className="mt-8">
          <Segmented
            stretch
            options={[
              { value: "signin", label: "Entrar" },
              { value: "signup", label: "Crear cuenta" },
            ]}
            value={mode}
            onChange={(next) => {
              setMode(next);
              setError(null);
            }}
          />
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo"
            aria-label="Correo del profesor"
            className={inputClass}
          />
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              mode === "signup" ? "Contraseña (mínimo 8 caracteres)" : "Contraseña"
            }
            aria-label="Contraseña"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-ink px-7 text-[15px] font-medium text-canvas transition-colors hover:bg-ink-hover disabled:pointer-events-none disabled:opacity-40"
          >
            {pending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-canvas/40 border-t-canvas" />
            ) : mode === "signin" ? (
              "Entrar"
            ) : (
              "Crear cuenta de profesor"
            )}
          </button>
        </form>

        {error && (
          <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <p className="mt-6 text-xs leading-relaxed text-muted-2">
          Los alumnos nunca necesitan cuenta: entran con el código de clase y
          eligen su nombre.
        </p>
      </div>
    </AccessFrame>
  );
}

function AccessFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex items-center justify-between px-5 py-4 md:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Inicio
        </Link>
        <span className="type-display text-lg text-ink">Groupy</span>
        <span className="w-16" aria-hidden />
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-[8vh] md:pt-[12vh]">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
