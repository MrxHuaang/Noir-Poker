"use client";
import { ChevronUp, Pause, Play, Timer } from "lucide-react";
import { formatChips } from "@/lib/betting";
import type { RoomConfig } from "@/lib/betting";
import {
  formatDuration,
  getLevel,
  levelTimeRemaining,
  type TournamentState,
} from "@/lib/tournament";
import { useCountdown } from "@/hooks/useTimer";

type Props = {
  tournament: TournamentState;
  config: RoomConfig;
  isAdmin: boolean;
  onTogglePause: () => void;
  onAdvanceLevel: () => void;
};

export function TournamentHUD({
  tournament,
  config,
  isAdmin,
  onTogglePause,
  onAdvanceLevel,
}: Props) {
  const level = getLevel(tournament, config);
  const deadline = tournament.paused
    ? null
    : tournament.levelStartedAt + (config.blindLevelDuration ?? 15 * 60_000);
  const remainingTick = useCountdown(deadline);
  const remaining = tournament.paused
    ? tournament.pausedRemaining ?? 0
    : levelTimeRemaining(tournament, config);
  void remainingTick;

  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-zinc-900/90 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl">
      <div className="flex flex-col items-center px-2">
        <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-500 font-black">
          Nivel
        </span>
        <span className="text-lg font-black text-white leading-tight">
          {tournament.currentLevel + 1}
        </span>
      </div>

      <div className="h-8 w-px bg-white/10" />

      <div className="flex flex-col items-center px-2">
        <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-500 font-black">
          Ciegas
        </span>
        <span className="text-lg font-black text-amber-400 tabular-nums leading-tight">
          {formatChips(level.sb)}/{formatChips(level.bb)}
        </span>
        {level.ante > 0 && (
          <span className="text-[10px] text-zinc-500 tabular-nums leading-none">
            ante {formatChips(level.ante)}
          </span>
        )}
      </div>

      <div className="h-8 w-px bg-white/10" />

      <div className="flex items-center gap-1.5 px-2">
        <Timer className={`w-4 h-4 ${tournament.paused ? "text-amber-400" : "text-zinc-400"}`} />
        <span
          className={`text-lg font-black tabular-nums leading-tight ${
            tournament.paused ? "text-amber-300" : "text-white"
          }`}
        >
          {formatDuration(remaining)}
        </span>
      </div>

      {isAdmin && (
        <>
          <div className="h-8 w-px bg-white/10" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onTogglePause}
              disabled={!tournament.started}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed ring-1 ring-white/10 text-zinc-200 transition btn-press"
              title={tournament.paused ? "Reanudar" : "Pausar"}
            >
              {tournament.paused ? (
                <Play className="w-4 h-4" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onAdvanceLevel}
              disabled={!tournament.started}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed ring-1 ring-white/10 text-zinc-200 transition btn-press"
              title="Subir nivel"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
      {!tournament.started && (
        <span className="px-2 py-1 rounded-lg bg-zinc-800 text-[9px] font-black uppercase tracking-widest text-zinc-400">
          Sin iniciar
        </span>
      )}
    </div>
  );
}
