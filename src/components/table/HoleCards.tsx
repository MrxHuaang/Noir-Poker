"use client";
import type { Seat } from "@/lib/poker";
import { PlayingCard } from "@/components/cards/PlayingCard";
import type { CardBackId, CardFaceId } from "@/lib/themes";

export function HoleCards({
  seat,
  onToggle,
  cardBack,
  cardFace,
}: {
  seat: Seat;
  onToggle: () => void;
  cardBack?: CardBackId;
  cardFace?: CardFaceId;
}) {
  const anyRevealed = seat.revealedCards[0] || seat.revealedCards[1];
  return (
    <button
      type="button"
      onClick={onToggle}
      className="hole-cards group relative flex gap-1 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 rounded-xl p-1 -m-1"
      aria-label={anyRevealed ? "Ocultar cartas" : "Revelar cartas"}
    >
      <PlayingCard
        card={seat.hole[0]}
        faceUp={seat.revealedCards[0]}
        size="sm"
        className="transition-transform group-hover:-translate-y-0.5 -rotate-6"
        flipDelay={0}
        cardBack={cardBack}
        cardFace={cardFace}
      />
      <PlayingCard
        card={seat.hole[1]}
        faceUp={seat.revealedCards[1]}
        size="sm"
        className="transition-transform group-hover:-translate-y-0.5 rotate-6 -ml-3"
        flipDelay={0.08}
        cardBack={cardBack}
        cardFace={cardFace}
      />
    </button>
  );
}
