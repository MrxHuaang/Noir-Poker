"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";

export function EquityBadge({
  value,
  highlight,
}: {
  value: number;
  highlight?: boolean;
}) {
  const numRef = useRef<HTMLSpanElement | null>(null);
  const prevRef = useRef(value);

  useEffect(() => {
    if (!numRef.current) return;
    const from = prevRef.current;
    const obj = { v: from };
    const tween = gsap.to(obj, {
      v: value,
      duration: 0.5,
      ease: "power2.out",
      onUpdate: () => {
        if (numRef.current) numRef.current.textContent = formatPct(obj.v);
      },
    });
    prevRef.current = value;
    return () => {
      tween.kill();
    };
  }, [value]);

  return (
    <span
      className={`equity-badge inline-flex items-center justify-center min-w-[3.2rem] px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums tracking-tight ring-1 transition ${
        highlight
          ? "bg-accent/15 ring-accent/40 text-accent"
          : "bg-black/55 ring-white/15 text-zinc-100"
      }`}
    >
      <span ref={numRef}>{formatPct(value)}</span>
    </span>
  );
}

function formatPct(v: number): string {
  const pct = Math.max(0, Math.min(1, v)) * 100;
  return pct >= 99.95
    ? "100%"
    : pct < 0.05
      ? "0%"
      : `${pct.toFixed(1)}%`;
}
