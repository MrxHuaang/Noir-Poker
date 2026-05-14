"use client";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { Card } from "@/lib/poker";
import { rankLabel, suitColor, suitGlyph } from "@/lib/poker";
import { getCardBack, type CardBackId } from "@/lib/themes";

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
  dealDelay = 0,
  dealIn = true,
  cardBack,
}: {
  card?: Card;
  faceUp: boolean;
  size?: Size;
  className?: string;
  flipDelay?: number;
  dealDelay?: number;
  dealIn?: boolean;
  cardBack?: CardBackId;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const flipperRef = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      if (!wrapRef.current || !dealIn) return;
      gsap.from(wrapRef.current, {
        y: -220,
        rotateZ: -15,
        opacity: 0,
        duration: 0.6,
        ease: "power2.out",
        delay: dealDelay,
      });
    },
    { scope: wrapRef, dependencies: [] },
  );

  useGSAP(
    () => {
      if (!flipperRef.current) return;
      gsap.to(flipperRef.current, {
        rotateY: faceUp ? 180 : 0,
        duration: 1.05,
        ease: "expo.inOut",
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
        <CardBackView variant={cardBack} />
        <CardFront card={card} />
      </div>
    </div>
  );
}

function CardBackView({ variant }: { variant?: CardBackId }) {
  const back = getCardBack(variant);
  const isLogo = back.id === "logo";
  return (
    <div
      className="absolute inset-0 rounded-xl border border-white/10 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] overflow-hidden"
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        background: back.background,
      }}
    >
      <div
        className="absolute inset-2 rounded-lg opacity-50"
        style={{ backgroundImage: back.pattern }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        {isLogo ? (
          <svg viewBox="0 0 48 48" className="w-2/3 h-2/3 opacity-90">
            <defs>
              <linearGradient id="cba" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#0a2a20" />
              </linearGradient>
              <linearGradient id="cbb" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#7c2d12" />
              </linearGradient>
            </defs>
            <g transform="translate(24 24)">
              <rect
                x="-9"
                y="-12"
                width="18"
                height="24"
                rx="2.4"
                transform="rotate(-18)"
                fill="url(#cba)"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
              />
              <rect
                x="-9"
                y="-12"
                width="18"
                height="24"
                rx="2.4"
                transform="rotate(18) translate(3 0)"
                fill="url(#cbb)"
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="1"
              />
            </g>
          </svg>
        ) : (
          <div
            className="w-8 h-8 rounded-full border"
            style={{ borderColor: back.centerColor }}
          />
        )}
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
      className="absolute inset-0 rounded-xl border border-zinc-200 bg-white shadow-[0_15px_35px_-12px_rgba(0,0,0,0.55)] overflow-hidden"
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        transform: "rotateY(180deg)",
      }}
    >
      <div
        className={`absolute flex flex-col items-center leading-none ${colorClass}`}
        style={{ top: "0.4em", left: "0.4em" }}
      >
        <span className="font-semibold tracking-tight">
          {rankLabel(card.rank)}
        </span>
        <span className="text-[0.8em]">{suitGlyph(card.suit)}</span>
      </div>
      <div
        className={`absolute inset-0 flex items-center justify-center text-[2.4em] leading-none ${colorClass}`}
        aria-hidden
      >
        {suitGlyph(card.suit)}
      </div>
      <div
        className={`absolute flex flex-col items-center leading-none rotate-180 ${colorClass}`}
        style={{ bottom: "0.4em", right: "0.4em" }}
      >
        <span className="font-semibold tracking-tight">
          {rankLabel(card.rank)}
        </span>
        <span className="text-[0.8em]">{suitGlyph(card.suit)}</span>
      </div>
    </div>
  );
}
