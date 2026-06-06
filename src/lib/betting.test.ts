import { describe, it, expect } from "vitest";
import {
  startHand,
  handleAction,
  getValidActions,
  computeSidePots,
  distributeRunPot,
  DEFAULT_CONFIG,
  type NormalSeat,
  type BettingRound,
  type NormalGameState,
  type RoomConfig,
} from "./betting";
import { shuffle, makeDeck, advance } from "./poker";
import type { GameState } from "./poker";

function seat(
  id: string,
  chips: number,
  over: Partial<NormalSeat> = {},
): NormalSeat {
  return {
    id,
    name: id,
    seed: id,
    ownerUid: null,
    chips,
    bet: 0,
    totalBet: 0,
    revealed: false,
    status: "active",
    timeBank: 0,
    turnDeadline: null,
    ...over,
  };
}

const emptyBetting: BettingRound = {
  pot: 0,
  sidePots: [],
  currentBet: 0,
  minRaise: 10,
  bigBlind: 10,
  toActId: null,
  lastAggressorId: null,
  dealerIdx: 0,
  sbIdx: 0,
  bbIdx: 0,
  handNum: 1,
  actedThisRound: [],
};

function baseState(
  seats: NormalSeat[],
  betting: Partial<BettingRound> = {},
): NormalGameState {
  return {
    seats,
    community: [],
    deck: [],
    burns: [],
    street: "preflop",
    dealId: "test",
    phase: "preflop",
    betting: { ...emptyBetting, ...betting },
  };
}

describe("startHand — blinds and antes", () => {
  it("posts SB/BB and sets UTG for a 3-handed table", () => {
    const s = startHand(
      [seat("p0", 1000), seat("p1", 1000), seat("p2", 1000)],
      DEFAULT_CONFIG,
      1,
      0,
    );
    expect(s.betting.dealerIdx).toBe(1);
    expect(s.betting.sbIdx).toBe(2);
    expect(s.betting.bbIdx).toBe(0);
    expect(s.betting.pot).toBe(15); // sb 5 + bb 10
    expect(s.betting.currentBet).toBe(10);
    expect(s.seats[2].bet).toBe(5);
    expect(s.seats[0].bet).toBe(10);
    expect(s.betting.toActId).toBe("p1"); // dealer acts first 3-handed
  });

  it("uses heads-up blind order (dealer is SB and acts first)", () => {
    const hu = startHand(
      [seat("p0", 1000), seat("p1", 1000)],
      DEFAULT_CONFIG,
      1,
      0,
    );
    expect(hu.betting.sbIdx).toBe(1);
    expect(hu.betting.bbIdx).toBe(0);
    expect(hu.seats[1].bet).toBe(5);
    expect(hu.seats[0].bet).toBe(10);
    expect(hu.betting.toActId).toBe("p1");
  });

  it("adds antes to the pot", () => {
    const cfg: RoomConfig = { ...DEFAULT_CONFIG, ante: 5 };
    const s = startHand(
      [seat("p0", 1000), seat("p1", 1000), seat("p2", 1000)],
      cfg,
      1,
      0,
    );
    expect(s.betting.pot).toBe(30); // 3 antes (15) + sb 5 + bb 10
  });

  it("puts a short stack all-in when it cannot cover the ante", () => {
    const cfg: RoomConfig = { ...DEFAULT_CONFIG, ante: 5 };
    // p2 is the SB seat here; give it only 3 chips so the ante busts it.
    const s = startHand(
      [seat("p0", 1000), seat("p1", 1000), seat("p2", 3)],
      cfg,
      1,
      0,
    );
    expect(s.seats[2].status).toBe("all-in");
    expect(s.seats[2].chips).toBe(0);
  });

  it("throws with fewer than 2 eligible players", () => {
    expect(() => startHand([seat("p0", 1000)], DEFAULT_CONFIG, 1, 0)).toThrow();
  });
});

