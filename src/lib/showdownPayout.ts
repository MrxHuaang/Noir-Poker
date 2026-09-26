// Pure pot distribution for the host-authoritative normal mode. Shared by the
// single-board showdown (useNormalGame.resolveShowdown) and run-it-N
// (runIt.resolveRunItN) so both settle side pots with the same rules:
//
//   - Pots are always rebuilt from each seat's cumulative `totalBet` at
//     resolution time (never from a cached `betting.sidePots`, which is only
//     refreshed when a street advances).
//   - Each pot goes to the best hand among the in-hand seats that reached it,
//     independently of who holds the best hand overall (a short all-in winner
//     only takes the tiers it covered).
//   - A pot that no in-hand seat reached (uncalled bet, or every contributor
//     to that tier folded) is returned to the seats that paid into it. Every
//     contributor of a tier paid exactly the tier width, so an even split is the
//     exact refund.
//   - Odd chips go to the winners closest to the left of the button.
//
// Invariant: the payouts always sum to the chips committed by the seats.
import type { NormalSeat } from "./betting";
import { compareScore, type Score } from "./handEval";

export type PotTier = {
  amount: number;
  // In-hand (active / all-in) seats whose commitment reached this tier.
  eligibleIds: string[];
  // Every seat that put chips in this tier, folded ones included.
  contributors: string[];
};

export type PotAward = {
  potIndex: number;
  amount: number;
  eligibleIds: string[];
  winnerIds: string[];
  // Chips each winner took from this pot.
  payouts: Record<string, number>;
  // True when the only payer of the tier gets it back (uncalled chips).
  refund: boolean;
};

export type PotSettlement = {
  payouts: Record<string, number>;
  awards: PotAward[];
  // Seats that won chips put in by someone else (refunds excluded).
  winners: string[];
};

export function isInHand(seat: Pick<NormalSeat, "status">): boolean {
  return seat.status === "active" || seat.status === "all-in";
}

export function buildPotTiers(seats: NormalSeat[]): PotTier[] {
  const levels = [...new Set(seats.map((s) => s.totalBet).filter((b) => b > 0))].sort(
    (a, b) => a - b,
  );
  const tiers: PotTier[] = [];
  let prev = 0;
  for (const cap of levels) {
    const width = cap - prev;
    const contributors = seats.filter((s) => s.totalBet >= cap).map((s) => s.id);
    const amount = width * contributors.length;
    if (amount > 0) {
      tiers.push({
        amount,
        eligibleIds: seats.filter((s) => s.totalBet >= cap && isInHand(s)).map((s) => s.id),
        contributors,
      });
    }
    prev = cap;
  }
  return tiers;
}

// Seat ids starting with the first seat to the left of the button.
export function orderFromButton(seats: Pick<NormalSeat, "id">[], dealerIdx: number): string[] {
  const n = seats.length;
  if (n === 0) return [];
  const start = dealerIdx >= 0 ? (dealerIdx + 1) % n : 0;
  return Array.from({ length: n }, (_, i) => seats[(start + i) % n].id);
}

function sortByOrder(ids: string[], order: string[]): string[] {
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...ids].sort((a, b) => rank(a) - rank(b));
}

export function bestScoreIds(scores: Record<string, Score>, ids: string[]): string[] {
  const scored = ids.filter((id) => scores[id]);
  if (scored.length <= 1) return scored;
  let best = scores[scored[0]];
  for (const id of scored) {
    if (compareScore(scores[id], best) > 0) best = scores[id];
  }
  return scored.filter((id) => compareScore(scores[id], best) === 0);
}

// Even split; the remainder goes one chip at a time to the earliest ids in
// `order` (closest to the left of the button).
export function splitChips(
  amount: number,
  winners: string[],
  order: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  if (winners.length === 0 || amount <= 0) return out;
  const ordered = sortByOrder(winners, order);
  const share = Math.floor(amount / ordered.length);
  let remainder = amount - share * ordered.length;
  for (const id of ordered) {
    out[id] = share + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return out;
}

export function awardPots(
  tiers: PotTier[],
  scores: Record<string, Score>,
  order: string[],
  // Portion of each tier being awarded (run-it-N splits every tier by board).
  amountOf: (tier: PotTier, index: number) => number = (tier) => tier.amount,
): PotSettlement {
  const payouts: Record<string, number> = {};
  const awards: PotAward[] = [];
  const winners = new Set<string>();

  tiers.forEach((tier, potIndex) => {
    const amount = amountOf(tier, potIndex);
    const refund = tier.contributors.length === 1;
    let winnerIds: string[];
    if (tier.eligibleIds.length === 0) {
      // Nobody still in the hand reached this tier: give it back to its payers.
      winnerIds = sortByOrder(tier.contributors, order);
    } else if (tier.eligibleIds.length === 1) {
      winnerIds = [...tier.eligibleIds];
    } else {
      winnerIds = bestScoreIds(scores, tier.eligibleIds);
      if (winnerIds.length === 0) winnerIds = sortByOrder(tier.eligibleIds, order).slice(0, 1);
    }

    const split = splitChips(amount, winnerIds, order);
    for (const [id, chips] of Object.entries(split)) {
      payouts[id] = (payouts[id] ?? 0) + chips;
    }
    if (!refund && tier.eligibleIds.length > 0 && amount > 0) {
      for (const id of winnerIds) winners.add(id);
    }
    awards.push({
      potIndex,
      amount,
      eligibleIds: tier.eligibleIds,
      winnerIds: sortByOrder(winnerIds, order),
      payouts: split,
      refund,
    });
  });

  return { payouts, awards, winners: sortByOrder([...winners], order) };
}

// One-board settlement straight from the seats of a finished hand.
export function settleShowdown(
  seats: NormalSeat[],
  scores: Record<string, Score>,
  dealerIdx: number,
): PotSettlement {
  return awardPots(buildPotTiers(seats), scores, orderFromButton(seats, dealerIdx));
}
