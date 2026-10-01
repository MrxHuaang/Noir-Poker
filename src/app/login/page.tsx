"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { NoirRoom } from "@/components/noir/NoirRoom";
import { useAuth } from "@/hooks/useAuth";

// Solo rutas internas. Un prefijo "/" no basta: "/%09/evil.example" o
// "/\evil.example" pasan ese chequeo y el parser de URL los resuelve a otro
// origen (open redirect). Se resuelve contra el origen propio y se exige que
// siga siendo el mismo.
function safeNext(raw: string | null): string {
  const fallback = "/jugar";
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
    <NoirRoom back={{ href: "/", label: "Volver a la puerta" }}>
      <section className="plate grid w-[min(460px,92vw)] gap-4 px-8 pt-10 pb-8" aria-label="Iniciar sesión">
        <p className="kick m-0">La mirilla se abre</p>
        <h1 className="stencil m-0 text-[44px]">¿Quién llama?</h1>
        {alreadyLoggedIn ? (
          <>
            <p className="m-0 text-[15px] text-[#dccfb1]">Ya estás dentro. La casa te recuerda.</p>
            <Link href={next} className="tk tk-red w-fit">
              Seguir
            </Link>
          </>
        ) : (
          <>
            <p className="m-0 text-[15px] text-[#dccfb1]">
              Entra con tu cuenta y la mesa te recuerda: tus fichas, tu rango y tu personaje. Lo que jugaste como invitado se
              conserva.
            </p>
            <button type="button" onClick={handle} disabled={busy} aria-busy={busy} className="tk">
              {busy ? "Abriendo la puerta…" : "Continuar con Google"}
            </button>
            {shownError && (
              <p role="alert" className="scrap m-0 px-3 py-1.5 font-pix text-sm text-blood-500">
                {shownError}
              </p>
            )}
            <div className="flex items-center gap-2.5 text-[13px] text-[#b9a684] before:h-px before:flex-1 before:bg-brass-200/30 after:h-px after:flex-1 after:bg-brass-200/30">
              o bien
            </div>
            <Link href={rawNext ? next : "/jugar"} className="btn-brass">
              Entrar como invitado
            </Link>
            <p className="m-0 text-[13px] text-[#b9a684]">Los invitados solo juegan mesas sin fichas.</p>
          </>
        )}
      </section>
    </NoirRoom>
  );
}
