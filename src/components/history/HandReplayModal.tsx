"use client";
// Reproduce una mano guardada (normalRooms/{code}/hands) street-by-street:
// preflop -> flop -> turn -> river -> resultado, revelando el board con el flip
// de PlayingCard y mostrando ganadores/categoria/pot al final.
//
// Datos disponibles en HandRecord: community (ids), winners, category, pot,
// handNum, runIndex/runTotal. NO hay acciones por calle ni hole cards, asi que
// es un replay de resumen del board, no accion-por-accion.
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Play, Pause, X, Trophy } from "lucide-react";
import { cardFromId, type Card } from "@/lib/poker";
import { CATEGORY_LABEL } from "@/lib/handEval";
import { formatChips } from "@/lib/betting";
import type { HandRecord } from "@/lib/handHistory";
import type { CardBackId } from "@/lib/themes";
import { PlayingCard } from "@/components/cards/PlayingCard";

type Street = { label: string; count: number; result?: boolean };

export function HandReplayModal({
  hand,
  onClose,
  cardBack,
}: {
  hand: HandRecord;
  onClose: () => void;
  cardBack?: CardBackId;
}) {
  const cards = useMemo<Card[]>(
    () => (hand.community ?? []).map(cardFromId).filter(Boolean) as Card[],
    [hand.community],
  );

  const streets = useMemo<Street[]>(() => {
    const len = cards.length;
    const s: Street[] = [{ label: "Preflop", count: 0 }];
    if (len >= 3) s.push({ label: "Flop", count: 3 });
    if (len >= 4) s.push({ label: "Turn", count: 4 });
    if (len >= 5) s.push({ label: "River", count: 5 });
    s.push({ label: "Resultado", count: len, result: true });
    return s;
  }, [cards.length]);

  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = streets.length - 1;
  const current = streets[Math.min(step, last)];

  // Autoplay: avanza una calle cada 1.1 s y se detiene al llegar al resultado.
  // setTimeout re-armado por calle (no setInterval) + update funcional: no cascada.
  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => Math.min(s + 1, last)), 1100);
    return () => clearTimeout(t);
  }, [playing, step, last]);

  const visible = cards.slice(0, current.count);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-[min(540px,94vw)] rounded-3xl bg-zinc-950/95 ring-1 ring-white/10 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)] p-5 sm:p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest font-black text-zinc-500">
              Mano #{hand.handNum}
            </span>
            {hand.runTotal && hand.runTotal > 1 && (
              <span className="text-[10px] uppercase tracking-widest font-black text-accent-300">
                Corrida {(hand.runIndex ?? 0) + 1}/{hand.runTotal}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-center">
          <span className="text-xs uppercase tracking-[0.2em] font-black text-zinc-400">
            {current.label}
          </span>
        </div>

        <div className="flex items-center justify-center gap-1.5 sm:gap-2 min-h-[5.5rem]">
          {visible.length === 0 ? (
            <span className="text-zinc-600 text-sm">Sin cartas comunitarias</span>
          ) : (
            visible.map((c) => (
              <PlayingCard key={c.id} card={c} faceUp size="sm" cardBack={cardBack} />
            ))
          )}
        </div>

        {current.result && (
          <div className="flex flex-col gap-2 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.08] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest font-black text-zinc-500">
                Bote
              </span>
              <span className="text-sm tabular-nums text-zinc-100 font-black">
                {formatChips(hand.pot)}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Trophy className="w-4 h-4 text-accent-300 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-zinc-100 font-bold">
                {hand.winners.length > 0
                  ? hand.winners
                      .map((w) => `${w.name} +${formatChips(w.amount)}`)
                      .join(" · ")
                  : "Sin ganador registrado"}
              </span>
            </div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
              {CATEGORY_LABEL[hand.category] ?? "—"}
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setStep((s) => Math.max(0, s - 1));
            }}
            disabled={step === 0}
            aria-label="Anterior"
            className="p-2.5 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (step >= last) setStep(0);
              setPlaying((p) => !p);
            }}
            aria-label={playing ? "Pausar" : "Reproducir"}
            className="px-5 py-2.5 rounded-xl bg-accent-500/15 ring-1 ring-accent-400/40 text-accent-200 hover:bg-accent-500/25 transition inline-flex items-center gap-2 font-bold text-xs uppercase tracking-widest"
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {playing ? "Pausa" : step >= last ? "Repetir" : "Reproducir"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setStep((s) => Math.min(last, s + 1));
            }}
            disabled={step >= last}
            aria-label="Siguiente"
            className="p-2.5 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-1.5">
          {streets.map((s, i) => (
            <span
              key={s.label}
              className={`h-1 rounded-full transition-all ${
                i <= step ? "w-6 bg-accent-400/80" : "w-3 bg-white/10"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
