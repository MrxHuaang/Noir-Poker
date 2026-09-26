import { describe, it, expect } from "vitest";
import {
  configForHand,
  getLevel,
  isLastLevel,
  knockoutsFromHand,
  levelTimeRemaining,
  initTournamentState,
  recordKnockout,
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

describe("configForHand / knockoutsFromHand", () => {
  it("deals each hand with the current level's blinds and ante", () => {
    const st = { ...initTournamentState(), currentLevel: 3 };
    const cfg = configForHand(tcfg, st);
    expect(cfg.smallBlind).toBe(TOURNAMENT_LEVELS[3].sb);
    expect(cfg.bigBlind).toBe(TOURNAMENT_LEVELS[3].bb);
    expect(cfg.ante).toBe(TOURNAMENT_LEVELS[3].ante);
    // Cash games keep the room blinds.
    expect(configForHand(DEFAULT_CONFIG, st)).toBe(DEFAULT_CONFIG);
    expect(isLastLevel({ ...st, currentLevel: TOURNAMENT_LEVELS.length - 1 }, tcfg)).toBe(true);
    expect(isLastLevel(st, tcfg)).toBe(false);
  });

  it("records busted seats smallest starting stack first, departed players excluded", () => {
    const mk = (id: string, chips: number, totalBet: number) => ({
      id, name: id, seed: id, ownerUid: id, chips, bet: 0, totalBet,
      revealed: false, status: "all-in" as const, timeBank: 0, turnDeadline: null,
    });
    const before = [mk("big", 0, 900), mk("small", 0, 200), mk("winner", 0, 900), mk("gone", 0, 300)];
    const ids = knockoutsFromHand(before, { big: 0, small: 0, winner: 2300, gone: 0 }, new Set(["gone"]));
    expect(ids).toEqual(["small", "big"]);
    const t = ids.reduce(recordKnockout, initTournamentState());
    expect(t.knockouts).toEqual(["small", "big"]);
  });
});
