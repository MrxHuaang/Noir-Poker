import type { NormalGameState } from "./betting";
import { bestHand, categoryFor, type Category, type Score } from "./handEval";
import { awardPots, buildPotTiers, isInHand, orderFromButton } from "./showdownPayout";
import type { Card } from "./poker";

export type RunStreetStep = {
  street: "flop" | "turn" | "river";
  community: Card[];
};

export type RunPotResult = {
  potIndex: number;
  amount: number;
  eligibleIds: string[];
  winnerIds: string[];
};

export type RunItRun = {
  community: Card[];
  winners: string[];
  category: Category;
  potResults: RunPotResult[];
  steps: RunStreetStep[];
};

export type RunItResolution = {
  runs: RunItRun[];
  winningsByPlayer: Record<string, number>;
  perRunPot: number[];
  finalDeck: Card[];
  finalBurns: Card[];
  winners: string[];
  category: Category;
};

// Hard cap at 3: 1x normal, 2x, 3x. No higher options ever offered.
export const RUN_IT_OPTIONS = [1, 2, 3] as const;
export const MAX_RUN_IT = 3;

export function cardsNeededForRunout(street: NormalGameState["street"]): number {
  if (street === "preflop") return 8; // burn + flop, burn + turn, burn + river
  if (street === "flop") return 4; // burn + turn, burn + river
  if (street === "turn") return 2; // burn + river
  return 0;
}

export function maxRunCountForState(state: Pick<NormalGameState, "street" | "deck">): number {
  const perRun = cardsNeededForRunout(state.street);
  if (perRun === 0) return 1;
  // Never exceed MAX_RUN_IT regardless of deck size.
  return Math.min(MAX_RUN_IT, Math.max(1, Math.floor(state.deck.length / perRun)));
}

export function runOptionsForState(state: Pick<NormalGameState, "street" | "deck">): number[] {
  const max = maxRunCountForState(state);
  // Only offer options up to max (which is already capped at MAX_RUN_IT).
  return (RUN_IT_OPTIONS as readonly number[]).filter((n) => n <= max);
}

export function clampRunCount(requested: number, state: Pick<NormalGameState, "street" | "deck">): number {
  const max = maxRunCountForState(state);
  if (!Number.isFinite(requested)) return 1;
  return Math.min(max, Math.max(1, Math.round(requested)));
}

export function chooseRunCount(
  votes: Record<string, number>,
  playerIds: string[],
  maxRuns: number,
): number {
  const tally = new Map<number, number>();
  for (const id of playerIds) {
    const vote = Math.min(maxRuns, Math.max(1, Math.round(votes[id] ?? 1)));
    tally.set(vote, (tally.get(vote) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 1;
}

function dealRunout(
  state: Pick<NormalGameState, "street" | "community">,
  deck: Card[],
  burns: Card[],
): { community: Card[]; deck: Card[]; burns: Card[]; steps: RunStreetStep[] } {
  let street = state.street;
  const community = [...state.community];
  const nextDeck = [...deck];
  const nextBurns = [...burns];
  const steps: RunStreetStep[] = [];

  while (street !== "river") {
    const burn = nextDeck.shift();
    if (!burn) throw new Error("Not enough cards to burn");
    nextBurns.push(burn);

    if (street === "preflop") {
      const flop = [nextDeck.shift(), nextDeck.shift(), nextDeck.shift()];
      if (flop.some((c) => !c)) throw new Error("Not enough cards for flop");
      community.push(...(flop as Card[]));
      street = "flop";
      steps.push({ street, community: [...community] });
    } else if (street === "flop") {
      const turn = nextDeck.shift();
      if (!turn) throw new Error("Not enough cards for turn");
      community.push(turn);
      street = "turn";
      steps.push({ street, community: [...community] });
    } else {
      const river = nextDeck.shift();
      if (!river) throw new Error("Not enough cards for river");
      community.push(river);
      street = "river";
      steps.push({ street, community: [...community] });
    }
  }

  if (steps.length === 0) {
    steps.push({ street: "river", community: [...community] });
  }

  return { community, deck: nextDeck, burns: nextBurns, steps };
}

export function resolveRunItN(
  state: NormalGameState,
  holeCards: Record<string, [Card, Card]>,
  requestedRunCount: number,
): RunItResolution {
  const runCount = clampRunCount(requestedRunCount, state);
  // Always rebuild the pots from each seat's cumulative commitment:
  // betting.sidePots is only refreshed when a street advances, so it misses
  // every chip bet on the street where the all-in happened.
  const tiers = buildPotTiers(state.seats);
  const order = orderFromButton(state.seats, state.betting.dealerIdx);
  const liveIds = state.seats.filter(isInHand).map((s) => s.id);
  const runs: RunItRun[] = [];
  const winningsByPlayer: Record<string, number> = {};
  // Winnings excluding uncalled chips handed back to their owner.
  const wonByPlayer: Record<string, number> = {};
  const perRunPot = Array.from({ length: runCount }, () => 0);
  let deck = [...state.deck];
  let burns = [...state.burns];

  for (let runIdx = 0; runIdx < runCount; runIdx++) {
    const dealt = dealRunout(state, deck, burns);
    deck = dealt.deck;
    burns = dealt.burns;

    const scores: Record<string, Score> = {};
    for (const id of liveIds) {
      const hole = holeCards[id];
      if (hole) scores[id] = bestHand([...hole, ...dealt.community]);
    }

    const settlement = awardPots(tiers, scores, order, (tier) => {
      const baseShare = Math.floor(tier.amount / runCount);
      return runIdx === runCount - 1 ? tier.amount - baseShare * (runCount - 1) : baseShare;
    });

    const potResults: RunPotResult[] = [];
    let bestRunCategory: Category = 0;
    for (const award of settlement.awards) {
      perRunPot[runIdx] += award.amount;
      for (const [id, amount] of Object.entries(award.payouts)) {
        winningsByPlayer[id] = (winningsByPlayer[id] ?? 0) + amount;
        if (!award.refund) wonByPlayer[id] = (wonByPlayer[id] ?? 0) + amount;
      }
      potResults.push({
        potIndex: award.potIndex,
        amount: award.amount,
        eligibleIds: award.eligibleIds,
        winnerIds: award.winnerIds,
      });
    }
    for (const id of settlement.winners) {
      const category = scores[id] ? categoryFor(scores[id]) : 0;
      if (category > bestRunCategory) bestRunCategory = category;
    }

    runs.push({
      community: dealt.community,
      winners: settlement.winners,
      category: bestRunCategory,
      potResults,
      steps: dealt.steps,
    });
  }

  const maxWon = Math.max(0, ...Object.values(wonByPlayer));
  const winners = Object.entries(wonByPlayer)
    .filter(([, amount]) => amount === maxWon && amount > 0)
    .map(([id]) => id);

  return {
    runs,
    winningsByPlayer,
    perRunPot,
    finalDeck: deck,
    finalBurns: burns,
    winners,
    category: runs[0]?.category ?? 0,
  };
}
