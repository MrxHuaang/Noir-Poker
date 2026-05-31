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

  // Quick bet presets — percentage of pot + Max (all-in)
  const pot = betting.pot;
  const minVal = sliderOpt?.min ?? 0;
  const maxVal = sliderOpt?.max ?? Infinity;
  const clamp = (v: number) => Math.max(minVal, Math.min(maxVal, Math.round(v)));
  const presets = sliderOpt
    ? [
        { label: "33%", value: clamp(pot * 0.33) },
        { label: "½", value: clamp(pot * 0.5) },
        { label: "75%", value: clamp(pot * 0.75) },
        { label: "Bote", value: clamp(pot) },
        { label: "Max", value: clamp(maxVal === Infinity ? seat.chips : maxVal) },
      ].filter((p, i, arr) => p.value > 0 && arr.findIndex((q) => q.value === p.value) === i)
    : [];

  return (
    <div className="flex flex-col gap-2 w-full">
      {sliderOpt && (
        <div className="flex flex-col gap-2">
          {/* Preset Buttons — compact */}
          <div className="flex gap-1">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setRaiseAmount(Math.min(p.value, sliderOpt.max ?? p.value))}
                className="flex-1 px-1 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-[9px] font-bold text-zinc-300 transition border border-white/5"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Slider & Value Display — compact */}
          <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-black/40 border border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Amount</span>
              <span className="text-base font-black text-amber-400 tabular-nums leading-none">
                {formatChips(raiseAmount)}
              </span>
            </div>
            <input
              type="range"
              min={sliderOpt.min ?? 0}
              max={sliderOpt.max ?? seat.chips}
              step={betting.minRaise > 0 ? betting.minRaise : 1}
              value={raiseAmount}
              onChange={handleSlider}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        </div>
      )}

      {/* Main Action Buttons — slightly smaller */}
      <div className="flex gap-1.5 h-11">
        {canFold && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction("fold")}
            className="flex-1 rounded-xl bg-zinc-800 hover:bg-rose-900/40 text-rose-200 text-xs font-black uppercase tracking-widest border border-white/5 transition-all"
          >
            Fold
          </button>
        )}

        {(canCheck || canCall) && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction(canCheck ? "check" : "call")}
            className="flex-[2] rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-black uppercase tracking-widest transition-all shadow-lg"
          >
            {canCheck ? "Check" : `Call ${formatChips(toCall)}`}
          </button>
        )}

        {sliderOpt && (
          <button
            type="button"
            disabled={disabled}
            onClick={handleBetRaise}
            className="flex-[2] rounded-xl bg-amber-700/80 hover:bg-amber-600/85 text-amber-100 text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-amber-900/20"
          >
            {raiseOpt ? "Raise" : "Bet"}
          </button>
        )}

        {!sliderOpt && canAllIn && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction("all-in")}
            className="flex-[2] rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black uppercase tracking-widest transition-all"
          >
            All-in
          </button>
        )}
      </div>
    </div>
  );
}
