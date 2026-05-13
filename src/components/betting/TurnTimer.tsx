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
  const remaining = useCountdown(deadline);

  if (deadline === null) return null;

  const pct = Math.min(100, (remaining / turnTime) * 100);
  const inBank = remaining === 0 && timeBank > 0;
  const urgent = pct < 20 || inBank;

  return (
    <div className="flex flex-col items-center gap-1 w-full">
      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            urgent ? "bg-rose-400" : "bg-emerald-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className={`text-xs tabular-nums ${
          urgent ? "text-rose-300" : "text-zinc-400"
        }`}
      >
        {remaining > 0
          ? formatDuration(remaining)
          : timeBank > 0
          ? `Time bank: ${formatDuration(timeBank)}`
          : "Tiempo agotado"}
      </div>
    </div>
  );
}
