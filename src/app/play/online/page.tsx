"use client";
// Entry to the server-backed online mode: create a fresh room code or join one.
import { useRouter } from "next/navigation";
import { useState } from "react";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 (ambiguous)

function genCode(): string {
  const a = new Uint32Array(5);
  crypto.getRandomValues(a);
  let c = "";
  for (let i = 0; i < 5; i++) c += ALPHABET[a[i] % ALPHABET.length];
  return c;
}

export default function OnlineLandingPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [sb, setSb] = useState(5);
  const [bb, setBb] = useState(10);
  const [stack, setStack] = useState(1000);

  const create = () => {
    const q = new URLSearchParams({ sb: String(sb), bb: String(bb), stack: String(stack) });
    router.push(`/play/online/${genCode()}?${q.toString()}`);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-[min(420px,92vw)] flex flex-col gap-4 rounded-3xl bg-zinc-950/80 ring-1 ring-white/10 p-6">
        <div>
          <h1 className="text-lg font-black text-zinc-100">Mesa online</h1>
          <p className="text-xs text-zinc-500 mt-1">
            Cash game en el servidor autoritativo. Comparte el código con tus
            amigos para que entren a la misma mesa.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {([
            ["Ciega chica", sb, setSb],
            ["Ciega grande", bb, setBb],
            ["Stack", stack, setStack],
          ] as const).map(([label, val, set]) => (
            <label key={label} className="flex flex-col gap-1">
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">{label}</span>
              <input
                type="number"
                value={val}
                onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))}
                className="px-2 py-1.5 rounded-lg bg-black/40 ring-1 ring-white/10 text-zinc-100 text-sm tabular-nums outline-none focus:ring-accent-500/40"
              />
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={create}
          className="px-4 py-2.5 rounded-xl bg-accent-500/20 ring-1 ring-accent-400/40 text-accent-100 font-bold text-sm"
        >
          Crear mesa
        </button>

        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] uppercase tracking-widest text-zinc-600">o unirse</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) router.push(`/play/online/${code.trim().toUpperCase()}`);
          }}
          className="flex gap-2"
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Código"
            className="flex-1 px-3 py-2 rounded-xl bg-black/40 ring-1 ring-white/10 text-zinc-100 text-sm outline-none focus:ring-accent-500/40 uppercase tracking-widest"
          />
          <button
            type="submit"
            disabled={!code.trim()}
            className="px-4 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-200 font-bold text-sm disabled:opacity-40"
          >
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
