"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowRight, Loader2, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

// Solo rutas internas. Un prefijo "/" no basta: "/%09/evil.example" o
// "/\evil.example" pasan ese chequeo y el parser de URL los resuelve a otro
// origen (open redirect). Se resuelve contra el origen propio y se exige que
// siga siendo el mismo.
function safeNext(raw: string | null): string {
  const fallback = "/perfil";
  if (!raw || !raw.startsWith("/") || /[\u0000-\u001f\\]/.test(raw)) return fallback;
  try {
    // Base ficticia: mismo resultado en servidor y cliente (sin hydration
    // mismatch); lo que importa es que el destino no cambie de origen.
    const base = "http://self.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithGoogle, isGuest, user, authError } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawNext = searchParams.get("next");
  const next = safeNext(rawNext);

  const alreadyLoggedIn = !!user && !isGuest;

  // Al quedar con sesion real (popup de Google), saltar a donde el usuario
  // queria ir, p. ej. de vuelta a la mesa que lo mando a loguearse.
  useEffect(() => {
    if (alreadyLoggedIn) router.replace(next);
  }, [alreadyLoggedIn, next, router]);

  async function handle() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      setError("No se pudo iniciar sesión. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const shownError = error ?? authError;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      <div className="grid grid-cols-1 gap-12 pt-14 pb-24 sm:pt-20 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-12 lg:items-center lg:gap-8 lg:pt-16 lg:pb-16">
        {/* Declaracion editorial */}
        <section className="lg:col-span-7 lg:pr-10">
          <p className="eyebrow mb-6 flex items-center gap-2">
            <span className="suit text-sm" aria-hidden>
              ♣
            </span>
            Cuenta
          </p>
          <h1 className="display text-5xl text-primary sm:text-6xl lg:text-7xl">
            Inicia sesión y la mesa <em className="text-accent-200">te recuerda.</em>
          </h1>
          <p className="mt-7 max-w-[46ch] text-base leading-relaxed text-secondary">
            Guarda tu progreso, monedas y rango. Tu partida como invitado se conserva al entrar.
          </p>
          <p className="eyebrow mt-8">Monedas  ·  Rango por experiencia  ·  Historial de partidas</p>
        </section>

        {/* Acciones */}
        <section
          aria-label="Opciones de inicio de sesión"
          className="border-t border-line pt-10 lg:col-span-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-12"
        >
          {alreadyLoggedIn ? (
            <div className="flex max-w-sm flex-col gap-5">
              <p className="eyebrow">Sesión activa</p>
              <p className="font-display text-2xl leading-snug text-primary">
                Ya tienes una sesión abierta.
              </p>
              <Link href={next} className="btn-primary w-full">
                {next === "/perfil" ? "Ver mi perfil" : "Continuar"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="flex max-w-sm flex-col gap-3">
              <p className="eyebrow mb-2">Elige cómo entrar</p>

              <button
                type="button"
                onClick={handle}
                disabled={busy}
                aria-busy={busy}
                className="btn-primary w-full"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleIcon />}
                Continuar con Google
              </button>

              {shownError && (
                <p
                  role="alert"
                  className="mt-1 flex items-start gap-2 border-l-2 border-rose-400/70 py-1 pl-3 text-sm leading-snug text-rose-300"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {shownError}
                </p>
              )}

              <div className="flex items-center gap-3 py-3" aria-hidden>
                <span className="rule flex-1" />
                <span className="eyebrow">o</span>
                <span className="rule flex-1" />
              </div>

              <Link
                href={rawNext ? next : "/"}
                className="btn-link inline-flex items-center gap-2 self-start text-sm"
              >
                <UserRound className="h-4 w-4" aria-hidden />
                Continuar como invitado
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
