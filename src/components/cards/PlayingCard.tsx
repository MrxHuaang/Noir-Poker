"use client";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { Card } from "@/lib/poker";
import { rankLabel, suitColor, suitGlyph } from "@/lib/poker";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "w-14 h-20 text-sm",
  md: "w-20 h-28 text-base",
  lg: "w-24 h-36 text-lg",
};

export function PlayingCard({
  card,
  faceUp,
  size = "md",
  className = "",
  flipDelay = 0,
}: {
  card?: Card;
  faceUp: boolean;
  size?: Size;
  className?: string;
  flipDelay?: number;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const flipperRef = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      if (!flipperRef.current) return;
      gsap.to(flipperRef.current, {
        rotateY: faceUp ? 180 : 0,
        duration: 0.7,
        ease: "power3.inOut",
        delay: flipDelay,
      });
    },
    { scope: wrapRef, dependencies: [faceUp, flipDelay] },
  );

  return (
    <div
      ref={wrapRef}
      className={`playing-card ${SIZES[size]} ${className}`}
      style={{ perspective: 1200 }}
      data-face-up={faceUp ? "1" : "0"}
    >
      <div
        ref={flipperRef}
        className="flipper relative w-full h-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        <CardBack />
        <CardFront card={card} />
      </div>
    </div>
  );
}

function CardBack() {
  return (
    <div
      className="absolute inset-0 rounded-xl border border-white/10 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] overflow-hidden"
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        background:
          "linear-gradient(135deg,#1a1f3a 0%,#0c1024 60%,#0a0d1c 100%)",
      }}
    >
      <div
        className="absolute inset-2 rounded-lg opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 2px, transparent 2px 8px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 8px)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border border-white/30" />
      </div>
    </div>
  );
}

function CardFront({ card }: { card?: Card }) {
  if (!card) {
    return (
      <div
        className="absolute inset-0 rounded-xl border border-dashed border-white/15 bg-white/[0.02]"
        style={{
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          transform: "rotateY(180deg)",
        }}
      />
    );
  }
  const color = suitColor(card.suit);
  const colorClass = color === "red" ? "text-rose-600" : "text-zinc-900";
  return (
    <div
      className="absolute inset-0 rounded-xl border border-zinc-200 bg-white shadow-[0_15px_35px_-12px_rgba(0,0,0,0.55)] flex flex-col justify-between p-2"
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        transform: "rotateY(180deg)",
      }}
    >
      <div className={`flex flex-col leading-none ${colorClass}`}>
        <span className="font-semibold tracking-tight">
          {rankLabel(card.rank)}
        </span>
        <span className="text-[1em]">{suitGlyph(card.suit)}</span>
      </div>
      <div
        className={`text-[2.4em] leading-none self-center ${colorClass}`}
        aria-hidden
      >
        {suitGlyph(card.suit)}
      </div>
      <div
        className={`flex flex-col leading-none self-end rotate-180 ${colorClass}`}
      >
        <span className="font-semibold tracking-tight">
          {rankLabel(card.rank)}
        </span>
        <span className="text-[1em]">{suitGlyph(card.suit)}</span>
      </div>
    </div>
  );
}
