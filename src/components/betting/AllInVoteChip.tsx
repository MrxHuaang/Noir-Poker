"use client";
import { Zap } from "lucide-react";
import type { NormalGameState } from "@/lib/betting";

type Props = {
  gameState: NormalGameState | null;
  selfUid: string | null;
  onClick: () => void;
  onVote?: (n: number) => void;
};

export function AllInVoteChip({ gameState, selfUid, onClick, onVote }: Props) {
  if (!gameState || gameState.phase !== "all-in-negotiation") return null;
  const neg = gameState.allInNegotiation;
  if (!neg) return null;

  const involved = neg.playerIds.includes(selfUid ?? "");
  const myVote = selfUid ? neg.votes[selfUid] : null;
  const totalVoted = neg.playerIds.filter((id) => typeof neg.votes[id] === "number").length;
  const total = neg.playerIds.length;
  const pct = total > 0 ? (totalVoted / total) * 100 : 0;
  const options = neg.options?.length ? neg.options : [1, 2, 3];
  const seatsById = new Map(gameState.seats.map((s) => [s.id, s]));

  return (
    <div className="fixed top-1/2 right-3 -translate-y-1/2 z-[105] w-[min(260px,calc(100vw-1.5rem))] rounded-2xl bg-zinc-900/95 backdrop-blur-xl ring-1 ring-accent-400/35 shadow-[0_12px_40px_-12px_rgba(167,139,250,0.4)] animate-in slide-in-from-right-4 fade-in duration-200">
      <button
        type="button"
        onClick={onClick}
        className="w-full flex flex-col items-stretch gap-2 px-3 py-2.5 text-left hover:bg-white/[0.03] transition rounded-2xl"
        title="Opciones all-in"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-accent-400 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-accent-200">
              All-in
            </span>
          </span>
          <span className="text-[9px] tabular-nums text-zinc-500 leading-none">
            {totalVoted}/{total}
          </span>
        </div>

        <div className="grid gap-1">
          {neg.playerIds.map((id) => (
            <div key={id} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="min-w-0 truncate text-zinc-400">
                {seatsById.get(id)?.name ?? id}
              </span>
              <span className="font-mono font-black tabular-nums text-accent-200">
                {neg.equity?.[id] ?? 0}%
              </span>
            </div>
          ))}
        </div>

        <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-accent-400 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </button>

      {involved && onVote && (
        <div className="grid grid-cols-3 gap-1.5 px-3 pb-3">
          {options.map((n) => (
            <button
              key={n}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onVote(n);
              }}
              className={`h-8 rounded-lg text-[10px] font-black uppercase tracking-widest transition btn-press ${
                myVote === n
                  ? "bg-accent-700/80 text-accent-100 ring-1 ring-accent-300"
                  : "bg-white/5 text-zinc-300 hover:bg-white/10 ring-1 ring-white/10"
              }`}
            >
              {n}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
