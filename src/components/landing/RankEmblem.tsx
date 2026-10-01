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
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const frames = framesFor(tier);
    const paint = (f: number) => ctx.putImageData(frames[f], 0, 0);
    paint(frame);
    // Only on the shared ticker while on screen: the ladder is a long pinned
    // section and the ticker stops entirely once no emblem is visible.
    let off: (() => void) | null = null;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !off) {
          paint(frame);
          off = subscribe(paint);
        } else if (!e.isIntersecting && off) {
          off();
          off = null;
        }
      },
      { rootMargin: "100px" },
    );
    io.observe(cv);
    return () => {
      io.disconnect();
      off?.();
    };
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