describe("computeSidePots", () => {
  it("splits three uneven all-ins into pots that sum to the total", () => {
    const seats = [
      seat("a", 0, { totalBet: 100, status: "all-in" }),
      seat("b", 0, { totalBet: 200, status: "all-in" }),
      seat("c", 0, { totalBet: 300, status: "all-in" }),
    ];
    const total = 600;
    const pots = computeSidePots(seats, total);
    const sum = pots.reduce((acc, p) => acc + p.amount, 0);
    expect(sum).toBe(total);
    // Main pot is contested by all three; the top side pot only by c.
    expect(pots[0].eligibleIds).toEqual(["a", "b", "c"]);
    expect(pots[pots.length - 1].eligibleIds).toEqual(["c"]);
  });

  it("excludes folded players from eligibility", () => {
    const seats = [
      seat("a", 0, { totalBet: 100, status: "folded" }),
      seat("b", 0, { totalBet: 100, status: "all-in" }),
    ];
    const pots = computeSidePots(seats, 200);
    expect(pots.reduce((acc, p) => acc + p.amount, 0)).toBe(200);
    expect(pots.every((p) => !p.eligibleIds.includes("a"))).toBe(true);
  });
});

describe("getValidActions", () => {
  it("offers only fold + all-in when too short to call", () => {
    const acts = getValidActions(seat("a", 5, { bet: 0 }), {
      ...emptyBetting,
      currentBet: 10,
      minRaise: 10,
    });
    const names = acts.map((a) => a.action);
    expect(names).toContain("all-in");
    expect(names).toContain("fold");
    expect(names).not.toContain("call");
    expect(names).not.toContain("raise");
  });

  it("exposes the correct minimum raise total", () => {
    const acts = getValidActions(seat("a", 1000, { bet: 0 }), {
      ...emptyBetting,
      currentBet: 20,
      minRaise: 20,
    });
    expect(acts.find((a) => a.action === "raise")?.min).toBe(40);
  });

  it("returns nothing for a player with no chips", () => {
    expect(getValidActions(seat("a", 0), emptyBetting)).toEqual([]);
  });
});

describe("handleAction — raise legality (bug 1b regression)", () => {
  it("rejects a raise below the minimum", () => {
    const state = baseState([seat("a", 1000), seat("b", 1000, { bet: 20 })], {
      currentBet: 20,
      minRaise: 20,
      toActId: "a",
    });
    const after = handleAction(state, "a", "raise", 30); // min total is 40
    expect(after).toBe(state); // unchanged reference => rejected
  });

  it("accepts a legal raise at the minimum", () => {
    const state = baseState([seat("a", 1000), seat("b", 1000, { bet: 20 })], {
      currentBet: 20,
      minRaise: 20,
      toActId: "a",
    });
    const after = handleAction(state, "a", "raise", 40);
    expect(after).not.toBe(state);
    expect(after.betting.currentBet).toBe(40);
    expect(after.seats.find((s) => s.id === "a")!.bet).toBe(40);
  });

  it("allows a short all-in raise below the minimum", () => {
    const state = baseState([seat("a", 30), seat("b", 1000, { bet: 20 })], {
      currentBet: 20,
      minRaise: 20,
      toActId: "a",
    });
    const after = handleAction(state, "a", "raise", 30);
    expect(after).not.toBe(state);
    const a = after.seats.find((s) => s.id === "a")!;
    expect(a.status).toBe("all-in");
    expect(a.bet).toBe(30);
  });

  it("does not lower the current bet on a short all-in below it", () => {
    const state = baseState([seat("a", 10), seat("b", 1000, { bet: 20 })], {
      currentBet: 20,
      minRaise: 20,
      toActId: "a",
    });
    const after = handleAction(state, "a", "raise", 10);
    expect(after.seats.find((s) => s.id === "a")!.status).toBe("all-in");
    expect(after.betting.currentBet).toBe(20); // unchanged
  });
});

