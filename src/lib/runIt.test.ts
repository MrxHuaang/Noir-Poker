import { describe, expect, it } from "vitest";
import type { NormalGameState, NormalSeat } from "./betting";
import { computeSidePots } from "./betting";
import type { Card, Rank, Suit } from "./poker";
import {
  chooseRunCount,
  clampRunCount,
  maxRunCountForState,
  resolveRunItN,
  runOptionsForState,
} from "./runIt";

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit, id: `${rank}${suit}` };
}

function seat(
  id: string,
  totalBet: number,
  status: NormalSeat["status"] = "all-in",
): NormalSeat {
  return {
    id,
    name: id,
    seed: id,
    ownerUid: id,
    chips: 0,
    bet: totalBet,
    totalBet,
    revealed: false,
    status,
    timeBank: 0,
    turnDeadline: null,
  };
}

function state(deck: Card[]): NormalGameState {
  const seats = [seat("a", 50), seat("b", 100), seat("c", 100)];
  const pot = seats.reduce((sum, s) => sum + s.totalBet, 0);
  return {
    seats,
    community: [],
    deck,
    burns: [],
    street: "preflop",
    dealId: "test",
    phase: "preflop",
    betting: {
      pot,
      sidePots: computeSidePots(seats, pot),
      currentBet: 100,
      minRaise: 50,
      bigBlind: 10,
      toActId: null,
      lastAggressorId: "c",
      dealerIdx: 0,
      sbIdx: 1,
      bbIdx: 2,
      handNum: 1,
      actedThisRound: [],
    },
  };
}

describe("run-it-N helpers", () => {
  it("caps run count by remaining deck capacity", () => {
    const deck = Array.from({ length: 17 }, (_, i) => card("2", ["S", "H", "D", "C"][i % 4] as Suit));
    expect(maxRunCountForState({ street: "preflop", deck })).toBe(2);
    expect(clampRunCount(5, { street: "preflop", deck })).toBe(2);
    expect(runOptionsForState({ street: "preflop", deck })).toEqual([1, 2]);
  });

  it("chooses the most voted count, using the lower option on ties", () => {
    expect(chooseRunCount({ a: 3, b: 2, c: 3 }, ["a", "b", "c"], 5)).toBe(3);
    expect(chooseRunCount({ a: 3, b: 2 }, ["a", "b"], 5)).toBe(2);
    expect(chooseRunCount({}, ["a", "b"], 5)).toBe(1);
  });
});

describe("resolveRunItN", () => {
  it("runs multiple boards, pays side pots, and conserves every chip", () => {
    const deck = [
      // Run 1: aces win main, kings win side.
      card("7", "S"),
      card("2", "C"),
      card("3", "C"),
      card("4", "D"),
      card("8", "S"),
      card("5", "H"),
      card("9", "H"),
      card("9", "S"),
      // Run 2: queens make quads and scoop main + side.
      card("7", "H"),
      card("Q", "H"),
      card("Q", "C"),
      card("2", "D"),
      card("8", "H"),
      card("3", "D"),
      card("9", "D"),
      card("4", "C"),
    ];
    const s = state(deck);
    const holeCards: Record<string, [Card, Card]> = {
      a: [card("A", "S"), card("A", "D")],
      b: [card("K", "S"), card("K", "D")],
      c: [card("Q", "S"), card("Q", "D")],
    };

    const result = resolveRunItN(s, holeCards, 2);

    expect(result.runs).toHaveLength(2);
    expect(result.runs[0].community).toHaveLength(5);
    expect(result.runs[1].community).toHaveLength(5);
    expect(result.perRunPot).toEqual([125, 125]);
    expect(result.winningsByPlayer).toEqual({ a: 75, b: 50, c: 125 });
    expect(Object.values(result.winningsByPlayer).reduce((sum, n) => sum + n, 0)).toBe(250);
    expect(result.winners).toEqual(["c"]);
  });

  it("splits tied run pots without leaking odd chips", () => {
    const deck = [
      card("7", "S"),
      card("2", "C"),
      card("3", "C"),
      card("4", "D"),
      card("8", "S"),
      card("5", "H"),
      card("9", "H"),
      card("9", "S"),
    ];
    const seats = [seat("a", 51), seat("b", 51)];
    const pot = 102;
    const s: NormalGameState = {
      ...state(deck),
      seats,
      betting: {
        ...state(deck).betting,
        pot,
        sidePots: computeSidePots(seats, pot),
      },
    };
    const holeCards: Record<string, [Card, Card]> = {
      a: [card("A", "S"), card("K", "D")],
      b: [card("A", "D"), card("K", "S")],
    };

    const result = resolveRunItN(s, holeCards, 1);

    expect(result.runs[0].winners).toEqual(["a", "b"]);
    expect(result.winningsByPlayer).toEqual({ a: 51, b: 51 });
  });
});
