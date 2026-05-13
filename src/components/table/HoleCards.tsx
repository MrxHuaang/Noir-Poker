"use client";
import type { Seat } from "@/lib/poker";
import { PlayingCard } from "@/components/cards/PlayingCard";

export function HoleCards({
  seat,
  onToggle,
}: {
  seat: Seat;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="hole-cards group relative flex gap-1 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 rounded-xl p-1 -m-1"
      aria-label={seat.revealed ? "Ocultar cartas" : "Revelar cartas"}
    >
      <PlayingCard
        card={seat.hole[0]}
        faceUp={seat.revealed}
        size="sm"
        className="transition-transform group-hover:-translate-y-0.5 -rotate-6"
        flipDelay={0}
      />
      <PlayingCard
        card={seat.hole[1]}
        faceUp={seat.revealed}
        size="sm"
        className="transition-transform group-hover:-translate-y-0.5 rotate-6 -ml-3"
        flipDelay={0.08}
      />
    </button>
  );
}
