import { describe, it, expect } from "vitest";
import {
  bestHand,
  compareScore,
  categoryFor,
  categoryLabel,
  showdown,
} from "./handEval";
import type { Card, Rank, Suit } from "./poker";

// Build a card from a short code like "AS", "TD", "9C".
function c(code: string): Card {
  const rank = code.slice(0, code.length - 1) as Rank;
  const suit = code.slice(-1) as Suit;
  return { rank, suit, id: code };
}
function hand(...codes: string[]): Card[] {
  return codes.map(c);
}

describe("bestHand — category detection", () => {
  it("ranks a straight flush", () => {
    expect(categoryFor(bestHand(hand("AS", "KS", "QS", "JS", "TS")))).toBe(8);
  });

  it("ranks the steel wheel (A-2-3-4-5 suited) as a straight flush, high card 5", () => {
    const s = bestHand(hand("AH", "2H", "3H", "4H", "5H"));
    expect(categoryFor(s)).toBe(8);
    expect(s[1]).toBe(5);
  });

  it("ranks four of a kind", () => {
    expect(categoryFor(bestHand(hand("9S", "9H", "9D", "9C", "2S")))).toBe(7);
  });

  it("ranks a full house", () => {
    expect(categoryFor(bestHand(hand("KS", "KH", "KD", "2C", "2S")))).toBe(6);
  });

  it("ranks a flush", () => {
    expect(categoryFor(bestHand(hand("AS", "JS", "8S", "5S", "2S")))).toBe(5);
  });

  it("ranks the wheel straight A-2-3-4-5 with high card 5", () => {
    const s = bestHand(hand("AS", "2H", "3D", "4C", "5S"));
    expect(categoryFor(s)).toBe(4);
    expect(s[1]).toBe(5);
  });

  it("ranks a broadway straight with high card A", () => {
    const s = bestHand(hand("AS", "KH", "QD", "JC", "TS"));
    expect(categoryFor(s)).toBe(4);
    expect(s[1]).toBe(14);
  });

  it("ranks trips, two pair, one pair and high card", () => {
    expect(categoryFor(bestHand(hand("7S", "7H", "7D", "KC", "2S")))).toBe(3);
    expect(categoryFor(bestHand(hand("AS", "AH", "KD", "KC", "2S")))).toBe(2);
    expect(categoryFor(bestHand(hand("AS", "AH", "KD", "QC", "2S")))).toBe(1);
    expect(categoryFor(bestHand(hand("AS", "KH", "QD", "JC", "9S")))).toBe(0);
  });

  it("labels categories in Spanish", () => {
    expect(categoryLabel(bestHand(hand("AS", "KS", "QS", "JS", "TS")))).toBe(
      "Escalera de color",
    );
    expect(categoryLabel(bestHand(hand("AS", "AH", "KD", "KC", "2S")))).toBe(
      "Doble par",
    );
  });
});

describe("compareScore — ties and kickers", () => {
  it("breaks a one-pair tie by kicker", () => {
    const a = bestHand(hand("AS", "AH", "KD", "QC", "2S"));
    const b = bestHand(hand("AC", "AD", "KS", "JC", "2H"));
    expect(compareScore(a, b)).toBeGreaterThan(0); // Q kicker beats J kicker
  });

  it("returns 0 for identical hands (split pot)", () => {
    const a = bestHand(hand("AS", "AH", "KD", "QC", "2S"));
    const b = bestHand(hand("AC", "AD", "KS", "QH", "2H"));
    expect(compareScore(a, b)).toBe(0);
  });

  it("ranks a higher category above a lower one regardless of kickers", () => {
    const flush = bestHand(hand("2S", "4S", "6S", "8S", "TS"));
    const pairAces = bestHand(hand("AS", "AH", "KD", "QC", "JS"));
    expect(compareScore(flush, pairAces)).toBeGreaterThan(0);
  });
});

describe("bestHand — best 5 of 7", () => {
  it("finds the flush among 7 cards", () => {
    const s = bestHand(hand("AS", "KS", "QS", "JS", "9S", "2H", "3D"));
    expect(categoryFor(s)).toBe(5);
  });

  it("finds a straight among 7 cards with pair noise", () => {
    const s = bestHand(hand("5S", "6H", "7D", "8C", "9S", "9H", "2D"));
    expect(categoryFor(s)).toBe(4);
    expect(s[1]).toBe(9);
  });
});

// Helper to build a Seat for showdown()
function mkSeat(id: string, hole: [Card, Card], folded = false) {
  return { player: { id, name: id, seed: id, createdAt: 0 }, hole, folded };
}

describe("showdown() — multi-player evaluation", () => {
  const community = hand("AS", "KH", "QD", "JC", "9S");

  it("picks the correct winner in a heads-up confrontation", () => {
    // a has a straight (A-K-Q-J-T? No, no T. a has A-K-Q-J-9 = no straight → high card A)
    // but b has a pair — pair should lose to... wait let me think about cards.
    // community = A K Q J 9
    // a hole = 2H 3D → best: A K Q J 9 (high card A-K)
    // b hole = 9H 9D → trips 9-9-9 + A K = full? No, trips (3×9) → Trío
    const a = mkSeat("a", [c("2H"), c("3D")]);
    const b = mkSeat("b", [c("9H"), c("9D")]);
    const result = showdown([a, b], community);
    expect(result).not.toBeNull();
    expect(result!.winners).toEqual(["b"]);
    expect(categoryFor(result!.scores["b"])).toBe(3); // Trips
  });

  it("declares a tie when two players make the same hand", () => {
    // community = A K Q J 9 — both players have same 5-card board hand
    const a = mkSeat("a", [c("2H"), c("3D")]);
    const b = mkSeat("b", [c("4H"), c("5D")]);
    const result = showdown([a, b], community);
    expect(result!.winners).toHaveLength(2);
    expect(result!.winners).toContain("a");
    expect(result!.winners).toContain("b");
  });

  it("excludes folded players from consideration", () => {
    const a = mkSeat("a", [c("2H"), c("3D")], true); // folded
    const b = mkSeat("b", [c("9H"), c("9D")]);
    const result = showdown([a, b], community);
    expect(result!.winners).toEqual(["b"]);
  });

  it("returns null when all players folded", () => {
    const a = mkSeat("a", [c("2H"), c("3D")], true);
    const b = mkSeat("b", [c("9H"), c("9D")], true);
    expect(showdown([a, b], community)).toBeNull();
  });

  it("handles 3-way confrontation correctly", () => {
    // community = A K Q J 9
    // a: 2H 3D → board play (high card)
    // b: 9H 9D → trips 9s
    // c: AS AH → three aces? A A A + K Q = full house!? No: A A A K Q = full A over K? No: 3 Aces + K + Q = Trío de ases
    //    Actually A A A K Q = cat 3 (trips) because no pair on board for full. Wait community has no pair...
    //    c hole = AS AH → 7 cards: AS AH AS KH QD JC 9S → AS from hole + AS from community → both are "AS"?
    //    Let me avoid card ID collisions.
    // c: AC AD → trips A (AC AD AS from community + board KH QD = Trío de ases)
    const a = mkSeat("a", [c("2H"), c("3D")]);
    const b = mkSeat("b", [c("9H"), c("9D")]);
    const cc = mkSeat("c", [c("AC"), c("AD")]);
    const result = showdown([a, b, cc], community);
    // c has trips aces (best), b has trips nines, a has high card
    expect(result!.winners).toEqual(["c"]);
  });
});