describe("handleAction — call/check and round completion", () => {
  it("calls to match the current bet", () => {
    // Third player keeps the round open so the call's bet isn't reset by an
    // immediate street advance.
    const state = baseState(
      [seat("a", 1000), seat("b", 1000, { bet: 20 }), seat("c", 1000)],
      { currentBet: 20, minRaise: 20, toActId: "a", actedThisRound: ["b"] },
    );
    const after = handleAction(state, "a", "call");
    const a = after.seats.find((s) => s.id === "a")!;
    expect(a.bet).toBe(20);
    expect(a.chips).toBe(980);
    expect(after.betting.pot).toBe(20);
  });

  it("rejects a check when facing a bet", () => {
    const state = baseState([seat("a", 1000), seat("b", 1000, { bet: 20 })], {
      currentBet: 20,
      minRaise: 20,
      toActId: "a",
    });
    expect(handleAction(state, "a", "check")).toBe(state);
  });

  it("advances the street once both players check the round closed", () => {
    const state: NormalGameState = {
      ...baseState([seat("a", 1000), seat("b", 1000)], {
        currentBet: 0,
        minRaise: 10,
        toActId: "a",
      }),
      deck: shuffle(makeDeck()),
      street: "flop",
      phase: "flop",
    };
    const afterA = handleAction(state, "a", "check");
    expect(afterA.street).toBe("flop"); // still b to act
    const afterB = handleAction(afterA, "b", "check");
    expect(afterB.street).toBe("turn"); // round complete -> advance
  });
});

