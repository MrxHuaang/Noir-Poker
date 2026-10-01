"use client";
// Your move, as objects on the table edge: a leather rail that slides up on
// your turn with a brass "Retirarse" plate, a bone ticket to check or call and
// a red ticket to bet or raise. The amount rides a chip along a brass rail;
// rubber stamps jump to half pot, pot or everything. Keys: F, C, R.
//
// Pure presentation: the numbers come from the public state and the move goes
// to the server, which validates it.
import { useEffect, useEffectEvent, useState } from "react";

export type RailMove = { action: "fold" | "check" | "call" | "bet" | "raise" | "all-in"; amount: number };

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export function NoirActionRail({
  active,
  turnKey,
  stack,
  myBet,
  currentBet,
  minRaise,
  bb,
  pot,
  onMove,
}: {
  active: boolean;
  /** Changes every new turn so the amount resets to the minimum. */
  turnKey: string;
  stack: number;
  myBet: number;
  currentBet: number;
  minRaise: number;
  bb: number;
  pot: number;
  onMove: (m: RailMove) => void;
}) {
  const toCall = Math.max(0, currentBet - myBet);
  const maxTo = myBet + stack;
  const canRaise = stack > toCall;
  const minTo = Math.min(maxTo, currentBet === 0 ? Math.max(bb, minRaise) : currentBet + Math.max(minRaise, bb));
  const [to, setTo] = useState(minTo);
  const [lastKey, setLastKey] = useState(turnKey);
  if (lastKey !== turnKey) {
    setLastKey(turnKey);
    setTo(minTo);
  }
  const clamped = Math.max(minTo, Math.min(maxTo, Math.round(to)));

  const potAfterCall = pot + toCall;
  const preset = (k: "half" | "pot" | "all") =>
    setTo(k === "all" ? maxTo : Math.round(myBet + toCall + potAfterCall * (k === "half" ? 0.5 : 1)));

  const raise = () => {
    if (!canRaise) return;
    if (clamped >= maxTo) onMove({ action: "all-in", amount: 0 });
    else if (currentBet === 0) onMove({ action: "bet", amount: clamped - myBet });
    else onMove({ action: "raise", amount: clamped });
  };
  const call = () => onMove(toCall === 0 ? { action: "check", amount: 0 } : { action: "call", amount: 0 });
  const fold = () => onMove({ action: "fold", amount: 0 });

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (!active) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA") && (t as HTMLInputElement).type !== "range") return;
    const k = e.key.toLowerCase();
    if (k === "f") fold();
    else if (k === "c") call();
    else if (k === "r") raise();
  });
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const callLabel = toCall === 0 ? "Pasar" : toCall >= stack ? `All-in ${fmt(stack)}` : `Igualar ${fmt(toCall)}`;
  const raiseLabel = clamped >= maxTo ? `All-in ${fmt(maxTo)}` : `${currentBet === 0 ? "Apostar" : "Subir a"} ${fmt(clamped)}`;

  return (
    <div
      className={`rail fixed inset-x-0 bottom-0 z-30 mx-auto w-[min(920px,100%)] px-5 pt-4 pb-5 transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] ${
        active ? "translate-y-0" : "pointer-events-none translate-y-[110%]"
      }`}
      role="group"
      aria-label="Tu jugada"
      aria-hidden={!active}
    >
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-brass" onClick={fold} tabIndex={active ? 0 : -1}>
          Retirarse <kbd className="font-pix text-[11px] opacity-60">F</kbd>
        </button>
        <button type="button" className="tk" onClick={call} tabIndex={active ? 0 : -1}>
          {callLabel} <kbd className="font-pix text-[11px] opacity-60">C</kbd>
        </button>
        {canRaise && (
          <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
            <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1.5">
                  <button type="button" className="stamp" onClick={() => preset("half")} tabIndex={active ? 0 : -1}>
                    ½ bote
                  </button>
                  <button type="button" className="stamp" onClick={() => preset("pot")} tabIndex={active ? 0 : -1}>
                    Bote
                  </button>
                  <button type="button" className="stamp" onClick={() => preset("all")} tabIndex={active ? 0 : -1}>
                    Todo
                  </button>
                </div>
                <label className="sr-only" htmlFor="rail-amount">
                  Cantidad
                </label>
                <input
                  id="rail-amount"
                  inputMode="numeric"
                  value={clamped}
                  onChange={(e) => setTo(Number(e.target.value.replace(/\D/g, "")) || minTo)}
                  className="slot-input h-8 w-24 px-2 text-right font-mono text-sm tabular-nums"
                  tabIndex={active ? 0 : -1}
                />
              </div>
              <input
                type="range"
                className="chip-range w-full"
                min={minTo}
                max={maxTo}
                step={Math.max(1, Math.round(bb / 2))}
                value={clamped}
                onChange={(e) => setTo(Number(e.target.value))}
                aria-label="Cantidad de la apuesta"
                tabIndex={active ? 0 : -1}
              />
            </div>
            <button type="button" className="tk tk-red" onClick={raise} tabIndex={active ? 0 : -1}>
              {raiseLabel} <kbd className="font-pix text-[11px] opacity-70">R</kbd>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
