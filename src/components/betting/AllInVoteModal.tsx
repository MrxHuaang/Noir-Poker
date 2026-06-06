"use client";
import { Zap, X } from "lucide-react";
import type { NormalGameState } from "@/lib/betting";

type Props = {
  gameState: NormalGameState | null;
  selfUid: string | null;
  onVote: (n: number) => void;
  open?: boolean;
  onClose?: () => void;
};

export function AllInVoteModal({ gameState, selfUid, onVote, open = false, onClose }: Props) {
  if (!open) return null;
  if (!gameState || gameState.phase !== "all-in-negotiation") return null;
  const neg = gameState.allInNegotiation;
  if (!neg) return null;

  const myVote = selfUid ? neg.votes[selfUid] : null;
  const involved = neg.playerIds.includes(selfUid ?? "");
  const options = neg.options?.length ? neg.options : [1, 2, 3];
  const totalVoted = neg.playerIds.filter((id) => typeof neg.votes[id] === "number").length;
  const total = neg.playerIds.length;
  const equity = neg.equity ?? {};
  const seatsById = new Map(gameState.seats.map((s) => [s.id, s]));

  return (
    <div className="fixed right-3 top-1/2 z-[110] -translate-y-1/2 pointer-events-none">
      <div className="pointer-events-auto w-[min(300px,calc(100vw-1.5rem))] bg-zinc-900/95 backdrop-blur-xl rounded-2xl ring-1 ring-accent-400/40 shadow-[0_18px_70px_-24px_rgba(167,139,250,0.55)] p-3 flex flex-col gap-3 animate-in slide-in-from-right-4 fade-in duration-200 relative">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-2.5 right-2.5 p-1.5 rounded-full text-zinc-500 hover:text-zinc-100 hover:bg-white/10 transition"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-2 pr-8">
          <Zap className="w-4 h-4 text-accent-400" />
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-accent-300">
            All-in
          </span>
        </div>

        <h3 className="text-sm font-black text-white tracking-tight">
          Correr el board
        </h3>

        {Object.keys(equity).length > 0 && (
          <div className="grid gap-1.5">
            {neg.playerIds.map((id) => (
              <div key={id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate text-zinc-300">
                  {seatsById.get(id)?.name ?? id}
                </span>
                <span className="font-mono font-black tabular-nums text-accent-200">
                  {equity[id] ?? 0}%
                </span>
              </div>
            ))}
          </div>
        )}

        {involved ? (
          <div className="grid grid-cols-3 gap-1.5">
            {options.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onVote(n)}
                className={`h-12 rounded-xl flex flex-col items-center justify-center font-black transition btn-press ${
                  myVote === n
                    ? "bg-accent-700/80 text-accent-100 shadow-lg shadow-accent-700/30 ring-2 ring-accent-400"
                    : "bg-white/5 text-zinc-200 hover:bg-white/10 ring-1 ring-white/10"
                }`}
              >
                <span className="text-base">{n}x</span>
                <span className="text-[8px] uppercase tracking-widest opacity-70">
                  {n === 1 ? "Normal" : "Runs"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-xs text-zinc-400 text-center">
            Solo los jugadores all-in pueden votar
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-400 transition-all"
              style={{ width: `${total > 0 ? (totalVoted / total) * 100 : 0}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums font-bold text-zinc-500">
            {neg.agreedN ? `${neg.agreedN}x` : `${totalVoted}/${total}`}
          </span>
        </div>
      </div>
    </div>
  );
}
