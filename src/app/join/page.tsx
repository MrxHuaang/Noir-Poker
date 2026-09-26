"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowRight, Loader2 } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

// A code can belong to any of the three backends. Online (server-backed)
// rooms are checked first, then the legacy normal/tournament rooms, then the
// presencial rooms.
async function resolvePlayRoute(code: string): Promise<string | null> {
  const db = getDb();
  const onlineSnap = await getDoc(doc(db, "onlineRooms", code));
  if (onlineSnap.exists()) return `/play/online/${code}`;
  const normalSnap = await getDoc(doc(db, "normalRooms", code));
  if (normalSnap.exists()) return `/play/normal/${code}`;
  const presencialSnap = await getDoc(doc(db, "rooms", code));
  if (presencialSnap.exists()) return `/play/${code}`;
  return null;
}

function JoinInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const codeFromUrl = sp.get("code")?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  const [code, setCode] = useState(codeFromUrl);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(!!codeFromUrl);
  const scope = useRef<HTMLDivElement>(null);
  // Firestore rules require a signed-in reader: resolve only once the
  // (anonymous or real) session exists.
  const { uid } = useAuth();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".rise", {
          opacity: 0,
          y: 16,
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.07,
          clearProps: "all",
        });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [] },
  );

  useEffect(() => {
    if (!codeFromUrl || !uid) return;
    resolvePlayRoute(codeFromUrl)
      .then((route) => {
        if (route) {
          router.replace(route);
          return;
        }
        setError("Sala no encontrada. Revisa el código e inténtalo de nuevo.");
      })
      .catch(() => setError("No se pudo verificar la sala. Inténtalo de nuevo."))
      .finally(() => setChecking(false));
  }, [codeFromUrl, router, uid]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    setError("");
    if (c.length < 4 || c.length > 8) return;
    if (!uid) {
      setError("Conectando, inténtalo en un momento.");
      return;
    }
    setChecking(true);
    resolvePlayRoute(c)
      .then((route) => {
        if (route) {
          router.push(route);
          return;
        }
        setError("Sala no encontrada. Revisa el código e inténtalo de nuevo.");
      })
      .catch(() => setError("No se pudo verificar la sala. Inténtalo de nuevo."))
      .finally(() => setChecking(false));
  }

  return (
    <div ref={scope} className="relative z-[2] mx-auto w-full max-w-6xl px-5 pt-14 pb-24 sm:px-8 sm:pt-20">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-start lg:gap-8">
        <header className="lg:col-span-6">
          <p className="rise eyebrow mb-5 flex items-center gap-2">
            <span className="suit suit-red text-sm" aria-hidden>
              ♥
            </span>
            Unirse a una sala
          </p>
          <h1 className="rise display text-5xl text-primary sm:text-6xl">
            Entra con <em className="text-accent-200">el código</em>.
          </h1>
          <p className="rise mt-5 max-w-[44ch] text-[15px] leading-relaxed text-secondary">
            Escribe el código que te compartieron. Te llevamos a la mesa correcta, sea presencial,
            online o de torneo.
          </p>
        </header>

        <div className="rise lg:col-span-5 lg:col-start-8">
          <form onSubmit={submit} className="sheet p-5 sm:p-7">
            <label htmlFor="join-code" className="eyebrow">
              Código de sala
            </label>
            <input
              id="join-code"
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                setError("");
              }}
              placeholder="Escríbelo aquí"
              maxLength={6}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={!!error}
              aria-describedby={error ? "join-code-error" : undefined}
              className={`field numeric mt-2 h-16! text-center text-3xl! uppercase tracking-[0.3em] indent-[0.3em] placeholder:font-sans placeholder:text-base placeholder:normal-case placeholder:tracking-normal ${
                error ? "border-rose-400/70!" : ""
              }`}
            />
            {error ? (
              <p id="join-code-error" role="alert" className="mt-3 text-sm text-rose-300">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={code.length < 4 || checking}
              className="btn-primary mt-5 w-full"
            >
              {checking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verificando…
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-5 text-sm leading-relaxed text-muted">
            ¿Sin código?{" "}
            <Link href="/lobby" className="btn-link">
              Mira las mesas abiertas
            </Link>{" "}
            o{" "}
            <Link href="/jugar" className="btn-link">
              abre la tuya
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl px-5 pt-14 sm:px-8 sm:pt-20">
          <p className="eyebrow">Cargando…</p>
        </div>
      }
    >
      <JoinInner />
    </Suspense>
  );
}
