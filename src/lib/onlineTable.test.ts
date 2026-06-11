import { describe, expect, it } from "vitest";
import { adaptOnlineState, adaptOnlineRuns } from "./onlineTable";
import { getValidActions } from "./betting";
import type { PublicState } from "@/hooks/useGameSocket";

const baseState: PublicState = {
  handNum: 3,
  phase: "flop",
  board: ["2C", "7D", "9S"],
  pot: 120,
  toAct: "p2",
  deadline: 1_700_000_000_000,
  seats: [
    { id: "p1", name: "Ana", seed: "s1", chips: 940, bet: 0, totalBet: 60, status: "active", hasCards: true },
    { id: "p2", name: "Bob", seed: "s2", chips: 940, bet: 0, totalBet: 60, status: "active", hasCards: true },
    { id: "p3", name: "Cleo", seed: "s3", chips: 1000, bet: 0, totalBet: 0, status: "folded", hasCards: false },
  ],
  sb: 5,
  bb: 10,
  startStack: 1000,
  currentBet: 0,
  minRaise: 10,
  dealer: "p2",
  owner: "p1",
};

describe("adaptOnlineState", () => {
  it("maps seats, betting and community to the rich-table view model", () => {
    const view = adaptOnlineState(baseState, ["AS", "KH"]);

    expect(view.seats).toHaveLength(3);
    expect(view.seats[0]).toMatchObject({
      id: "p1", name: "Ana", seed: "s1", chips: 940, bet: 0, totalBet: 60,
      status: "active", revealed: false, turnDeadline: null,
    });
    // Only the actor carries the turn deadline.
    expect(view.seats[1].turnDeadline).toBe(1_700_000_000_000);
    expect(view.seats[2].status).toBe("folded");

    expect(view.betting).toMatchObject({
      pot: 120, currentBet: 0, minRaise: 10, bigBlind: 10,
      toActId: "p2", handNum: 3,
    });
    // Dealer index resolves the seat id into the seats array.
    expect(view.betting.dealerIdx).toBe(1);

    expect(view.community.map((c) => c.id)).toEqual(["2C", "7D", "9S"]);
    expect(view.ownHole?.map((c) => c.id)).toEqual(["AS", "KH"]);
    expect(view.revealedHoles).toBeUndefined();
    expect(view.winners).toBeUndefined();
  });

  it("feeds getValidActions so the dock offers the same moves the server allows", () => {
    const view = adaptOnlineState(baseState, ["AS", "KH"]);
    const me = view.seats[1];
    const actions = getValidActions(me, view.betting).map((a) => a.action);
    // No bet to face: check/bet/all-in, no call/fold-only states.
    expect(actions).toContain("check");
    expect(actions).toContain("bet");
    expect(actions).toContain("all-in");
    expect(actions).not.toContain("call");

    // Facing a bet: fold/call/raise appear, raise-to min = currentBet + minRaise.
    const facing = adaptOnlineState(
      { ...baseState, currentBet: 40, minRaise: 40, seats: baseState.seats },
      null,
    );
    const raise = getValidActions(facing.seats[1], facing.betting).find((a) => a.action === "raise");
    expect(raise?.min).toBe(80);
  });

  it("maps showdown reveals and winners", () => {
    const view = adaptOnlineState(
      {
        ...baseState,
        phase: "showdown",
        toAct: "",
        board: ["2C", "7D", "9S", "JH", "3C"],
        reveals: { p1: ["AS", "AH"], p2: ["KS", "KH"] },
        winners: [{ id: "p1", amount: 120 }],
      },
      null,
    );
    expect(view.revealedHoles?.p1.map((c) => c.id)).toEqual(["AS", "AH"]);
    expect(view.seats[0].revealed).toBe(true);
    expect(view.seats[2].revealed).toBe(false);
    expect(view.winners).toEqual(["p1"]);
  });

  it("returns an empty view for null state", () => {
    const view = adaptOnlineState(null, null);
    expect(view.seats).toEqual([]);
    expect(view.betting.pot).toBe(0);
    expect(view.ownHole).toBeNull();
  });
});

describe("adaptOnlineRuns", () => {
  it("returns null for single runs and adapts multi-run boards with winner category", () => {
    expect(adaptOnlineRuns(undefined, undefined)).toBeNull();
    expect(adaptOnlineRuns([{ board: [], pot: 0, winners: [] }], undefined)).toBeNull();

    const runs = adaptOnlineRuns(
      [
        {
          board: ["2C", "7D", "9S", "JH", "3C"],
          pot: 60,
          winners: [{ id: "p1", amount: 60 }],
        },
        {
          board: ["2C", "7D", "9S", "QD", "QS"],
          pot: 60,
          winners: [{ id: "p2", amount: 60 }],
        },
      ],
      { p1: ["AS", "AH"], p2: ["KS", "QH"] },
    );
    expect(runs).toHaveLength(2);
    expect(runs![0].winners).toEqual(["p1"]);
    expect(runs![0].category).toBe(1); // pair of aces
    expect(runs![1].category).toBe(3); // trips queens (QH + QD QS)
    expect(runs![1].community.map((c) => c.id)).toContain("QD");
  });
});
