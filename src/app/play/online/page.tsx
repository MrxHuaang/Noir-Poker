"use client";
import { DesktopOnlyGate } from "@/components/ui/DesktopOnlyGate";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Coins, LogIn, Users, Wifi } from "lucide-react";
import { ACCENT_GLOW_COLORS } from "@/lib/brand";
import { useAuth } from "@/hooks/useAuth";
import { callOnline, subscribeOpenOnlineRooms, type OnlineRoomSummary } from "@/lib/online/client";
import { formatChips } from "@/lib/betting";

export default function OnlineLandingPage() {
  return (
    <DesktopOnlyGate>
      <OnlineLandingPageInner />
    </DesktopOnlyGate>
  );
}

function OnlineLandingPageInner() {
  const router = useRouter();
  const { user, isGuest, getToken } = useAuth();
  const [casual, setCasual] = useState(false);
  const [sb, setSb] = useState(5);
  const [bb, setBb] = useState(10);
  const [stack, setStack] = useState(1000);
  const [runItN, setRunItN] = useState(1);
  const [blindLevelMins, setBlindLevelMins] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [rooms, setRooms] = useState<OnlineRoomSummary[]>([]);

  useEffect(() => {
    if (!user) return;
    return subscribeOpenOnlineRooms(setRooms);
  }, [user]);

  // El servidor genera el código, crea la sala y sienta al creador en la misma
  // llamada (buy-in incluido). Un invitado en mesa con fichas la crea igual y
  // entra observando: la mesa le ofrece iniciar sesión para sentarse.
  const create = async () => {
    setError(null);
    const token = await getToken();
    if (!token) {
      setError("Todavía conectando, intenta de nuevo");
      return;
    }
    setCreating(true);
    try {
      const { code } = await callOnline<{ code: string; sitError: string | null }>(token, "create", {
        config: {
          sb,
          bb,
          stack,
          runItN,
          casual,
          blindLevelSecs: blindLevelMins > 0 ? blindLevelMins * 60 : 0,
        },
        sit: casual || !isGuest,
      });
      router.push(`/play/online/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la sala");
      setCreating(false);
    }
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (/^[A-Z0-9]{4,8}$/.test(code)) router.push(`/play/online/${code}`);
    else setError("Código inválido");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
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
          <p className="text-sm text-zinc-300 leading-relaxed">
            Configura y crea tu sala. Comparte el código con tus jugadores.
          </p>
        </div>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-black/30 ring-1 ring-white/10">
          <button
            type="button"
            onClick={() => setCasual(false)}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition ${
              !casual
                ? "bg-accent-500/25 text-accent-100 ring-1 ring-accent-400/40 shadow-lg"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Coins className="w-4 h-4 shrink-0" />
            Con fichas
          </button>
          <button
            type="button"
            onClick={() => setCasual(true)}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition ${
              casual
                ? "bg-accent-500/25 text-accent-100 ring-1 ring-accent-400/40 shadow-lg"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            Casual
          </button>
        </div>

        {/* Mode description */}
        <p className="text-xs text-zinc-500 -mt-3 px-1 leading-relaxed">
          {casual
            ? "Sin monedas — el host elige los stacks, rebuys libres, cualquier jugador puede entrar sin cuenta."
            : "Las monedas reales de cada jugador se mueven en la mesa. Requiere cuenta registrada."}
        </p>

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
                  <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-black">
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
                <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-black">
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
                <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-black">
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
              disabled={creating}
              className="w-full px-4 py-3 rounded-2xl bg-accent-500/20 ring-1 ring-accent-400/40 text-accent-100 font-black text-sm tracking-wide hover:bg-accent-500/30 hover:ring-accent-400/60 transition btn-press disabled:opacity-60"
            >
              {creating ? "Creando mesa…" : `Crear mesa ${casual ? "casual" : "con fichas"}`}
            </button>
            {!casual && isGuest && (
              <p className="text-[11px] text-zinc-500 -mt-2">
                Como invitado entras observando: inicia sesión para sentarte con fichas.
              </p>
            )}
            {error && (
              <p role="alert" className="text-xs text-rose-300 -mt-2">
                {error}
              </p>
            )}
          </div>
        </BorderGlow>

        <form onSubmit={join} className="flex gap-2">
          <label className="sr-only" htmlFor="join-code">Código de sala</label>
          <input
            id="join-code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Código de sala"
            maxLength={8}
            autoComplete="off"
            className="flex-1 px-4 py-2.5 rounded-2xl bg-black/40 ring-1 ring-white/10 text-zinc-100 text-sm font-mono tracking-[0.3em] uppercase outline-none focus:ring-accent-500/40 transition placeholder:tracking-normal placeholder:font-sans placeholder:text-zinc-500"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-zinc-200 font-bold text-sm transition btn-press"
          >
            <LogIn className="w-4 h-4" /> Entrar
          </button>
        </form>

        {rooms.length > 0 && (
          <section className="flex flex-col gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 px-1">
              Mesas abiertas
            </span>
            {rooms.slice(0, 8).map((r) => (
              <button
                key={r.code}
                type="button"
                onClick={() => router.push(`/play/online/${r.code}`)}
                className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] ring-1 ring-white/[0.08] text-left transition btn-press"
              >
                <span className="font-mono font-black tracking-[0.25em] text-accent-300 text-sm">{r.code}</span>
                <span className="text-xs text-zinc-400 tabular-nums">
                  {formatChips(r.sb)}/{formatChips(r.bb)}
                </span>
                <span className="text-xs text-zinc-500">{r.casual ? "Casual" : "Con fichas"}</span>
                <span className="inline-flex items-center gap-1 text-xs text-zinc-300 tabular-nums">
                  <Users className="w-3.5 h-3.5" /> {r.players}
                </span>
              </button>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
