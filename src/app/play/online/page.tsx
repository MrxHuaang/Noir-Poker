"use client";
// Entry to the server-backed online mode: create a fresh room code or join one.
// Also lists rooms currently open on the Go server (polled every 5 s).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Users } from "lucide-react";
import { useOnlineRooms } from "@/hooks/useOnlineRooms";

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
  const [runItN, setRunItN] = useState(1);
  const [blindLevelMins, setBlindLevelMins] = useState(0);
  const rooms = useOnlineRooms();

  const create = () => {
    const q = new URLSearchParams({
      sb: String(sb), bb: String(bb), stack: String(stack),
      runItN: String(runItN),
      ...(blindLevelMins > 0 ? { blindLevelSecs: String(blindLevelMins * 60) } : {}),
    });
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

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Run it</span>
            <select
              value={runItN}
              onChange={(e) => setRunItN(Number(e.target.value))}
              className="px-2 py-1.5 rounded-lg bg-black/40 ring-1 ring-white/10 text-zinc-100 text-sm outline-none focus:ring-accent-500/40"
            >
              <option value={1}>1× (normal)</option>
              <option value={2}>2× (run-it-twice)</option>
              <option value={3}>3× (run-it-three)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Subir ciegas</span>
            <select
              value={blindLevelMins}
              onChange={(e) => setBlindLevelMins(Number(e.target.value))}
              className="px-2 py-1.5 rounded-lg bg-black/40 ring-1 ring-white/10 text-zinc-100 text-sm outline-none focus:ring-accent-500/40"
            >
              <option value={0}>Desactivado</option>
              <option value={5}>Cada 5 min</option>
              <option value={10}>Cada 10 min</option>
              <option value={15}>Cada 15 min</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={create}
          className="px-4 py-2.5 rounded-xl bg-accent-500/20 ring-1 ring-accent-400/40 text-accent-100 font-bold text-sm"
        >
          Crear mesa
        </button>

        {rooms.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] uppercase tracking-widest text-zinc-600">salas abiertas</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="flex flex-col gap-1.5">
              {rooms.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => router.push(`/play/online/${r.code}`)}
                  className="flex items-center justify-between px-3 py-2 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] hover:bg-accent-500/10 hover:ring-accent-400/30 transition text-left"
                >
                  <span className="text-sm font-bold text-zinc-100 tracking-widest">{r.code}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                    <Users className="w-3 h-3" />
                    {r.players}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

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
