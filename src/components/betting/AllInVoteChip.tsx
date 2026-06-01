"use client";
import { Zap } from "lucide-react";
import type { NormalGameState } from "@/lib/betting";

type Props = {
  gameState: NormalGameState | null;
  selfUid: string | null;
  onClick: () => void;
};

// Floating side notification shown during all-in-negotiation when the modal is closed.
// Click → opens the vote modal.
export function AllInVoteChip({ gameState, selfUid, onClick }: Props) {
  if (!gameState || gameState.phase !== "all-in-negotiation") return null;
  const neg = gameState.allInNegotiation;
  if (!neg) return null;

  const involved = neg.playerIds.includes(selfUid ?? "");
  const myVote = selfUid ? neg.votes[selfUid] : null;
  const totalVoted = neg.playerIds.filter((id) => typeof neg.votes[id] === "number").length;
  const total = neg.playerIds.length;
  const pct = total > 0 ? (totalVoted / total) * 100 : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed top-1/2 right-3 -translate-y-1/2 z-[105] flex flex-col items-center gap-1 px-3 py-2.5 rounded-2xl bg-zinc-900/95 backdrop-blur-xl ring-2 ring-accent-400/40 shadow-[0_12px_40px_-12px_rgba(167,139,250,0.4)] hover:ring-accent-300/70 transition btn-press animate-in slide-in-from-right-4 fade-in duration-200"
      title="Votar número de runs"
    >
      <div className="flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-accent-400 animate-pulse" />
        <span className="text-[10px] font-black uppercase tracking-widest text-accent-200">
          All-in
        </span>
      </div>
      <span className="text-[9px] font-bold text-zinc-400 leading-none">
        {involved
          ? neg.agreedN != null
            ? `Runs: ${neg.agreedN}x`
            : myVote != null
              ? `Tu voto: ${myVote}x`
              : "Toca para votar"
          : "Esperando votos"}
      </span>
      <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden mt-0.5">
        <div className="h-full bg-accent-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] tabular-nums text-zinc-500 leading-none">
        {totalVoted}/{total}
      </span>
    </button>
  );
}
