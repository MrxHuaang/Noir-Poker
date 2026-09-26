"use client";
import type { Card } from "@/lib/poker";
import { bestHand, categoryLabel } from "@/lib/handEval";

export function HandLabel({
  hole,
  community,
}: {
  hole: [Card, Card];
  community: Card[];
}) {
  const total = community.length + 2;
  if (total < 5) return null;
  const score = bestHand([...hole, ...community]);
  return (
    <span className="eyebrow text-[11px]">
      {categoryLabel(score)}
    </span>
  );
}
