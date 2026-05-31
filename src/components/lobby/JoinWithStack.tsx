"use client";
import { useState } from "react";
import { AlertCircle, ArrowRight, Loader2, Shuffle } from "lucide-react";
import { Avatar } from "@/components/players/Avatar";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { randomSeed } from "@/lib/dicebear";

type Props = {
  defaultName?: string;
  suggestedStack?: number;
  mode?: "join" | "rebuy";
  locked?: boolean;
  // When true (join flow): show avatar picker + BorderGlow + room code header.
  showAvatar?: boolean;
  roomCode?: string;
  onSubmit: (name: string, stack: number, seed: string) => Promise<void>;
};

export function JoinWithStack({
  defaultName = "",
  suggestedStack = 1000,
  mode = "join",
  locked = false,
  showAvatar = false,
  roomCode,
  onSubmit,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [stack, setStack] = useState(suggestedStack);
  const [seed, setSeed] = useState(() => randomSeed());
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const nameError = submitted && !name.trim();
  const stackError = submitted && stack <= 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim() || stack <= 0 || locked) return;
    setLoading(true);
    try {
      await onSubmit(name.trim(), stack, seed);
    } finally {
      setLoading(false);
    }
  }

  const isRebuy = mode === "rebuy";

  const fields = (
    <div className="flex flex-col gap-4">
      {/* Avatar picker — only in join mode with showAvatar */}
      {showAvatar && !isRebuy && (
        <div className="flex flex-col items-center gap-3 pt-1">
          <Avatar seed={seed} size={100} />
          <button
            type="button"
            onClick={() => setSeed(randomSeed())}
            className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-xs text-zinc-200 ring-1 ring-white/10 transition hover:bg-white/10 btn-press"
          >
            <Shuffle className="w-3.5 h-3.5" />
            Otro avatar
          </button>
        </div>
      )}

      {!isRebuy && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">Tu nombre</span>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); }}
            placeholder="Apodo o nombre"
            maxLength={20}
            autoFocus={!isRebuy}
            disabled={loading || locked}
            className={`px-4 py-3 rounded-2xl bg-black/40 ring-1 text-zinc-100 text-center text-lg outline-none disabled:opacity-40 ${nameError ? "ring-rose-400/60" : "ring-white/10 focus:ring-amber-500/40"}`}
          />
          {nameError && (
            <span className="flex items-center gap-1 text-[11px] text-rose-400">
              <AlertCircle className="w-3 h-3 flex-shrink-0" /> El nombre es requerido
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">
          {isRebuy ? "Cantidad de fichas" : "Stack de entrada"}
        </span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={stack === 0 ? "" : stack}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, "");
              setStack(val === "" ? 0 : Number(val));
            }}
            disabled={loading || locked}
            className="flex-1 px-4 py-3 rounded-2xl bg-black/40 ring-1 ring-white/10 text-zinc-100 text-center text-lg outline-none focus:ring-amber-500/40 tabular-nums disabled:opacity-40"
            placeholder="Fichas…"
          />
          {suggestedStack > 0 && (
            <button
              type="button"
              onClick={() => setStack(suggestedStack)}
              className="px-3 py-3 rounded-2xl text-xs text-zinc-400 glass ring-1 ring-white/8 hover:bg-white/10 transition"
            >
              ×1
            </button>
          )}
        </div>
        {stackError && (
          <span className="flex items-center gap-1 text-[11px] text-rose-400">
            <AlertCircle className="w-3 h-3 flex-shrink-0" /> Ingresa un monto mayor a 0
          </span>
        )}
        {!showAvatar && (
          <p className="text-[11px] text-zinc-600">
            El dueño puede ajustar el monto antes de aceptar.
          </p>
        )}
      </div>

      {locked && !isRebuy && (
        <p className="text-xs text-rose-300 text-center">
          Mesa cerrada · No se aceptan nuevos jugadores.
        </p>
      )}

      <button
        type="submit"
        disabled={!name.trim() || stack <= 0 || loading || locked}
        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-amber-700/70 hover:bg-amber-600/75 disabled:opacity-30 text-amber-100 font-medium btn-press transition"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            {isRebuy ? "Solicitar" : "Entrar a la mesa"}
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  );

  // Full presencial-style layout when showAvatar = true
  if (showAvatar && !isRebuy) {
    return (
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md mx-auto px-4 py-10 flex flex-col gap-6"
      >
        {roomCode && (
          <header className="text-center">
            <h1 className="text-xl text-zinc-100">Sala {roomCode}</h1>
            <p className="text-sm text-zinc-400 mt-1">Elige tu apodo y avatar.</p>
          </header>
        )}
        <BorderGlow
          className="w-full"
          edgeSensitivity={26}
          glowColor="152 68 48"
          backgroundColor="rgba(8, 10, 16, 0.9)"
          borderRadius={20}
          glowRadius={30}
          glowIntensity={1}
          coneSpread={24}
          animated={false}
          colors={["#34d399", "#38bdf8", "#c4b5fd"]}
          fillOpacity={0.45}
        >
          <div className="p-5">{fields}</div>
        </BorderGlow>
      </form>
    );
  }

  // Compact layout for rebuy / simple embed
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 rounded-2xl glass">
      {!isRebuy && (
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-zinc-100">Unirse a la sala</h2>
        </div>
      )}
      {fields}
    </form>
  );
}
