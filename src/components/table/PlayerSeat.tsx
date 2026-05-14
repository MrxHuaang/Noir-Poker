"use client";
import { Crown, X, RotateCcw } from "lucide-react";
import type { Seat } from "@/lib/poker";
import { Avatar } from "@/components/players/Avatar";
import { HoleCards } from "./HoleCards";
import type { CardBackId, CardFaceId } from "@/lib/themes";

export function PlayerSeat({
  seat,
  isWinner,
  showdownDone,
  onToggle,
  onFoldToggle,
  style,
  cardBack,
  cardFace,
}: {
  seat: Seat;
  isWinner: boolean;
  showdownDone: boolean;
  onToggle: () => void;
  onFoldToggle: () => void;
  style?: React.CSSProperties;
  cardBack?: CardBackId;
  cardFace?: CardFaceId;
}) {
  return (
    <div
      className="player-seat absolute flex flex-col items-center gap-1.5"
      style={style}
    >
      {isWinner ? (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-300 text-amber-950 text-[11px] font-medium shadow-[0_8px_24px_-6px_rgba(252,211,77,0.55)]">
          <Crown className="w-3 h-3" />
          Ganador
        </span>
      ) : null}
      <div
        className={`relative ${seat.folded ? "opacity-40 grayscale" : ""} ${isWinner ? "drop-shadow-[0_10px_30px_rgba(252,211,77,0.35)]" : ""}`}
      >
        <HoleCards seat={seat} onToggle={onToggle} cardBack={cardBack} cardFace={cardFace} />
        {seat.folded ? (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="px-2 py-0.5 rounded-full bg-black/70 text-rose-300 text-[10px] tracking-[0.2em] uppercase ring-1 ring-rose-300/30">
              Fold
            </span>
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm ring-1 ring-white/10">
        <Avatar seed={seat.player.seed} size={28} />
        <span className="text-sm text-zinc-100 max-w-[10rem] truncate">
          {seat.player.name}
        </span>
        {!showdownDone ? (
          <button
            type="button"
            onClick={onFoldToggle}
            className={`p-1 rounded-full ring-1 transition ${
              seat.folded
                ? "bg-white/5 ring-white/10 text-zinc-200 hover:bg-white/10"
                : "bg-transparent ring-white/10 text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10"
            }`}
            title={seat.folded ? "Reactivar" : "Foldear"}
            aria-label={seat.folded ? "Reactivar" : "Foldear"}
          >
            {seat.folded ? (
              <RotateCcw className="w-3 h-3" />
            ) : (
              <X className="w-3 h-3" />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}
