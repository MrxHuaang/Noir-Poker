"use client";
// Progress-bar turn timer for the online (server-authoritative) mode.
// Uses the server-published deadline (Unix ms) and the known 30-second
// turn timeout to compute percentage remaining.
import { useCountdown } from "@/hooks/useTimer";

const TURN_TIMEOUT_MS = 30_000;

export function OnlineTurnTimer({ deadline }: { deadline?: number }) {
  const remaining = useCountdown(deadline ?? null);
  if (!deadline) return null;

  const pct = Math.min(100, (remaining / TURN_TIMEOUT_MS) * 100);
  const secs = Math.ceil(remaining / 1000);
  const urgent = pct < 25;
  const warn = pct < 50;

  const barColor = urgent
    ? "bg-rose-500"
    : warn
      ? "bg-warn-400"
      : "bg-accent-400";
  const textColor = urgent
    ? "text-rose-400"
    : warn
      ? "text-warn-300"
      : "text-accent-200";

  return (
    <div className="flex w-full flex-col items-center gap-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-xs font-bold tabular-nums tracking-widest ${textColor}`}
        aria-live="polite"
      >
        {secs}s
      </span>
    </div>
  );
}
