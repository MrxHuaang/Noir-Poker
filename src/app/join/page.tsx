"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Smartphone } from "lucide-react";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { doc, getDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";

async function resolvePlayRoute(code: string): Promise<string> {
  const db = getDb();
  const snap = await getDoc(doc(db, "normalRooms", code));
  if (snap.exists()) return `/play/normal/${code}`;
  return `/play/${code}`;
}

function JoinInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [code, setCode] = useState("");

  useEffect(() => {
    const fromUrl = sp.get("code");
    if (!fromUrl) return;
    const c = fromUrl.toUpperCase();
    resolvePlayRoute(c).then((route) => router.replace(route)).catch(() => router.replace(`/play/${c}`));
  }, [sp, router]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length < 4 || c.length > 6) return;
    resolvePlayRoute(c).then((route) => router.push(route)).catch(() => router.push(`/play/${c}`));
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 py-16 flex flex-col items-center gap-6">
      <Smartphone className="w-10 h-10 text-zinc-400" />
      <h1 className="text-2xl tracking-tight text-zinc-100">Unirse a sala</h1>
      <p className="text-sm text-zinc-400 text-center">
        Ingresa el código que aparece en la pantalla grande.
      </p>
      <BorderGlow
        className="w-full"
        edgeSensitivity={26}
        glowColor="152 70 46"
        backgroundColor="rgba(10, 12, 18, 0.92)"
        borderRadius={22}
        glowRadius={32}
        glowIntensity={1}
        coneSpread={24}
        animated={false}
        colors={["#34d399", "#38bdf8", "#a78bfa"]}
        fillOpacity={0.48}
      >
        <form onSubmit={submit} className="flex w-full flex-col gap-3 p-5">
          <input
            type="text"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
            }
            placeholder="ABCD2"
            maxLength={6}
            autoFocus
            className="w-full rounded-2xl bg-black/45 px-5 py-4 text-center text-2xl uppercase tracking-[0.4em] text-zinc-100 outline-none ring-1 ring-white/10 focus:ring-amber-500/40"
          />
          <button
            type="submit"
            disabled={code.length < 4}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-700/70 px-5 py-3 font-medium text-amber-100 transition hover:bg-amber-600/75 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Entrar
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
