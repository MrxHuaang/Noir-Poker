"use client";
// Smart betting dock for the server-authoritative online mode.
// Derives available actions and pot-size presets from PublicState.
// The server validates every action; the client only needs to provide
// a plausible amount (no client-side enforcement needed).
import { useState } from "react";
import { clampInt } from "@/lib/num";
import { formatChips } from "@/lib/betting";
import type { PublicState } from "@/hooks/useGameSocket";
import { OnlineTurnTimer } from "@/components/online/OnlineTurnTimer";

function buildPresets(
  pot: number,
  toCall: number,
  minBet: number,
  maxBet: number,
): { label: string; value: number }[] {
  const clamp = (v: number) => clampInt(v, minBet, maxBet);
  const candidates = [
    { label: "1/3", value: clamp(toCall + Math.floor(pot / 3)) },
    { label: "1/2", value: clamp(toCall + Math.floor(pot / 2)) },
    { label: "2/3", value: clamp(toCall + Math.floor((pot * 2) / 3)) },
    { label: "Pot", value: clamp(2 * toCall + pot) },
    { label: "All-in", value: maxBet },
  ];
  // De-dupe by value, keep first occurrence.
  const seen = new Set<number>();
  return candidates.filter((p) => {
    if (p.value <= 0 || seen.has(p.value)) return false;
    seen.add(p.value);
    return true;
  });
}

export function OnlineBettingControls({
  state,
  uid,
  onAction,
}: {
  state: PublicState;
  uid: string;
  onAction: (action: string, amount?: number) => void;
}) {
  const mySeat = state.seats.find((s) => s.id === uid);
  if (!mySeat || mySeat.status === "folded" || mySeat.status === "all-in") {
    return null;
  }

  const currentBet = state.seats.reduce((m, s) => Math.max(m, s.bet), 0);
  const toCall = Math.max(0, currentBet - mySeat.bet);
  const myChips = mySeat.chips;
  const pot = state.pot;
  const bb = state.bb ?? 10;
  const isReRaise = currentBet > 0;

  // Minimum raise-to amount (total chips committed this round).
  const minBet = clampInt(
    isReRaise ? Math.max(currentBet * 2, currentBet + bb) : bb,
    0,
    myChips,
  );
  const maxBet = myChips;

  const canFold = true;
  const canCheck = toCall === 0;
  const canCall = toCall > 0;
  const isAllInCall = canCall && myChips <= toCall;
  const canSizeAction = myChips > toCall && minBet <= maxBet;

  // Stable key: resets raise amount on new hand / new betting round.
  const amountKey = `${state.handNum}-${currentBet}-${myChips}-${mySeat.bet}`;
  const initAmt = clampInt(minBet, minBet, maxBet);
  const [draft, setDraft] = useState<{ key: string; value: number }>({
    key: amountKey,
    value: initAmt,
  });
  const raiseAmt =
    draft.key === amountKey ? clampInt(draft.value, minBet, maxBet) : initAmt;
  const setRaiseAmt = (v: number) =>
    setDraft({ key: amountKey, value: clampInt(v, minBet, maxBet) });

  const presets = canSizeAction
    ? buildPresets(pot, toCall, minBet, maxBet)
    : [];

  return (
    <div className="flex flex-col gap-2">
      {/* Turn timer */}
      <OnlineTurnTimer deadline={state.deadline} />

      {/* Raise / Bet sizing */}
      {canSizeAction && (
        <div className="flex flex-col gap-2">
          {/* Pot-size preset buttons */}
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setRaiseAmt(p.value)}
                className="glass-button glass-button-ghost btn-press flex-1 min-w-[44px] rounded-xl px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.18em]"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Slider + amount display */}
          <div className="glass-panel flex flex-col gap-2 rounded-[20px] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-[0.22em] text-zinc-500">
                {isReRaise ? "Raise to" : "Bet"}
              </span>
              <span className="text-base font-black leading-none text-zinc-100 tabular-nums">
                {formatChips(raiseAmt)}
              </span>
            </div>
            <input
              type="range"
              min={minBet}
              max={maxBet}
              step={bb > 0 ? bb : 1}
              value={raiseAmt}
              onChange={(e) => setRaiseAmt(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-accent-400"
            />
            <div className="flex justify-between text-[8px] text-zinc-600 tabular-nums">
              <span>min {formatChips(minBet)}</span>
              <span>all-in {formatChips(maxBet)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex h-11 gap-1.5">
        {canFold && (
          <button
            type="button"
            onClick={() => onAction("fold")}
            className="glass-button glass-button-danger btn-press flex-1 rounded-[18px] px-3 text-xs font-black uppercase tracking-[0.18em]"
          >
            Fold
          </button>
        )}

        {canCheck && (
          <button
            type="button"
            onClick={() => onAction("check")}
            className="glass-button glass-button-accent btn-press flex-[2] rounded-[18px] px-3 text-xs font-black uppercase tracking-[0.18em]"
          >
            Check
          </button>
        )}

        {canCall && (
          <button
            type="button"
            onClick={() => onAction(isAllInCall ? "all-in" : "call")}
            className="glass-button glass-button-accent btn-press flex-[2] rounded-[18px] px-3 text-xs font-black uppercase tracking-[0.18em]"
          >
            {isAllInCall
              ? `All-in ${formatChips(myChips)}`
              : `Call ${formatChips(toCall)}`}
          </button>
        )}

        {canSizeAction && (
          <button
            type="button"
            onClick={() => onAction(isReRaise ? "raise" : "bet", raiseAmt)}
            className="glass-button glass-button-accent btn-press flex-[2] rounded-[18px] px-3 text-xs font-black uppercase tracking-[0.18em]"
          >
            {isReRaise ? "Raise" : "Bet"}
          </button>
        )}
      </div>
    </div>
  );
}
