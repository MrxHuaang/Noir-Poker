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
    <div className="pointer-events-none fixed right-3 top-1/2 z-[110] -translate-y-1/2">
      <div className="glass-panel pointer-events-auto relative flex w-[min(320px,calc(100vw-1.5rem))] flex-col gap-3 rounded-[28px] p-3.5 animate-in slide-in-from-right-4 fade-in duration-200">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="glass-icon-button btn-press absolute right-2.5 top-2.5 rounded-full p-1.5 text-secondary"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="flex items-center gap-2 pr-8">
          <div className="glass-icon-button rounded-full p-1.5 text-accent-300">
            <Zap className="h-3.5 w-3.5" />
          </div>
          <span className="eyebrow text-[11px] text-accent-300">
            All-in
          </span>
        </div>

        <div className="space-y-1">
          <h3 className="text-sm font-semibold tracking-tight text-primary">Correr el board</h3>
          <p className="text-[11px] leading-relaxed text-secondary">
            Elige cuantas corridas quieres antes de cerrar la mano.
          </p>
        </div>

        {Object.keys(equity).length > 0 && (
          <div className="glass rounded-2xl p-2.5">
            <div className="eyebrow text-[11px] mb-2">
              Equity
            </div>
            <div className="grid gap-1.5">
              {neg.playerIds.map((id) => (
                <div key={id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate text-secondary">
                    {seatsById.get(id)?.name ?? id}
                  </span>
                  <span className="font-mono font-semibold text-accent-200 tabular-nums">
                    {equity[id] ?? 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {involved ? (
          <div className="grid grid-cols-3 gap-2">
            {options.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onVote(n)}
                className={`btn-press rounded-[20px] px-2 py-3 transition ${
                  myVote === n
                    ? "glass-button glass-button-accent shadow-[0_18px_44px_-28px_oklch(0.42_0.18_290_/_0.72)]"
                    : "glass-button glass-button-ghost"
                }`}
              >
                <span className="block text-base font-semibold text-inherit">{n}x</span>
                <span className="eyebrow text-[11px] block opacity-70">
                  {n === 1 ? "Normal" : "Runs"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="glass rounded-2xl px-3 py-2 text-center text-xs text-secondary">
            Solo los jugadores all-in pueden votar
          </div>
        )}

        <div className="glass rounded-2xl p-2.5">
          <div className="eyebrow text-[11px] mb-2 flex items-center justify-between gap-2">
            <span>Consenso</span>
            <span className="font-mono text-secondary">
              {neg.agreedN ? `${neg.agreedN}x` : `${totalVoted}/${total}`}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-accent-400 transition-all"
              style={{ width: `${total > 0 ? (totalVoted / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
