import type { BlindLevel, RoomConfig } from "./betting";

export type TournamentState = {
  currentLevel: number;
  levelStartedAt: number;
  paused: boolean;
  pausedAt: number | null;
  pausedRemaining: number | null;
  knockouts: string[];
  finalRanking: string[];
};

export function getLevel(
  state: TournamentState,
  config: RoomConfig,
): BlindLevel {
  const levels = config.blindLevels ?? [];
  const idx = Math.min(state.currentLevel, levels.length - 1);
  return (
    levels[idx] ?? {
      sb: config.smallBlind,
      bb: config.bigBlind,
      ante: config.ante,
    }
  );
}

export function levelTimeRemaining(
  state: TournamentState,
  config: RoomConfig,
  now = Date.now(),
): number {
  const duration = config.blindLevelDuration ?? 15 * 60_000;
  if (state.paused && state.pausedRemaining !== null) {
    return state.pausedRemaining;
  }
  const elapsed = now - state.levelStartedAt;
  return Math.max(0, duration - elapsed);
}

export function shouldAdvanceLevel(
  state: TournamentState,
  config: RoomConfig,
  now = Date.now(),
): boolean {
  if (state.paused) return false;
  return levelTimeRemaining(state, config, now) === 0;
}

export function advanceLevel(state: TournamentState): TournamentState {
  return {
    ...state,
    currentLevel: state.currentLevel + 1,
    levelStartedAt: Date.now(),
    pausedRemaining: null,
  };
}

export function pauseTournament(
  state: TournamentState,
  config: RoomConfig,
  now = Date.now(),
): TournamentState {
  return {
    ...state,
    paused: true,
    pausedAt: now,
    pausedRemaining: levelTimeRemaining(state, config, now),
  };
}

export function resumeTournament(state: TournamentState): TournamentState {
  return {
    ...state,
    paused: false,
    pausedAt: null,
    levelStartedAt: state.pausedRemaining !== null
      ? Date.now() - ((state.pausedAt ?? Date.now()) - state.levelStartedAt)
      : Date.now(),
  };
}

export function recordKnockout(
  state: TournamentState,
  seatId: string,
): TournamentState {
  if (state.knockouts.includes(seatId)) return state;
  return {
    ...state,
    knockouts: [...state.knockouts, seatId],
  };
}

export function initTournamentState(): TournamentState {
  return {
    currentLevel: 0,
    levelStartedAt: Date.now(),
    paused: false,
    pausedAt: null,
    pausedRemaining: null,
    knockouts: [],
    finalRanking: [],
  };
}

export function formatDuration(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
