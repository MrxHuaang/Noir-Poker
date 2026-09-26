"use client";
import { formatChips } from "@/lib/betting";
import type { SidePot } from "@/lib/betting";

export function PotDisplay({
  pot,
  sidePots,
  currentBet,
}: {
  pot: number;
  sidePots: SidePot[];
  currentBet: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="eyebrow text-[11px]">
        Bote
      </span>
      <span className="text-2xl font-semibold text-accent-200 tabular-nums">
        {formatChips(pot)}
      </span>
      {sidePots.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {sidePots.map((sp, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 rounded-full bg-bone/[0.04] ring-1 ring-line text-secondary tabular-nums"
            >
              Bote {i + 1}: {formatChips(sp.amount)}
            </span>
          ))}
        </div>
      )}
      {currentBet > 0 && (
        <span className="text-[11px] text-muted">
          Apuesta actual: {formatChips(currentBet)}
        </span>
      )}
    </div>
  );
}