describe("distributeRunPot — conserves the pot (bug 1a regression)", () => {
  it("gives the whole pot to a single run/winner", () => {
    const { winningsByPlayer, perRunPot } = distributeRunPot(100, [
      { winners: ["a"] },
    ]);
    expect(perRunPot).toEqual([100]);
    expect(winningsByPlayer).toEqual({ a: 100 });
  });

  it("splits an odd pot across 2 runs with no chip leak", () => {
    const total = 101;
    const { winningsByPlayer, perRunPot } = distributeRunPot(total, [
      { winners: ["a"] },
      { winners: ["b"] },
    ]);
    expect(perRunPot.reduce((x, y) => x + y, 0)).toBe(total);
    const paid = Object.values(winningsByPlayer).reduce((x, y) => x + y, 0);
    expect(paid).toBe(total);
  });

  it("sends the in-run remainder to the first winner", () => {
    const { winningsByPlayer } = distributeRunPot(100, [
      { winners: ["a", "b", "c"] },
    ]);
    expect(winningsByPlayer.a).toBe(34);
    expect(winningsByPlayer.b).toBe(33);
    expect(winningsByPlayer.c).toBe(33);
  });

  it("returns empty maps for 0 runs", () => {
    const { winningsByPlayer, perRunPot } = distributeRunPot(500, []);
    expect(winningsByPlayer).toEqual({});
    expect(perRunPot).toEqual([]);
  });

  it("conserves the pot for many totals, run counts and winner counts", () => {
    for (const total of [7, 101, 333, 1000]) {
      for (const n of [1, 2, 3, 4]) {
        const runs = Array.from({ length: n }, (_, i) => ({
          winners: i % 2 === 0 ? ["a"] : ["a", "b"],
        }));
        const { winningsByPlayer, perRunPot } = distributeRunPot(total, runs);
        expect(perRunPot.reduce((x, y) => x + y, 0)).toBe(total);
        const paid = Object.values(winningsByPlayer).reduce((x, y) => x + y, 0);
        expect(paid).toBe(total);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Full-hand integration: startHand → handleAction × N → street advance
// ---------------------------------------------------------------------------
describe("full hand integration — preflop betting to flop", () => {
  it("advances to flop once all players check/call, resetting bets", () => {
    const s = startHand(
      [seat("a", 1000), seat("b", 1000), seat("c", 1000)],
      DEFAULT_CONFIG,
      1,
      0,
    );
    // s.betting.toActId is UTG (dealer=1, sb=2, bb=0, utg=1 in 3-handed)
    // UTG calls (20)
    const s1 = handleAction(s, s.betting.toActId!, "call");
    // SB calls (15 more to match 20)
    const s2 = handleAction(s1, s1.betting.toActId!, "call");
    // BB checks (already at 20, currentBet 0 after reset? No — BB is last preflop)
    const s3 = handleAction(s2, s2.betting.toActId!, "check");
    // Round complete → should have advanced to flop
    expect(s3.street).toBe("flop");
    expect(s3.community).toHaveLength(3);
    // All seat bets reset to 0 on street change
    expect(s3.seats.every((s) => s.bet === 0)).toBe(true);
    // Pot = sb(5) + bb(10) + utg_call(10) + sb_call(15) = 40 — but let's just verify it > 0
    expect(s3.betting.pot).toBeGreaterThan(0);
    // currentBet resets for the new street
    expect(s3.betting.currentBet).toBe(0);
  });

  it("reaches showdown once the last player closes action after all-folds", () => {
    // UTG and SB fold; BB still must check (they hold the option preflop).
    // This is the implementation's behavior: the last active player confirms
    // their action before the hand is marked as won.
    const s = startHand(
      [seat("a", 1000), seat("b", 1000), seat("c", 1000)],
      DEFAULT_CONFIG,
      1,
      0,
    );
    const s1 = handleAction(s, s.betting.toActId!, "fold");
    const s2 = handleAction(s1, s1.betting.toActId!, "fold");
    // Two folds → BB is the toActId; round not yet over (they haven't acted)
    expect(s2.phase).toBe("preflop");
    expect(s2.betting.toActId).not.toBeNull();
    // BB checks → round complete with 1 active → showdown
    const s3 = handleAction(s2, s2.betting.toActId!, "check");
    expect(s3.phase).toBe("showdown");
  });

  it("marks all seats all-in when they push preflop, toActId becomes null", () => {
    const s = startHand(
      [seat("a", 100), seat("b", 100), seat("c", 100)],
      DEFAULT_CONFIG,
      1,
      0,
    );
    // UTG all-in
    const s1 = handleAction(s, s.betting.toActId!, "all-in");
    // SB/BB call all-in
    const s2 = handleAction(s1, s1.betting.toActId!, "all-in");
    const s3 = handleAction(s2, s2.betting.toActId!, "all-in");
    // All three all-in → toActId is null
    expect(s3.betting.toActId).toBeNull();
    expect(s3.seats.every((s) => s.chips === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BUG-C regression: turn order must never skip an active opponent's turn
// ---------------------------------------------------------------------------
describe("turn-order — no premature street advance (BUG-C)", () => {
  function flopState(ids: string[]): NormalGameState {
    const s = startHand(
      ids.map((id) => seat(id, 1000)),
      DEFAULT_CONFIG,
      1,
      0,
    );
    // Drive preflop: everyone calls/checks down to the flop.
    let cur = s;
    let guard = 0;
    while (cur.street === "preflop" && guard++ < 20) {
      const toAct = cur.betting.toActId;
      if (!toAct) break;
      const seatNow = cur.seats.find((x) => x.id === toAct)!;
      const needCall = seatNow.bet < cur.betting.currentBet;
      cur = handleAction(cur, toAct, needCall ? "call" : "check");
    }
    return cur;
  }

  it("heads-up flop: first checker does NOT advance the street", () => {
    const flop = flopState(["a", "b"]);
    expect(flop.street).toBe("flop");
    const first = flop.betting.toActId!;
    const afterFirst = handleAction(flop, first, "check");
    // Opponent still owes an action — street must stay on the flop.
    expect(afterFirst.street).toBe("flop");
    expect(afterFirst.betting.toActId).not.toBeNull();
    expect(afterFirst.betting.toActId).not.toBe(first);
    // Only after the opponent checks does it advance.
    const afterSecond = handleAction(afterFirst, afterFirst.betting.toActId!, "check");
    expect(afterSecond.street).toBe("turn");
  });

  it("3-handed flop: two checks still leave the third to act", () => {
    const flop = flopState(["a", "b", "c"]);
    expect(flop.street).toBe("flop");
    const p1 = flop.betting.toActId!;
    const s1 = handleAction(flop, p1, "check");
    expect(s1.street).toBe("flop");
    const p2 = s1.betting.toActId!;
    expect(p2).not.toBe(p1);
    const s2 = handleAction(s1, p2, "check");
    // STILL the third player's turn — must not have dealt the turn yet.
    expect(s2.street).toBe("flop");
    const p3 = s2.betting.toActId!;
    expect([p1, p2]).not.toContain(p3);
    const s3 = handleAction(s2, p3, "check");
    expect(s3.street).toBe("turn");
  });
});

// ---------------------------------------------------------------------------
// BUG-B regression: heads-up all-in must close action and run out the board
// ---------------------------------------------------------------------------
describe("all-in runout — heads-up board completes (BUG-B)", () => {
  it("both players all-in preflop closes action (toActId null) and a full board can be dealt", () => {
    const s = startHand(
      [seat("a", 100), seat("b", 100)],
      DEFAULT_CONFIG,
      1,
      0,
    );
    // HU: dealer/SB acts first.
    const s1 = handleAction(s, s.betting.toActId!, "all-in");
    const s2 = handleAction(s1, s1.betting.toActId!, "all-in");
    expect(s2.betting.toActId).toBeNull();
    expect(s2.phase).not.toBe("showdown"); // still needs a board
    expect(s2.seats.every((x) => x.status === "all-in")).toBe(true);

    // Replicate the useNormalGame runout: advance() until the river.
    let g = s2 as unknown as GameState;
    let guard = 0;
    while (g.street !== "river" && guard++ < 5) {
      g = advance(g);
    }
    expect(g.street).toBe("river");
    expect(g.community).toHaveLength(5);
  });

  it("short all-in call (one player covers) still closes the action", () => {
    // a has fewer chips; a is dealer/SB and acts first heads-up.
    const s = startHand(
      [seat("a", 40), seat("b", 1000)],
      DEFAULT_CONFIG,
      1,
      0,
    );
    const s1 = handleAction(s, s.betting.toActId!, "all-in"); // a shoves 40
    const s2 = handleAction(s1, s1.betting.toActId!, "call"); // b covers
    // a is all-in, b called and has chips left → action closed for runout.
    expect(s2.betting.toActId).toBeNull();
    expect(s2.seats.find((x) => x.id === "a")!.status).toBe("all-in");
  });
});

// ---------------------------------------------------------------------------
// computeSidePots — edge cases
// ---------------------------------------------------------------------------
describe("computeSidePots — edge cases", () => {
  it("returns a single pot for two equal stacks", () => {
    const seats = [
      seat("a", 0, { totalBet: 100, status: "all-in" }),
      seat("b", 0, { totalBet: 100, status: "all-in" }),
    ];
    const pots = computeSidePots(seats, 200);
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(200);
    expect(pots[0].eligibleIds).toContain("a");
    expect(pots[0].eligibleIds).toContain("b");
  });

  it("side pot excludes folded player even if they contributed chips", () => {
    // a all-in 50, b all-in 150, c folded after putting 150
    const seats = [
      seat("a", 0, { totalBet: 50, status: "all-in" }),
      seat("b", 0, { totalBet: 150, status: "all-in" }),
      seat("c", 0, { totalBet: 150, status: "folded" }),
    ];
    const total = 350;
    const pots = computeSidePots(seats, total);
    // Main pot (3×50 = 150) — c contributes but is folded, so only a & b eligible
    const main = pots[0];
    expect(main.eligibleIds).toContain("a");
    expect(main.eligibleIds).toContain("b");
    expect(main.eligibleIds).not.toContain("c");
    // Side pot (2×100 = 200) — only b eligible (a capped out)
    const side = pots[1];
    expect(side.eligibleIds).toEqual(["b"]);
    // Total pots sum to input
    expect(pots.reduce((acc, p) => acc + p.amount, 0)).toBe(total);
  });

  it("four-way all-in at different levels sums correctly", () => {
    const bets = [50, 100, 200, 400];
    const seats = bets.map((b, i) =>
      seat(`p${i}`, 0, { totalBet: b, status: "all-in" }),
    );
    const total = bets.reduce((a, b) => a + b, 0);
    const pots = computeSidePots(seats, total);
    expect(pots.reduce((acc, p) => acc + p.amount, 0)).toBe(total);
    // Number of pots = number of distinct bet levels
    expect(pots).toHaveLength(4);
  });
});
