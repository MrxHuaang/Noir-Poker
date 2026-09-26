"use client";
import { useState } from "react";
import type { BettingAction, NormalSeat, BettingRound } from "@/lib/betting";
import { getValidActions, formatChips } from "@/lib/betting";
import { clampInt } from "@/lib/num";

type Props = {
  seat: NormalSeat;
  betting: BettingRound;
  onAction: (action: BettingAction, amount?: number) => void;
  disabled?: boolean;
};

export function BettingControls({ seat, betting, onAction, disabled }: Props) {
  const valid = getValidActions(seat, betting);
  const toCall = Math.max(0, betting.currentBet - seat.bet);

  const canCheck = valid.some((v) => v.action === "check");
  const canCall = valid.some((v) => v.action === "call");
  const canFold = valid.some((v) => v.action === "fold");
  const canAllIn = valid.some((v) => v.action === "all-in");
  const betOpt = valid.find((v) => v.action === "bet");
  const raiseOpt = valid.find((v) => v.action === "raise");
  const sliderOpt = betOpt ?? raiseOpt;
  const pot = betting.pot;
  const minVal = sliderOpt?.min ?? 0;
  const maxVal = sliderOpt?.max ?? seat.chips;
  const clamp = (v: number) => clampInt(v, minVal, maxVal);
  const amountKey = [
    seat.id,
    seat.bet,
    seat.chips,
    betting.handNum,
    betting.currentBet,
    betting.minRaise,
    sliderOpt?.min ?? 0,
    sliderOpt?.max ?? 0,
  ].join(":");
  const initialRaiseAmount = sliderOpt
    ? clamp(sliderOpt.min ?? betting.currentBet + betting.minRaise)
    : 0;
  const [raiseDraft, setRaiseDraft] = useState<{ key: string; value: number }>(
    () => ({ key: amountKey, value: initialRaiseAmount }),
  );
  const raiseAmount =
    raiseDraft.key === amountKey ? clamp(raiseDraft.value) : initialRaiseAmount;
  const setRaiseAmount = (value: number) => {
    setRaiseDraft({ key: amountKey, value: clamp(value) });
  };

  function handleSlider(e: React.ChangeEvent<HTMLInputElement>) {
    setRaiseAmount(Number(e.target.value));
  }

  function handleBetRaise() {
    const action = raiseOpt ? "raise" : "bet";
    onAction(action, raiseAmount);
  }

  const presets = sliderOpt
    ? [
        { label: "33%", value: clamp(pot * 0.33) },
        { label: "1/2", value: clamp(pot * 0.5) },
        { label: "75%", value: clamp(pot * 0.75) },
        { label: "Bote", value: clamp(pot) },
        { label: "Máx", value: clamp(maxVal) },
      ].filter((p, i, arr) => p.value > 0 && arr.findIndex((q) => q.value === p.value) === i)
    : [];

  return (
    <div className="flex w-full flex-col gap-2">
      {sliderOpt && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setRaiseAmount(Math.min(p.value, maxVal))}
                className="glass-button btn-press flex-1 rounded-lg px-2 py-1.5 text-xs font-medium text-secondary"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-line px-3 py-2.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="bet-amount" className="eyebrow">
                Monto
              </label>
              <span className="numeric text-lg leading-none text-primary">
                {formatChips(raiseAmount)}
              </span>
            </div>
            <input
              id="bet-amount"
              type="range"
              min={sliderOpt.min ?? 0}
              max={sliderOpt.max ?? seat.chips}
              step={betting.bigBlind > 0 ? betting.bigBlind : 1}
              value={raiseAmount}
              onChange={handleSlider}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-bone/10 accent-accent-400"
            />
          </div>
        </div>
      )}

      <div className="flex h-11 gap-1.5">
        {canFold && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction("fold")}
            className="glass-button glass-button-danger btn-press flex-1 rounded-xl px-2 text-[13px] font-semibold"
          >
            Retirarse
          </button>
        )}

        {(canCheck || canCall) && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction(canCheck ? "check" : "call")}
            className="btn-primary h-full flex-[2] rounded-xl px-3 text-[13px]"
          >
            {canCheck ? "Pasar" : `Igualar ${formatChips(toCall)}`}
          </button>
        )}

        {sliderOpt && (
          <button
            type="button"
            disabled={disabled}
            onClick={handleBetRaise}
            className="btn-accent h-full flex-[2] rounded-xl px-3 text-[13px]"
          >
            {raiseOpt ? "Subir" : "Apostar"}
          </button>
        )}

        {!sliderOpt && canAllIn && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction("all-in")}
            className="btn-accent h-full flex-[2] rounded-xl px-3 text-[13px]"
          >
            All-in
          </button>
        )}
      </div>
    </div>
  );
}
