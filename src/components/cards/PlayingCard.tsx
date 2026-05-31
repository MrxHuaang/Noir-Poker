"use client";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { Card } from "@/lib/poker";
import { rankLabel, suitColor, suitGlyph } from "@/lib/poker";
import { getCardBack, type CardBackId, type CardFaceId } from "@/lib/themes";

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
  cardFace,
}: {
  card?: Card;
  faceUp: boolean;
  size?: Size;
  className?: string;
  flipDelay?: number;
  dealDelay?: number;
  dealIn?: boolean;
  cardBack?: CardBackId;
  cardFace?: CardFaceId;
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
        <CardFront card={card} face={cardFace} />
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

const FACE_BACK_STYLE = {
  backfaceVisibility: "hidden" as const,
  WebkitBackfaceVisibility: "hidden" as const,
  transform: "rotateY(180deg)",
};

function CardFront({ card, face }: { card?: Card; face?: CardFaceId }) {
  if (!card) {
    return (
      <div
        className="absolute inset-0 rounded-xl border border-dashed border-white/15 bg-white/[0.02]"
        style={FACE_BACK_STYLE}
      />
    );
  }
  if (face === "dark") return <CardFrontDark card={card} />;
  if (face === "neon") return <CardFrontNeon card={card} />;
  if (face === "noir") return <CardFrontShowdown card={card} />;
  return <CardFrontClassic card={card} />;
}

function CardFrontClassic({ card }: { card: Card }) {
  const color = suitColor(card.suit);
  const colorClass = color === "red" ? "text-rose-600" : "text-zinc-900";
  return (
    <div
      className="absolute inset-0 rounded-xl border border-zinc-200 bg-white shadow-[0_15px_35px_-12px_rgba(0,0,0,0.55)] overflow-hidden"
      style={FACE_BACK_STYLE}
    >
      <div
        className={`absolute flex flex-col items-center leading-none ${colorClass}`}
        style={{ top: "0.4em", left: "0.4em" }}
      >
        <span className="font-semibold tracking-tight">{rankLabel(card.rank)}</span>
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
        <span className="font-semibold tracking-tight">{rankLabel(card.rank)}</span>
        <span className="text-[0.8em]">{suitGlyph(card.suit)}</span>
      </div>
    </div>
  );
}

function CardFrontDark({ card }: { card: Card }) {
  const isRed = suitColor(card.suit) === "red";
  const clr = isRed ? "#fb7185" : "#e4e4e7";
  const glow = isRed ? "rgba(251,113,133,0.22)" : "rgba(228,228,231,0.10)";
  return (
    <div
      className="absolute inset-0 rounded-xl overflow-hidden"
      style={{
        ...FACE_BACK_STYLE,
        background: "#0b0d14",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 12px_32px_-10px rgba(0,0,0,0.8)",
      }}
    >
      <div
        className="absolute flex flex-col items-center leading-none font-semibold"
        style={{ top: "0.38em", left: "0.38em", color: clr }}
      >
        <span className="tracking-tight">{rankLabel(card.rank)}</span>
        <span className="text-[0.75em]">{suitGlyph(card.suit)}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <div
          className="absolute w-12 h-12 rounded-full"
          style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)` }}
        />
        <span className="relative text-[2.2em] leading-none" style={{ color: clr }}>
          {suitGlyph(card.suit)}
        </span>
      </div>
      <div
        className="absolute flex flex-col items-center leading-none font-semibold rotate-180"
        style={{ bottom: "0.38em", right: "0.38em", color: clr }}
      >
        <span className="tracking-tight">{rankLabel(card.rank)}</span>
        <span className="text-[0.75em]">{suitGlyph(card.suit)}</span>
      </div>
    </div>
  );
}

function CardFrontNeon({ card }: { card: Card }) {
  const isRed = suitColor(card.suit) === "red";
  const clr = isRed ? "#f43f5e" : "#34d399";
  const border = isRed ? "rgba(244,63,94,0.35)" : "rgba(52,211,153,0.35)";
  const glow = isRed ? "rgba(244,63,94,0.28)" : "rgba(52,211,153,0.25)";
  const textGlow = isRed
    ? "0 0 8px rgba(244,63,94,0.7), 0 0 20px rgba(244,63,94,0.3)"
    : "0 0 8px rgba(52,211,153,0.7), 0 0 20px rgba(52,211,153,0.3)";
  return (
    <div
      className="absolute inset-0 rounded-xl overflow-hidden"
      style={{
        ...FACE_BACK_STYLE,
        background: "#06080f",
        border: `1px solid ${border}`,
        boxShadow: `0 0 0 1px ${border} inset, 0 12px 32px -10px rgba(0,0,0,0.9)`,
      }}
    >
      <div
        className="absolute flex flex-col items-center leading-none font-bold"
        style={{ top: "0.35em", left: "0.35em", color: clr, textShadow: textGlow }}
      >
        <span className="tracking-tight">{rankLabel(card.rank)}</span>
        <span className="text-[0.72em]">{suitGlyph(card.suit)}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <div
          className="absolute w-14 h-14 rounded-full"
          style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 65%)` }}
        />
        <span
          className="relative text-[2.3em] leading-none"
          style={{ color: clr, textShadow: textGlow }}
        >
          {suitGlyph(card.suit)}
        </span>
      </div>
      <div
        className="absolute flex flex-col items-center leading-none font-bold rotate-180"
        style={{ bottom: "0.35em", right: "0.35em", color: clr, textShadow: textGlow }}
      >
        <span className="tracking-tight">{rankLabel(card.rank)}</span>
        <span className="text-[0.72em]">{suitGlyph(card.suit)}</span>
      </div>
    </div>
  );
}

function CardFrontShowdown({ card }: { card: Card }) {
  const isRed = suitColor(card.suit) === "red";
  const clr = isRed ? "#fbbf24" : "#34d399";
  const glow = isRed ? "rgba(251,191,36,0.2)" : "rgba(52,211,153,0.2)";
  return (
    <div
      className="absolute inset-0 rounded-xl overflow-hidden"
      style={{
        ...FACE_BACK_STYLE,
        background: "linear-gradient(160deg, #071510 0%, #04090b 100%)",
        border: "1px solid rgba(52,211,153,0.12)",
        boxShadow: "0 12px 32px -10px rgba(0,0,0,0.85)",
      }}
    >
      {/* subtle bottom brand stripe */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, transparent, ${clr}55, transparent)` }}
      />
      <div
        className="absolute flex flex-col items-center leading-none font-bold"
        style={{ top: "0.35em", left: "0.35em", color: clr }}
      >
        <span className="tracking-tight">{rankLabel(card.rank)}</span>
        <span className="text-[0.72em]">{suitGlyph(card.suit)}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <div
          className="absolute w-14 h-14 rounded-full"
          style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 65%)` }}
        />
        <span className="relative text-[2.3em] leading-none" style={{ color: clr }}>
          {suitGlyph(card.suit)}
        </span>
      </div>
      <div
        className="absolute flex flex-col items-center leading-none font-bold rotate-180"
        style={{ bottom: "0.35em", right: "0.35em", color: clr }}
      >
        <span className="tracking-tight">{rankLabel(card.rank)}</span>
        <span className="text-[0.72em]">{suitGlyph(card.suit)}</span>
      </div>
    </div>
  );
}
