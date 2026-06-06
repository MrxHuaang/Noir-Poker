"use client";

export function OutsChip({
  outs,
  unseenCount,
}: {
  outs: number;
  unseenCount: number;
}) {
  if (outs <= 0 || unseenCount <= 0) return null;
  const pct = (outs / unseenCount) * 100;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent/10 ring-1 ring-accent/25 text-[10px] text-accent tabular-nums">
      {outs} outs · {pct.toFixed(0)}%
    </span>
  );
}
