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

export function AllInVoteModal({ gameState, selfUid, onVote, open = true, onClose }: Props) {
  if (!open) return null;
  if (!gameState || gameState.phase !== "all-in-negotiation") return null;
  const neg = gameState.allInNegotiation;
  if (!neg) return null;

  const myVote = selfUid ? neg.votes[selfUid] : null;
  const involved = neg.playerIds.includes(selfUid ?? "");
  const totalVoted = Object.keys(neg.votes).length;
  const total = neg.playerIds.length;

  return (
    <div className="fixed inset-x-0 bottom-6 sm:bottom-12 z-[110] flex flex-col items-center justify-end pointer-events-none">
      <div className="pointer-events-auto w-[min(420px,92vw)] bg-zinc-900/95 backdrop-blur-xl rounded-3xl ring-2 ring-amber-400/40 shadow-[0_30px_120px_-20px_rgba(180,130,40,0.3)] p-4 sm:p-6 flex flex-col gap-3 sm:gap-4 animate-in slide-in-from-bottom-8 fade-in duration-300 relative">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full text-zinc-500 hover:text-zinc-100 hover:bg-white/10 transition"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-2 justify-center">
          <Zap className="w-5 h-5 text-amber-400" />
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-300">
            All-in
          </span>
        </div>
        <h3 className="text-xl font-black text-white text-center tracking-tight">
          ¿Cuántas veces correr el board?
        </h3>
        <p className="text-xs text-zinc-400 text-center">
          Los jugadores all-in votan. Se ejecuta la opción más votada cuando todos
          decidan.
        </p>

        {involved ? (
          <div className="flex items-center gap-2 justify-center">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onVote(n)}
                className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-black transition btn-press ${
                  myVote === n
                    ? "bg-amber-700/80 text-amber-100 shadow-lg shadow-amber-700/30 ring-2 ring-amber-400"
                    : "bg-white/5 text-zinc-200 hover:bg-white/10 ring-1 ring-white/10"
                }`}
              >
                <span className="text-xl">{n}×</span>
                <span className="text-[9px] uppercase tracking-widest opacity-70">
                  {n === 1 ? "Normal" : `${n} runs`}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-4 py-3 rounded-xl bg-white/5 ring-1 ring-white/10 text-xs text-zinc-400 text-center">
            Solo los jugadores all-in pueden votar
          </div>
        )}

        <div className="flex items-center gap-2 justify-center">
          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-all"
              style={{ width: `${(totalVoted / total) * 100}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums font-bold text-zinc-500">
            {totalVoted}/{total}
          </span>
        </div>
      </div>
    </div>
  );
}
