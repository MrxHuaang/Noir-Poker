"use client";
// A rank emblem as a tiny animated pixel sprite: the frames are painted once
// per tier by src/lib/pixelEmblem.ts into a cache, and one shared ticker
// flips every mounted emblem to the next frame (flames, glints, a falling
// drop, blinking eyes). Scaled up with nearest-neighbour so every pixel stays
// square. Reduced motion slows the ticker instead of freezing it.
import { useEffect, useRef } from "react";
import { EMBLEM_H, EMBLEM_W, FRAMES, emblemFrames } from "@/lib/pixelEmblem";

const cache = new Map<number, ImageData[]>();
const framesFor = (tier: number) => {
  let f = cache.get(tier);
  if (!f) {
    f = emblemFrames(tier).map((buf) => new ImageData(new Uint8ClampedArray(buf), EMBLEM_W, EMBLEM_H));
    cache.set(tier, f);
  }
  return f;
};

type Sub = (frame: number) => void;
const subs = new Set<Sub>();
let timer = 0;
let frame = 0;
function subscribe(fn: Sub) {
  subs.add(fn);
  if (!timer) {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer = window.setInterval(
      () => {
        frame = (frame + 1) % FRAMES;
        subs.forEach((s) => s(frame));
      },
      calm ? 320 : 130,
    );
  }
  return () => {
    subs.delete(fn);
    if (!subs.size) {
      window.clearInterval(timer);
      timer = 0;
    }
  };
}

export function RankEmblem({ tier, className }: { tier: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const frames = framesFor(tier);
    ctx.putImageData(frames[frame], 0, 0);
    return subscribe((f) => ctx.putImageData(frames[f], 0, 0));
  }, [tier]);
  return (
    <canvas
      ref={ref}
      width={EMBLEM_W}
      height={EMBLEM_H}
      className={className}
      style={{ imageRendering: "pixelated", aspectRatio: `${EMBLEM_W} / ${EMBLEM_H}` }}
      aria-hidden
    />
  );
}
