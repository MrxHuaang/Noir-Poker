"use client";
import { useEffect, useRef } from "react";
import type { Card } from "@/lib/poker";
import { PlayingCard } from "@/components/cards/PlayingCard";
import type { CardFaceId } from "@/lib/themes";

export function CommunityRow({ community, cardFace }: { community: Card[]; cardFace?: CardFaceId }) {
  const prevLenRef = useRef(0);
  const prevLen = prevLenRef.current;

  useEffect(() => {
    prevLenRef.current = community.length;
  }, [community.length]);

  const slots: (Card | undefined)[] = Array.from(
    { length: 5 },
    (_, i) => community[i],
  );

  return (
    <div className="community flex gap-3 items-center justify-center">
      {slots.map((c, i) => {
        const isNew = c !== undefined && i >= prevLen;
        const dealDelay = isNew ? (i - prevLen) * 0.1 : 0;
        return (
          <div key={c ? c.id : `empty-${i}`} className="community-slot">
            {c ? (
              <PlayingCard
                card={c}
                faceUp={true}
                size="md"
                dealIn={isNew}
                dealDelay={dealDelay}
                flipDelay={isNew ? dealDelay : 0}
                cardFace={cardFace}
              />
            ) : (
              <div className="w-20 h-28 rounded-xl border border-dashed border-white/10 bg-white/[0.015]" />
            )}
          </div>
        );
      })}
    </div>
  );
}
