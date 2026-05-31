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
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/8 ring-1 ring-amber-400/25 text-[10px] text-amber-200 tabular-nums">
      {outs} outs · {pct.toFixed(0)}%
    </span>
  );
}
