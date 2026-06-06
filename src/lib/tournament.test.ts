import { describe, it, expect } from "vitest";
import {
  getLevel,
  levelTimeRemaining,
  initTournamentState,
  startTournament,
} from "./tournament";
import { TOURNAMENT_LEVELS, DEFAULT_CONFIG, type RoomConfig } from "./betting";

const tcfg: RoomConfig = {
  ...DEFAULT_CONFIG,
  mode: "torneo",
  blindLevels: TOURNAMENT_LEVELS,
  blindLevelDuration: 15 * 60_000,
};

describe("getLevel", () => {
  it("returns the blind level at the current index", () => {
    const st = { ...initTournamentState(), currentLevel: 2 };
    expect(getLevel(st, tcfg)).toEqual(TOURNAMENT_LEVELS[2]);
  });

  it("caps at the last level when the index runs past the end", () => {
    const st = { ...initTournamentState(), currentLevel: 999 };
    expect(getLevel(st, tcfg)).toEqual(
      TOURNAMENT_LEVELS[TOURNAMENT_LEVELS.length - 1],
    );
  });

  it("exposes an ante at the higher levels", () => {
    const st = { ...initTournamentState(), currentLevel: 9 };
    expect(getLevel(st, tcfg).ante).toBeGreaterThan(0);
  });

  it("falls back to the config blinds when no schedule is set", () => {
    const noLevels: RoomConfig = { ...DEFAULT_CONFIG };
    expect(getLevel(initTournamentState(), noLevels)).toEqual({
      sb: noLevels.smallBlind,
      bb: noLevels.bigBlind,
      ante: noLevels.ante,
    });
  });
});

describe("levelTimeRemaining", () => {
  it("is frozen at the full duration before the tournament starts", () => {
    expect(levelTimeRemaining(initTournamentState(), tcfg, Date.now())).toBe(
      tcfg.blindLevelDuration,
    );
  });

  it("decreases as time elapses within a level", () => {
    const started = startTournament(initTournamentState());
    const now = started.levelStartedAt + 60_000; // one minute in
    expect(levelTimeRemaining(started, tcfg, now)).toBe(
      tcfg.blindLevelDuration! - 60_000,
    );
  });

  it("never goes negative once the level is over", () => {
    const started = startTournament(initTournamentState());
    const now = started.levelStartedAt + tcfg.blindLevelDuration! + 5_000;
    expect(levelTimeRemaining(started, tcfg, now)).toBe(0);
  });
});
