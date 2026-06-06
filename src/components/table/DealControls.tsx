"use client";
import { Crown, Flame, Play, RotateCcw, Shuffle } from "lucide-react";
import type { Street } from "@/lib/poker";

export function DealControls({
  street,
  canAdvance,
  canShowdown,
  canAllIn,
  onAdvance,
  onShowdown,
  onAllIn,
  onReshuffle,
  onReset,
}: {
  street: Street;
  canAdvance: boolean;
  canShowdown: boolean;
  canAllIn: boolean;
  onAdvance: () => void;
  onShowdown: () => void;
  onAllIn: () => void;
  onReshuffle: () => void;
  onReset: () => void;
}) {
  const nextLabel =
    street === "preflop"
      ? "Flop"
      : street === "flop"
        ? "Turn"
        : street === "turn"
          ? "River"
          : "Completo";

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {canAdvance ? (
        <button
          type="button"
          onClick={onAdvance}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/85 hover:bg-accent text-accent-contrast font-medium text-sm transition"
        >
          <Play className="w-4 h-4" />
          {nextLabel}
        </button>
      ) : null}
      {canAllIn ? (
        <button
          type="button"
          onClick={onAllIn}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/90 hover:bg-rose-400 text-rose-950 font-medium text-sm transition"
        >
          <Flame className="w-4 h-4" />
          All-in
        </button>
      ) : null}
      {canShowdown ? (
        <button
          type="button"
          onClick={onShowdown}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent hover:bg-accent/90 text-accent-contrast font-medium text-sm transition shadow-[0_10px_30px_-10px_var(--shadow-warm)]"
        >
          <Crown className="w-4 h-4" />
          Mostrar ganador
        </button>
      ) : null}
      <button
        type="button"
        onClick={onReshuffle}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-900/50 hover:bg-violet-800/60 ring-1 ring-violet-400/30 text-violet-200 hover:text-violet-100 text-sm transition"
      >
        <Shuffle className="w-4 h-4" />
        Repartir
      </button>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-transparent hover:bg-white/5 ring-1 ring-white/10 text-zinc-300 text-sm transition"
      >
        <RotateCcw className="w-4 h-4" />
        Cambiar jugadores
      </button>
    </div>
  );
}
