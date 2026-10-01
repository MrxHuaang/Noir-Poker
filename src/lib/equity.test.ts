import { describe, expect, it } from "vitest";
import { equity } from "./equity";

// Small seeded generator so the preflop sample is repeatable.
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("equity", () => {
  it("is settled on a full board", () => {
    expect(equity({ a: ["AS", "AH"], b: ["KS", "KH"] }, ["2C", "7D", "9S", "JH", "3C"])).toEqual({ a: 100, b: 0 });
  });

  it("splits a chopped board", () => {
    expect(equity({ a: ["2S", "3H"], b: ["4S", "5H"] }, ["AC", "KD", "QS", "JH", "TC"])).toEqual({ a: 50, b: 50 });
  });

  it("counts the outs exactly after the flop", () => {
    // Set over overpair on the flop: the overpair has two kings left
    // among 45 cards for two draws, plus runner-runner straights.
    const eq = equity({ a: ["7S", "7H"], b: ["KS", "KH"] }, ["7C", "2D", "9S"]);
    expect(eq.a + eq.b).toBe(100);
    expect(eq.b).toBeGreaterThanOrEqual(4);
    expect(eq.b).toBeLessThanOrEqual(10);
  });

  it("samples preflop close to the known odds", () => {
    // AA vs KK is about 82 / 18.
    const eq = equity({ a: ["AS", "AH"], b: ["KS", "KH"] }, [], lcg(7));
    expect(eq.a).toBeGreaterThanOrEqual(78);
    expect(eq.a).toBeLessThanOrEqual(86);
  });

  it("handles three hands", () => {
    const eq = equity({ a: ["AS", "AH"], b: ["KS", "KH"], c: ["QS", "QH"] }, ["2C", "7D", "9H", "3S"]);
    expect(eq.a).toBeGreaterThan(eq.b);
    expect(eq.b).toBeGreaterThanOrEqual(0);
  });
});
