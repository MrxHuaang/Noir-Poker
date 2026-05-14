"use client";
import { useCountdown } from "@/hooks/useTimer";
import { formatDuration } from "@/lib/tournament";

export function TurnTimer({
  deadline,
  turnTime,
  timeBank,
}: {
  deadline: number | null;
  turnTime: number;
  timeBank: number;
}) {
  const remainingNormal = useCountdown(deadline);
  
  // Calculate how much time bank is left if we are past the normal deadline
  // useCountdown(deadline + timeBank) gives us the total time left including time bank
  const totalDeadline = deadline ? deadline + timeBank : null;
  const remainingTotal = useCountdown(totalDeadline);

  if (deadline === null) return null;

  const inBank = remainingNormal === 0 && remainingTotal > 0;
  const isExhausted = remainingTotal === 0;
  
  // Progress bar logic
  let pct = 0;
  if (!inBank) {
    pct = Math.min(100, (remainingNormal / turnTime) * 100);
  } else {
    // If in bank, show progress relative to the total time bank they had at start of turn
    pct = Math.min(100, (remainingTotal / timeBank) * 100);
  }

  const urgent = (!inBank && pct < 20) || (inBank && remainingTotal < 10000);

  return (
    <div className="flex flex-col items-center gap-1 w-full">
      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            urgent ? "bg-rose-400" : inBank ? "bg-amber-400" : "bg-emerald-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className={`text-xs tabular-nums font-bold tracking-widest ${
          urgent ? "text-rose-400" : inBank ? "text-amber-400" : "text-zinc-400"
        }`}
      >
        {!inBank && !isExhausted
          ? formatDuration(remainingNormal)
          : inBank
          ? `TIME BANK: ${formatDuration(remainingTotal)}`
          : "TIEMPO AGOTADO"}
      </div>
    </div>
  );
}
