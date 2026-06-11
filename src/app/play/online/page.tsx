"use client";
import { DesktopOnlyGate } from "@/components/ui/DesktopOnlyGate";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wifi } from "lucide-react";
import { ACCENT_GLOW_COLORS } from "@/lib/brand";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function genCode(): string {
  const a = new Uint32Array(5);
  crypto.getRandomValues(a);
  let c = "";
  for (let i = 0; i < 5; i++) c += ALPHABET[a[i] % ALPHABET.length];
  return c;
}

export default function OnlineLandingPage() {
  return (
    <DesktopOnlyGate>
      <OnlineLandingPageInner />
    </DesktopOnlyGate>
  );
}

function OnlineLandingPageInner() {
  const router = useRouter();
  const [sb, setSb] = useState(5);
  const [bb, setBb] = useState(10);
  const [stack, setStack] = useState(1000);
  const [runItN, setRunItN] = useState(1);
  const [blindLevelMins, setBlindLevelMins] = useState(0);

  const create = () => {
    const q = new URLSearchParams({
      sb: String(sb),
      bb: String(bb),
      stack: String(stack),
      runItN: String(runItN),
      ...(blindLevelMins > 0 ? { blindLevelSecs: String(blindLevelMins * 60) } : {}),
    });
    router.push(`/play/online/${genCode()}?${q.toString()}`);
  };

  return (
    <main className="relative z-[2] min-h-screen flex items-center justify-center p-6">
      <div className="w-[min(460px,94vw)] flex flex-col gap-6">
        <div className="flex flex-col gap-1 px-1">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="p-2 rounded-xl bg-accent-500/15 ring-1 ring-accent-400/25">
              <Wifi className="w-4 h-4 text-accent-300" />
            </span>
            <span className="text-[9px] uppercase tracking-[0.3em] text-accent-400 font-black">
              Modo online
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-100">
            Nueva mesa
          </h1>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Configura y crea tu sala. Comparte el código con tus jugadores.
          </p>
        </div>

        <BorderGlow
          className="w-full lg-blur"
          glowColor="290 60 70"
          colors={ACCENT_GLOW_COLORS}
          backgroundColor="rgba(9,7,16,0.72)"
          borderRadius={24}
          glowRadius={36}
          glowIntensity={0.9}
          coneSpread={28}
          fillOpacity={0.38}
        >
          <div className="flex flex-col gap-5 p-6">
            <div className="grid grid-cols-3 gap-3">
              {([
                ["Ciega chica", sb, setSb],
                ["Ciega grande", bb, setBb],
                ["Stack inicial", stack, setStack],
              ] as const).map(([label, val, set]) => (
                <label key={label} className="flex flex-col gap-1.5">
                  <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">
                    {label}
                  </span>
                  <input
                    type="number"
                    value={val}
                    onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))}
                    className="px-3 py-2 rounded-xl bg-black/50 ring-1 ring-white/10 text-zinc-100 text-sm tabular-nums outline-none focus:ring-accent-500/40 transition"
                  />
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">
                  Run it
                </span>
                <select
                  value={runItN}
                  onChange={(e) => setRunItN(Number(e.target.value))}
                  className="px-3 py-2 rounded-xl bg-black/50 ring-1 ring-white/10 text-zinc-100 text-sm outline-none focus:ring-accent-500/40 transition"
                >
                  <option value={1}>1× (normal)</option>
                  <option value={2}>2× (run-it-twice)</option>
                  <option value={3}>3× (run-it-three)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">
                  Subir ciegas
                </span>
                <select
                  value={blindLevelMins}
                  onChange={(e) => setBlindLevelMins(Number(e.target.value))}
                  className="px-3 py-2 rounded-xl bg-black/50 ring-1 ring-white/10 text-zinc-100 text-sm outline-none focus:ring-accent-500/40 transition"
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
              className="w-full px-4 py-3 rounded-2xl bg-accent-500/20 ring-1 ring-accent-400/40 text-accent-100 font-black text-sm tracking-wide hover:bg-accent-500/30 hover:ring-accent-400/60 transition btn-press"
            >
              Crear mesa
            </button>
          </div>
        </BorderGlow>

        <p className="text-center text-xs text-zinc-600 px-1">
          Para unirte a una sala existente, ve al{" "}
          <a href="/lobby" className="text-zinc-400 hover:text-zinc-200 transition underline underline-offset-2">
            lobby
          </a>
          {" "}o introduce el código directamente en la URL.
        </p>
      </div>
    </main>
  );
}
