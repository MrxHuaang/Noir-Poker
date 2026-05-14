"use client";
import type { ReactNode } from "react";
import { Battery, BatteryLow } from "lucide-react";
import { Avatar } from "@/components/players/Avatar";
import { TurnTimer } from "@/components/betting/TurnTimer";
import { BettingControls } from "@/components/betting/BettingControls";
import type { BettingAction, BettingRound, NormalSeat } from "@/lib/betting";
import { formatChips } from "@/lib/betting";
import type { Card } from "@/lib/poker";
import { describeHand } from "@/lib/handLabel";

type Props = {
  seat: NormalSeat | null;
  name: string;
  seed: string;
  betting: BettingRound | null;
  holeCards: [Card, Card] | null;
  community?: Card[];
  isMyTurn: boolean;
  turnTimeMs: number;
  hasResult: boolean;
  onAction: (action: BettingAction, amount?: number) => void;
  extra?: ReactNode;
  useTimeBank?: boolean;
  onToggleTimeBank?: () => void;
};

export function BettingDock({
  seat,
  name,
  seed,
  betting,
  holeCards,
  community = [],
  isMyTurn,
  turnTimeMs,
  hasResult,
  onAction,
  extra,
  useTimeBank = true,
  onToggleTimeBank,
}: Props) {
  if (!seat && !name) return null;

  // Hand strength label — shows hole-only label preflop, full best hand when community ≥ 3
  const handLabel = holeCards
    ? describeHand([...holeCards, ...community])
    : null;

  return (
    <div className="w-[min(360px,90vw)] bg-zinc-900/95 backdrop-blur-xl rounded-2xl ring-1 ring-white/10 p-2.5 shadow-2xl overflow-hidden relative">
      {isMyTurn && (
        <div className="absolute inset-0 bg-emerald-500/5 animate-pulse pointer-events-none" />
      )}

      {/* Player header — compact */}
      <div className="flex items-center justify-between mb-1.5 relative z-10">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar seed={seed} size={28} />
          <div className="flex flex-col min-w-0">
            <span className="text-[12px] font-black text-white uppercase tracking-tight truncate leading-tight">
              {name}
            </span>
            {seat && (
              <span className="text-[10px] text-emerald-400 font-mono font-bold leading-none">
                {formatChips(seat.chips)}
              </span>
            )}
          </div>
        </div>
        {seat && seat.bet > 0 && (
          <div className="flex flex-col items-end leading-tight">
            <span className="text-[8px] uppercase tracking-widest text-zinc-500 font-black leading-none">
              Apuesta
            </span>
            <span className="text-[12px] font-black text-amber-300 tabular-nums leading-tight">
              {formatChips(seat.bet)}
            </span>
          </div>
        )}
      </div>

      {/* Hand strength label — compact inline */}
      {handLabel && holeCards && (
        <div className="mb-1.5 px-2 py-1 rounded-lg bg-white/5 ring-1 ring-white/[0.06] flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Mano</span>
          <span className="text-[11px] font-black text-amber-300 tracking-tight truncate ml-2">{handLabel}</span>
        </div>
      )}

      {/* Betting controls — only visible on my turn */}
      {seat && betting && isMyTurn && seat.status === "active" && !hasResult && (
        <div className="animate-in fade-in zoom-in duration-300">
          {seat.turnDeadline && (
            <div className="mb-2">
              <TurnTimer
                deadline={seat.turnDeadline}
                turnTime={turnTimeMs}
                timeBank={seat.timeBank}
                useBank={useTimeBank}
              />
            </div>
          )}
          <BettingControls
            seat={seat}
            betting={betting}
            onAction={onAction}
          />
        </div>
      )}

      {/* Timebank toggle — compact pill, bottom-right */}
      {seat && onToggleTimeBank && (
        <div className="mt-1.5 flex items-center justify-end">
          <button
            type="button"
            onClick={onToggleTimeBank}
            title={useTimeBank ? "Desactivar timebank" : "Activar timebank"}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ring-1 transition btn-press ${
              useTimeBank
                ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30 hover:bg-emerald-500/25"
                : "bg-zinc-800 text-zinc-500 ring-white/10 hover:bg-zinc-700"
            }`}
          >
            {useTimeBank ? <Battery className="w-2.5 h-2.5" /> : <BatteryLow className="w-2.5 h-2.5" />}
            TB {useTimeBank ? "ON" : "OFF"}
          </button>
        </div>
      )}

      {extra}
    </div>
  );
}
