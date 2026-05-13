"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Smartphone } from "lucide-react";

function JoinInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [code, setCode] = useState("");

  useEffect(() => {
    const fromUrl = sp.get("code");
    if (fromUrl) router.replace(`/play/${fromUrl.toUpperCase()}`);
  }, [sp, router]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length < 4 || c.length > 6) return;
    router.push(`/play/${c}`);
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 py-16 flex flex-col items-center gap-6">
      <Smartphone className="w-10 h-10 text-zinc-400" />
      <h1 className="text-2xl tracking-tight text-zinc-100">Unirse a sala</h1>
      <p className="text-sm text-zinc-400 text-center">
        Ingresa el código que aparece en la pantalla grande.
      </p>
      <form onSubmit={submit} className="w-full flex flex-col gap-3">
        <input
          type="text"
          value={code}
          onChange={(e) =>
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
          }
          placeholder="ABCD2"
          maxLength={6}
          autoFocus
          className="w-full px-5 py-4 rounded-2xl bg-black/40 ring-1 ring-white/10 text-zinc-100 text-2xl text-center tracking-[0.4em] uppercase outline-none focus:ring-emerald-400/40"
        />
        <button
          type="submit"
          disabled={code.length < 4}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-500/90 hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed text-emerald-950 font-medium transition"
        >
          Entrar
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>
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
