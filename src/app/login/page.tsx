"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2, UserRound } from "lucide-react";
import { BorderGlow } from "@/components/ui/BorderGlow";
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

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" className="w-5 h-5 fill-current" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { signInWithGoogle, signInWithGithub, isGuest, user } = useAuth();
  const [busy, setBusy] = useState<"google" | "github" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(provider: "google" | "github") {
    setError(null);
    setBusy(provider);
    try {
      if (provider === "google") await signInWithGoogle();
      else await signInWithGithub();
      router.push("/perfil");
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setError(null);
      } else {
        setError("No se pudo iniciar sesion. Intenta de nuevo.");
      }
    } finally {
      setBusy(null);
    }
  }

  const alreadyLoggedIn = !!user && !isGuest;

  return (
    <div className="relative isolate min-h-full w-full flex items-center justify-center px-4 py-12">
      <div className="relative z-[2] w-full max-w-md">
        <BorderGlow
          className="w-full lg-blur"
          edgeSensitivity={26}
          glowColor="0 0 82"
          backgroundColor="var(--lg-bg)"
          borderRadius={24}
          glowRadius={36}
          glowIntensity={1.05}
          coneSpread={22}
          animated
          colors={["#ededf2", "#a0a0a8", "#52525b"]}
          fillOpacity={0.4}
        >
          <div className="flex flex-col gap-6 p-7 sm:p-9">
            <header className="flex flex-col gap-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-primary">
                Inicia sesion
              </h1>
              <p className="text-sm text-muted">
                Guarda tu progreso, monedas y rango. Tu partida como invitado se
                conserva al entrar.
              </p>
            </header>

            {alreadyLoggedIn ? (
              <div className="flex flex-col gap-3">
                <p className="text-center text-sm text-secondary">
                  Ya tienes una sesion activa.
                </p>
                <Link
                  href="/perfil"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white text-black font-bold text-sm uppercase tracking-widest hover:bg-zinc-200 transition btn-press"
                >
                  Ver mi perfil
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => handle("google")}
                  disabled={busy !== null}
                  className="inline-flex items-center justify-center gap-3 px-5 py-3 rounded-2xl bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition btn-press disabled:opacity-60"
                >
                  {busy === "google" ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}
                  Continuar con Google
                </button>

                <button
                  type="button"
                  onClick={() => handle("github")}
                  disabled={busy !== null}
                  className="inline-flex items-center justify-center gap-3 px-5 py-3 rounded-2xl bg-white/[0.06] text-zinc-100 ring-1 ring-white/15 font-semibold text-sm hover:bg-white/[0.12] hover:ring-white/25 transition btn-press disabled:opacity-60"
                >
                  {busy === "github" ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <GithubMark />
                  )}
                  Continuar con GitHub
                </button>

                {error && (
                  <p className="text-center text-xs text-rose-400/90">{error}</p>
                )}

                <div className="flex items-center gap-3 py-1">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                    o
                  </span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-zinc-400 hover:text-zinc-200 ring-1 ring-white/10 hover:ring-white/20 bg-white/[0.02] hover:bg-white/[0.05] text-sm font-semibold transition btn-press"
                >
                  <UserRound className="w-4 h-4" />
                  Continuar como invitado
                </Link>
              </div>
            )}
          </div>
        </BorderGlow>
      </div>
    </div>
  );
}
