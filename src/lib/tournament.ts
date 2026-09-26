import type { BlindLevel, NormalSeat, RoomConfig } from "./betting";

export type TournamentState = {
  currentLevel: number;
  levelStartedAt: number;
  paused: boolean;
  pausedAt: number | null;
  pausedRemaining: number | null;
  knockouts: string[];
  finalRanking: string[];
  started: boolean;
  startedAt: number | null;
  // Late registration window (ms after start) — null disables
  lateRegUntilLevel?: number | null;
  payouts?: number[];
  reentries?: Record<string, number>;
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

// Config with the blinds/ante of the tournament's current level. Outside a
// tournament (or before its state exists) the room config is used as is.
export function configForHand(
  config: RoomConfig,
  tournament: TournamentState | null | undefined,
): RoomConfig {
  if (config.mode !== "torneo" || !tournament) return config;
  const level = getLevel(tournament, config);
  return { ...config, smallBlind: level.sb, bigBlind: level.bb, ante: level.ante };
}

// True once the current level is the last one of the structure (the clock
// stops advancing there; the blinds stay at the top level).
export function isLastLevel(state: TournamentState, config: RoomConfig): boolean {
  const levels = config.blindLevels ?? [];
  return state.currentLevel >= levels.length - 1;
}

// Seats busted by the hand that just settled, in elimination order: when
// several players bust on the same hand the one who started it with fewer
// chips finishes lower, so it is recorded first (the podium reads knockouts
// from last to first).
export function knockoutsFromHand(
  seatsBefore: NormalSeat[],
  chipsAfter: Record<string, number>,
  exclude: ReadonlySet<string> = new Set(),
): string[] {
  return seatsBefore
    .filter((s) => !exclude.has(s.id))
    .map((s) => ({ id: s.id, start: s.chips + s.totalBet }))
    .filter((s) => s.start > 0 && (chipsAfter[s.id] ?? 0) === 0)
    .sort((a, b) => a.start - b.start)
    .map((s) => s.id);
}

export function levelTimeRemaining(
  state: TournamentState,
  config: RoomConfig,
  now = Date.now(),
): number {
  const duration = config.blindLevelDuration ?? 15 * 60_000;
  // Timer frozen until torneo starts
  if (!state.started) return duration;
  if (state.paused && state.pausedRemaining !== null) {
    return state.pausedRemaining;
  }
  const elapsed = now - state.levelStartedAt;
  return Math.max(0, duration - elapsed);
}

export function startTournament(state: TournamentState): TournamentState {
  if (state.started) return state;
  const now = Date.now();
  return {
    ...state,
    started: true,
    startedAt: now,
    levelStartedAt: now,
  };
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
    started: false,
    startedAt: null,
    lateRegUntilLevel: 3,
    payouts: [50, 30, 20],
    reentries: {},
  };
}

export function formatDuration(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
