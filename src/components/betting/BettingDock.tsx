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

  const handLabel = holeCards ? describeHand([...holeCards, ...community]) : null;

  return (
    <div
      className={`glass-panel relative w-[min(360px,90vw)] overflow-hidden rounded-[22px] p-3.5 transition-shadow duration-300 ${
        isMyTurn ? "ring-1 ring-accent-400/45" : ""
      }`}
    >
      {isMyTurn && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-accent-400" aria-hidden />
      )}

      <div className="relative z-10 mb-2 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="overflow-hidden rounded-[9px]">
            <Avatar seed={seed} size={30} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold leading-tight text-primary">
              {name}
              {isMyTurn && <span className="ml-2 text-xs font-medium text-accent-300">Tu turno</span>}
            </span>
            {seat && (
              <span className="numeric text-xs leading-none text-secondary">
                {formatChips(seat.chips)}
              </span>
            )}
          </div>
        </div>
        {seat && seat.bet > 0 && (
          <div className="flex flex-col items-end leading-tight">
            <span className="eyebrow leading-none">Apuesta</span>
            <span className="numeric text-sm leading-tight text-accent-200">
              {formatChips(seat.bet)}
            </span>
          </div>
        )}
      </div>

      {handLabel && holeCards && (
        <div className="mb-2.5 flex items-baseline justify-between border-y border-line py-2">
          <span className="eyebrow">Mano</span>
          <span className="ml-3 truncate font-display text-lg italic leading-none text-bone">
            {handLabel}
          </span>
        </div>
      )}

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
          <BettingControls seat={seat} betting={betting} onAction={onAction} />
        </div>
      )}

      {seat && onToggleTimeBank && (
        <div className="mt-2 flex items-center justify-end">
          <button
            type="button"
            onClick={onToggleTimeBank}
            title={useTimeBank ? "Desactivar timebank" : "Activar timebank"}
            className={`glass-chip btn-press inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium ${
              useTimeBank ? "glass-button-accent" : "glass-button-ghost"
            }`}
          >
            {useTimeBank ? (
              <Battery className="h-2.5 w-2.5" />
            ) : (
              <BatteryLow className="h-2.5 w-2.5" />
            )}
            Banco de tiempo {useTimeBank ? "activo" : "apagado"}
          </button>
        </div>
      )}

      {extra}
    </div>
  );
}
