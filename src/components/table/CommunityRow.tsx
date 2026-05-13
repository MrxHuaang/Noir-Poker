"use client";
import type { Card } from "@/lib/poker";
import { PlayingCard } from "@/components/cards/PlayingCard";

export function CommunityRow({ community }: { community: Card[] }) {
  const slots: (Card | undefined)[] = Array.from(
    { length: 5 },
    (_, i) => community[i],
  );
  return (
    <div className="community flex gap-3 items-center justify-center">
      {slots.map((c, i) => (
        <div key={i} className="community-slot">
          {c ? (
            <PlayingCard
              card={c}
              faceUp={true}
              size="md"
              flipDelay={i < 3 ? i * 0.12 : 0}
            />
          ) : (
            <div className="w-20 h-28 rounded-xl border border-dashed border-white/10 bg-white/[0.015]" />
          )}
        </div>
      ))}
    </div>
  );
}
