"use client";
import { CARD_FACE_LIST, type CardFaceId } from "@/lib/themes";
import { Check } from "lucide-react";

type Props = {
  value: CardFaceId;
  onChange: (id: CardFaceId) => void;
};

const PREVIEW_CONFIGS: Record<
  CardFaceId,
  { bg: string; border: string; rankColor: string; glowColor: string; label: string }
> = {
  classic: {
    bg: "#ffffff",
    border: "rgba(0,0,0,0.12)",
    rankColor: "#be123c",
    glowColor: "transparent",
    label: "A",
  },
  dark: {
    bg: "#0b0d14",
    border: "rgba(255,255,255,0.07)",
    rankColor: "#fb7185",
    glowColor: "rgba(251,113,133,0.18)",
    label: "A",
  },
  neon: {
    bg: "#06080f",
    border: "rgba(244,63,94,0.4)",
    rankColor: "#f43f5e",
    glowColor: "rgba(244,63,94,0.25)",
    label: "A",
  },
  noir: {
    bg: "linear-gradient(160deg,#1a1a1e,#050506)",
    border: "rgba(224,177,94,0.30)",
    rankColor: "#e0b15e",
    glowColor: "rgba(224,177,94,0.22)",
    label: "A",
  },
};

export function CardFacePicker({ value, onChange }: Props) {
  return (
    <ul className="grid grid-cols-4 gap-2">
      {CARD_FACE_LIST.map((face) => {
        const selected = face.id === value;
        const cfg = PREVIEW_CONFIGS[face.id];
        return (
          <li key={face.id} className="flex flex-col gap-1 items-center">
            <button
              type="button"
              onClick={() => onChange(face.id)}
              title={face.label}
              aria-label={face.label}
              className={`relative w-full aspect-[2/3] rounded-lg ring-1 transition overflow-hidden ${
                selected ? "ring-emerald-400/70" : "ring-white/10 hover:ring-white/30"
              }`}
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              {/* radial glow behind center suit */}
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                aria-hidden
              >
                <div
                  className="absolute w-6 h-6 rounded-full"
                  style={{ background: `radial-gradient(circle, ${cfg.glowColor} 0%, transparent 70%)` }}
                />
                <span
                  className="relative text-[1.1em] leading-none select-none"
                  style={{ color: cfg.rankColor }}
                >
                  ♥
                </span>
              </div>
              {/* corner rank */}
              <span
                className="absolute top-[0.3em] left-[0.3em] text-[0.6em] font-bold leading-none"
                style={{ color: cfg.rankColor }}
              >
                {cfg.label}
              </span>
              {selected ? (
                <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 text-emerald-950 flex items-center justify-center">
                  <Check className="w-2 h-2" />
                </div>
              ) : null}
            </button>
            <span className="text-[10px] text-zinc-400 truncate w-full text-center">
              {face.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
