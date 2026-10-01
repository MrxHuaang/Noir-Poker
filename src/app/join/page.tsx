"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { NoirRoom } from "@/components/noir/NoirRoom";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

// A code can belong to either backend: online (server-backed) rooms first,
// then the legacy host-run normal/tournament rooms.
async function resolvePlayRoute(code: string): Promise<string | null> {
  const db = getDb();
  const onlineSnap = await getDoc(doc(db, "onlineRooms", code));
  if (onlineSnap.exists()) return `/play/online/${code}`;
  const normalSnap = await getDoc(doc(db, "normalRooms", code));
  if (normalSnap.exists()) return `/play/normal/${code}`;
  return null;
}

function JoinInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const codeFromUrl = sp.get("code")?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  const [code, setCode] = useState(codeFromUrl);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(!!codeFromUrl);
  // Firestore rules require a signed-in reader: resolve only once the
  // (anonymous or real) session exists.
  const { uid } = useAuth();
  useEffect(() => {
    if (!codeFromUrl || !uid) return;
    resolvePlayRoute(codeFromUrl)
      .then((route) => {
        if (route) {
          router.replace(route);
          return;
        }
        setError("No hay ninguna mesa con esa contraseña. Revísala.");
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
        setError("No hay ninguna mesa con esa contraseña. Revísala.");
      })
      .catch(() => setError("No se pudo verificar la sala. Inténtalo de nuevo."))
      .finally(() => setChecking(false));
  }

  return (
    <NoirRoom>
      <section className="plate grid w-[min(480px,92vw)] gap-4 px-8 pt-10 pb-8" aria-label="Entrar con contraseña">
        <p className="kick m-0">Toque tres veces</p>
        <h1 className="stencil m-0 text-[44px]">La contraseña</h1>
        <p className="m-0 text-[15px] text-[#dccfb1]">
          Escribe la que te pasaron. Te llevamos a la mesa, sea una partida abierta o un torneo.
        </p>
        <form onSubmit={submit} className="flex items-stretch" autoComplete="off">
          <label htmlFor="join-code" className="sr-only">
            Contraseña de la mesa
          </label>
          <input
            id="join-code"
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
              setError("");
            }}
            placeholder="Contraseña"
            maxLength={8}
            autoFocus
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={!!error}
            aria-describedby={error ? "join-code-error" : undefined}
            className="slot-input h-14 min-w-0 flex-1 px-4 font-pix text-2xl font-bold uppercase tracking-[.3em] placeholder:text-base placeholder:tracking-[.12em] placeholder:text-paper-mute"
          />
          <button type="submit" disabled={code.length < 4 || checking} className="tk tk-right disabled:opacity-50">
            {checking ? "Mirando…" : "Pasar"}
          </button>
        </form>
        {error ? (
          <p id="join-code-error" role="alert" className="scrap m-0 px-3 py-1.5 font-pix text-sm text-blood-500">
            {error}
          </p>
        ) : null}
        <p className="m-0 text-[14px] text-[#b9a684]">
          ¿Sin contraseña?{" "}
          <Link href="/jugar" className="text-paper underline underline-offset-4">
            Busca una mesa en el club
          </Link>
          .
        </p>
      </section>
    </NoirRoom>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 grid place-items-center bg-soot-900 font-pix text-sm tracking-[.14em] text-brass-200">
          MIRANDO POR LA MIRILLA
        </div>
      }
    >
      <JoinInner />
    </Suspense>
  );
}
