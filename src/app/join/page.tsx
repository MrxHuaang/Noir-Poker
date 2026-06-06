"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Smartphone } from "lucide-react";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { ACCENT_GLOW_COLORS, ACCENT_GLOW_HSL } from "@/lib/brand";
import { doc, getDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";

async function resolvePlayRoute(code: string): Promise<string | null> {
  const db = getDb();
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

  useEffect(() => {
    if (!codeFromUrl) return;
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
  }, [codeFromUrl, router]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    setError("");
    if (c.length < 4 || c.length > 6) return;
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
    <div className="w-full max-w-md mx-auto px-4 py-16 flex flex-col items-center gap-6">
      <Smartphone className="w-10 h-10 text-zinc-400" />
      <h1 className="text-2xl tracking-tight text-zinc-100">Unirse a sala</h1>
      <p className="text-sm text-muted text-center">
        Ingresa el código de sala que te compartieron.
      </p>
      <BorderGlow
        className="w-full lg-blur"
        edgeSensitivity={26}
        glowColor={ACCENT_GLOW_HSL}
        backgroundColor="var(--lg-bg)"
        borderRadius={22}
        glowRadius={32}
        glowIntensity={1}
        coneSpread={24}
        animated={false}
        colors={ACCENT_GLOW_COLORS}
        fillOpacity={0.48}
      >
        <form onSubmit={submit} className="flex w-full flex-col gap-3 p-5">
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
              setError("");
            }}
            placeholder="CÓDIGO"
            maxLength={6}
            autoFocus
            aria-invalid={!!error}
            aria-describedby={error ? "join-code-error" : undefined}
            className={`w-full rounded-2xl bg-black/45 px-5 py-4 text-center text-2xl uppercase tracking-[0.4em] text-zinc-100 outline-none ring-1 focus:ring-accent-500/40 ${
              error ? "ring-rose-400/70" : "ring-white/10"
            }`}
          />
          {error ? (
            <p id="join-code-error" className="text-sm text-rose-300 text-center">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={code.length < 4 || checking}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-accent-700/70 px-5 py-3 font-medium text-accent-100 transition hover:bg-accent-600/75 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-400 disabled:ring-1 disabled:ring-white/10"
          >
            {checking ? "Verificando..." : "Entrar"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </BorderGlow>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="text-center py-10 text-zinc-500 text-sm">Cargando…</div>}>
      <JoinInner />
    </Suspense>
  );
}
