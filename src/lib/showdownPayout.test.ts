import { describe, expect, it } from "vitest";
import type { NormalSeat } from "./betting";
import type { Score } from "./handEval";
import {
  buildPotTiers,
  orderFromButton,
  settleShowdown,
  splitChips,
} from "./showdownPayout";

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
    bet: 0,
    totalBet,
    revealed: false,
    status,
    timeBank: 0,
    turnDeadline: null,
  };
}

// Higher first element = better hand (compareScore is lexicographic).
const HIGH: Score = [8, 14];
const MID: Score = [5, 10];
const LOW: Score = [1, 3];

function total(payouts: Record<string, number>): number {
  return Object.values(payouts).reduce((a, b) => a + b, 0);
}

describe("buildPotTiers", () => {
  it("builds tiers from cumulative commitments, folded payers included", () => {
    const tiers = buildPotTiers([
      seat("a", 100),
      seat("b", 300, "active"),
      seat("c", 300, "folded"),
    ]);
    expect(tiers).toEqual([
      { amount: 300, eligibleIds: ["a", "b"], contributors: ["a", "b", "c"] },
      { amount: 400, eligibleIds: ["b"], contributors: ["b", "c"] },
    ]);
  });

  it("never makes sitting-out, waiting or out seats eligible", () => {
    const tiers = buildPotTiers([
      seat("a", 50, "active"),
      seat("b", 50, "sitting-out"),
      seat("c", 50, "waiting"),
      seat("d", 50, "out"),
    ]);
    expect(tiers[0].eligibleIds).toEqual(["a"]);
  });
});

describe("settleShowdown", () => {
  it("hands an uncalled excess back when the short all-in wins", () => {
    // A bets 1000, B calls all-in for 500 and wins. A's 500 tier used to vanish.
    const seats = [seat("a", 1000, "active"), seat("b", 500)];
    const res = settleShowdown(seats, { a: LOW, b: HIGH }, 0);
    expect(res.payouts).toEqual({ a: 500, b: 1000 });
    expect(total(res.payouts)).toBe(1500);
    expect(res.winners).toEqual(["b"]);
  });

  it("pays the side pot between the others when the short all-in has the best hand", () => {
    const seats = [seat("a", 100), seat("b", 500), seat("c", 500)];
    const res = settleShowdown(seats, { a: HIGH, b: MID, c: LOW }, 0);
    expect(res.payouts).toEqual({ a: 300, b: 800 });
    expect(total(res.payouts)).toBe(1100);
    expect(res.winners.sort()).toEqual(["a", "b"]);
  });

  it("splits ties and gives the odd chips to the first seats left of the button", () => {
    // 3 x 34 = 102 committed; a and c tie. Button on c -> order a, b, c.
    const seats = [seat("a", 34), seat("b", 34), seat("c", 34)];
    const res = settleShowdown(seats, { a: HIGH, b: LOW, c: HIGH }, 2);
    expect(res.payouts).toEqual({ a: 51, c: 51 });

    const odd = [seat("a", 33), seat("b", 33), seat("c", 34, "folded")];
    // 100 chips: tier 33 (99, a/b) + tier 34 (1, only c paid it: back to c).
    const r2 = settleShowdown(odd, { a: HIGH, b: HIGH }, 1);
    // Button on b -> order c, a, b: the odd chip of the 99 goes to a.
    expect(r2.payouts).toEqual({ a: 50, b: 49, c: 1 });
    expect(total(r2.payouts)).toBe(100);
  });

  it("returns a tier nobody in the hand reached to the folded payers (short BB)", () => {
    // SB completes to 10 then folds; BB was all-in for 3.
    const seats = [seat("sb", 10, "folded"), seat("bb", 3)];
    const res = settleShowdown(seats, { bb: [0] }, 0);
    expect(res.payouts).toEqual({ sb: 7, bb: 6 });
    expect(res.winners).toEqual(["bb"]);
  });

  it("gives an uncontested pot to the last player without counting its own blind as a win", () => {
    const seats = [seat("sb", 5, "folded"), seat("bb", 10, "active")];
    const res = settleShowdown(seats, { bb: [0] }, 0);
    expect(res.payouts).toEqual({ bb: 15 });
    expect(res.winners).toEqual(["bb"]);
    expect(res.awards.map((a) => a.refund)).toEqual([false, true]);
  });

  it("conserves every chip for random tables", () => {
    const statuses: NormalSeat["status"][] = ["all-in", "active", "folded"];
    let rng = 7;
    const rand = (n: number) => {
      rng = (rng * 1103515245 + 12345) % 2147483648;
      return rng % n;
    };
    for (let trial = 0; trial < 300; trial++) {
      const n = 2 + rand(8);
      const seats = Array.from({ length: n }, (_, i) =>
        seat(`p${i}`, rand(6) * 37 + rand(3), statuses[rand(3)]),
      );
      const scores: Record<string, Score> = {};
      for (const s of seats) {
        if (s.status !== "folded") scores[s.id] = [rand(4), rand(4)];
      }
      const committed = seats.reduce((a, s) => a + s.totalBet, 0);
      const res = settleShowdown(seats, scores, rand(n));
      expect(total(res.payouts)).toBe(committed);
      for (const v of Object.values(res.payouts)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("splitChips / orderFromButton", () => {
  it("orders seats from the left of the button", () => {
    expect(orderFromButton([seat("a", 0), seat("b", 0), seat("c", 0)], 1)).toEqual(["c", "a", "b"]);
  });

  it("spreads the remainder one chip at a time", () => {
    expect(splitChips(11, ["x", "y", "z"], ["z", "x", "y"])).toEqual({ z: 4, x: 4, y: 3 });
  });
});
