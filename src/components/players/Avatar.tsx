"use client";
import { useMemo } from "react";
import { avatarSvg } from "@/lib/dicebear";

export function Avatar({
  seed,
  size = 56,
  className = "",
}: {
  seed: string;
  size?: number;
  className?: string;
}) {
  const svg = useMemo(() => avatarSvg(seed), [seed]);
  const src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className={`inline-block shrink-0 rounded-full bg-zinc-100 ring-1 ring-white/10 overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
