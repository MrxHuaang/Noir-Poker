"use client";
import { useState } from "react";
import type { BettingAction, NormalSeat, BettingRound } from "@/lib/betting";
import { getValidActions, formatChips } from "@/lib/betting";

type Props = {
  seat: NormalSeat;
  betting: BettingRound;
  onAction: (action: BettingAction, amount?: number) => void;
  disabled?: boolean;
};

export function BettingControls({ seat, betting, onAction, disabled }: Props) {
  const valid = getValidActions(seat, betting);
  const hasRaiseOrBet = valid.find(
    (v) => v.action === "raise" || v.action === "bet",
  );
  const toCall = Math.max(0, betting.currentBet - seat.bet);
  const [raiseAmount, setRaiseAmount] = useState<number>(
    hasRaiseOrBet?.min ?? betting.currentBet + betting.minRaise,
  );

  const canCheck = valid.some((v) => v.action === "check");
  const canCall = valid.some((v) => v.action === "call");
  const canFold = valid.some((v) => v.action === "fold");
  const canAllIn = valid.some((v) => v.action === "all-in");
  const betOpt = valid.find((v) => v.action === "bet");
  const raiseOpt = valid.find((v) => v.action === "raise");
  const sliderOpt = betOpt ?? raiseOpt;

  function handleSlider(e: React.ChangeEvent<HTMLInputElement>) {
    setRaiseAmount(Number(e.target.value));
  }

  function handleBetRaise() {
    const action = raiseOpt ? "raise" : "bet";
    onAction(action, raiseAmount);
  }

  // Quick bet presets as fraction of pot
  const pot = betting.pot;
  const presets = sliderOpt
    ? [
        { label: "½ Bote", value: Math.max(sliderOpt.min ?? 0, Math.round(pot * 0.5)) },
        { label: "Bote", value: Math.max(sliderOpt.min ?? 0, pot) },
        { label: "2×", value: Math.max(sliderOpt.min ?? 0, betting.currentBet * 2 + betting.minRaise) },
      ].filter((p) => p.value <= (sliderOpt.max ?? Infinity) && p.value > 0)
    : [];

  return (
    <div className="flex flex-col gap-3 w-full">
      {sliderOpt && (
        <div className="flex flex-col gap-2 p-3 rounded-2xl glass">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Min: {formatChips(sliderOpt.min ?? 0)}</span>
            <span className="text-zinc-100 font-medium tabular-nums">
              {formatChips(raiseAmount)}
            </span>
            <span>Max: {formatChips(sliderOpt.max ?? 0)}</span>
          </div>
          <input
            type="range"
            min={sliderOpt.min ?? 0}
            max={sliderOpt.max ?? seat.chips}
            step={betting.minRaise > 0 ? betting.minRaise : 1}
            value={raiseAmount}
            onChange={handleSlider}
            className="w-full accent-emerald-400"
          />
          <div className="flex gap-1.5 flex-wrap">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() =>
                  setRaiseAmount(
                    Math.min(p.value, sliderOpt.max ?? p.value),
                  )
                }
                className="flex-1 px-2 py-1 rounded-full text-[11px] bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-zinc-200 btn-press transition"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {canFold && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction("fold")}
            className="px-4 py-3 rounded-2xl bg-rose-500/10 ring-1 ring-rose-400/30 text-rose-200 text-sm font-medium hover:bg-rose-500/20 disabled:opacity-40 btn-press transition"
          >
            Fold
          </button>
        )}

        {canCheck && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction("check")}
            className="px-4 py-3 rounded-2xl bg-white/5 ring-1 ring-white/10 text-zinc-100 text-sm font-medium hover:bg-white/10 disabled:opacity-40 btn-press transition"
          >
            Check
          </button>
        )}

        {canCall && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction("call")}
            className="px-4 py-3 rounded-2xl bg-blue-500/15 ring-1 ring-blue-400/30 text-blue-100 text-sm font-medium hover:bg-blue-500/25 disabled:opacity-40 btn-press transition"
          >
            Call {formatChips(toCall)}
          </button>
        )}

        {sliderOpt && (
          <button
            type="button"
            disabled={disabled}
            onClick={handleBetRaise}
            className="px-4 py-3 rounded-2xl bg-emerald-500/20 ring-1 ring-emerald-400/40 text-emerald-100 text-sm font-medium hover:bg-emerald-500/30 disabled:opacity-40 btn-press transition"
          >
            {raiseOpt ? "Raise" : "Bet"} {formatChips(raiseAmount)}
          </button>
        )}

        {canAllIn && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction("all-in")}
            className={`px-4 py-3 rounded-2xl bg-amber-500/20 ring-1 ring-amber-400/40 text-amber-100 text-sm font-medium hover:bg-amber-500/30 disabled:opacity-40 btn-press transition ${
              !canFold && !sliderOpt ? "col-span-2" : ""
            }`}
          >
            All-in {formatChips(seat.chips)}
          </button>
        )}
      </div>
    </div>
  );
}
