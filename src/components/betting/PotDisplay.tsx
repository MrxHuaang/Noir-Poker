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
      <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        Bote
      </span>
      <span className="text-2xl font-semibold text-amber-200 tabular-nums">
        {formatChips(pot)}
      </span>
      {sidePots.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {sidePots.map((sp, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 ring-1 ring-white/10 text-zinc-400 tabular-nums"
            >
              Bote {i + 1}: {formatChips(sp.amount)}
            </span>
          ))}
        </div>
      )}
      {currentBet > 0 && (
        <span className="text-[11px] text-zinc-500">
          Apuesta actual: {formatChips(currentBet)}
        </span>
      )}
    </div>
  );
}
