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
    <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-ink-850/90 backdrop-blur-xl ring-1 ring-line shadow-2xl">
      <div className="flex flex-col items-center px-2">
        <span className="eyebrow text-[11px]">
          Nivel
        </span>
        <span className="text-lg font-semibold text-primary leading-tight">
          {tournament.currentLevel + 1}
        </span>
      </div>

      <div className="h-8 w-px bg-bone/[0.07]" />

      <div className="flex flex-col items-center px-2">
        <span className="eyebrow text-[11px]">
          Ciegas
        </span>
        <span className="text-lg font-semibold text-accent-400 tabular-nums leading-tight">
          {formatChips(level.sb)}/{formatChips(level.bb)}
        </span>
        {level.ante > 0 && (
          <span className="text-[10px] text-muted tabular-nums leading-none">
            ante {formatChips(level.ante)}
          </span>
        )}
      </div>

      <div className="h-8 w-px bg-bone/[0.07]" />

      <div className="flex items-center gap-1.5 px-2">
        <Timer className={`w-4 h-4 ${tournament.paused ? "text-accent-400" : "text-secondary"}`} />
        <span
          className={`text-lg font-semibold tabular-nums leading-tight ${
            tournament.paused ? "text-accent-300" : "text-primary"
          }`}
        >
          {formatDuration(remaining)}
        </span>
      </div>

      {isAdmin && (
        <>
          <div className="h-8 w-px bg-bone/[0.07]" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onTogglePause}
              disabled={!tournament.started}
              className="p-2 rounded-xl bg-bone/[0.04] hover:bg-bone/[0.07] disabled:opacity-30 disabled:cursor-not-allowed ring-1 ring-line text-primary transition btn-press"
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
              className="p-2 rounded-xl bg-bone/[0.04] hover:bg-bone/[0.07] disabled:opacity-30 disabled:cursor-not-allowed ring-1 ring-line text-primary transition btn-press"
              title="Subir nivel"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
      {!tournament.started && (
        <span className="eyebrow text-[11px] px-2 py-1 rounded-lg bg-ink-800">
          Sin iniciar
        </span>
      )}
    </div>
  );
}
