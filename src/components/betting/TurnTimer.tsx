"use client";
import { useCountdown } from "@/hooks/useTimer";
import { formatDuration } from "@/lib/tournament";

export function TurnTimer({
  deadline,
  turnTime,
  timeBank,
  useBank = true,
}: {
  deadline: number | null;
  turnTime: number;
  timeBank: number;
  useBank?: boolean;
}) {
  const effectiveBank = useBank ? timeBank : 0;
  const remainingNormal = useCountdown(deadline);
  const totalDeadline = deadline ? deadline + effectiveBank : null;
  const remainingTotal = useCountdown(totalDeadline);

  if (deadline === null) return null;

  const inBank = remainingNormal === 0 && remainingTotal > 0 && effectiveBank > 0;
  const isExhausted = remainingTotal === 0;

  // Progress: normal phase scales to turnTime, bank phase scales to effectiveBank and is fully red.
  let pct = 0;
  let barColor = "bg-amber-400";
  let textColor = "text-zinc-300";
  if (!inBank && !isExhausted) {
    pct = Math.min(100, (remainingNormal / turnTime) * 100);
    if (pct < 25) {
      barColor = "bg-rose-500";
      textColor = "text-rose-400";
    } else if (pct < 50) {
      barColor = "bg-amber-500";
      textColor = "text-amber-300";
    } else {
      barColor = "bg-amber-400";
      textColor = "text-amber-200";
    }
  } else if (inBank) {
    pct = Math.min(100, (remainingTotal / effectiveBank) * 100);
    barColor = "bg-rose-500";
    textColor = "text-rose-400";
  } else {
    pct = 0;
    barColor = "bg-rose-500";
    textColor = "text-rose-400";
  }

  return (
    <div className="flex flex-col items-center gap-1 w-full">
      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className={`text-xs tabular-nums font-bold tracking-widest ${textColor}`}>
        {isExhausted
          ? "TIEMPO AGOTADO"
          : inBank
            ? `TIMEBANK: ${formatDuration(remainingTotal)}`
            : formatDuration(remainingNormal)}
      </div>
    </div>
  );
}
