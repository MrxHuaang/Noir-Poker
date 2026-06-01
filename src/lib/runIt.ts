import type { NormalGameState, SidePot } from "./betting";
import { computeSidePots } from "./betting";
import { bestHand, categoryFor, compareScore, type Category, type Score } from "./handEval";
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

export const RUN_IT_OPTIONS = [1, 2, 3, 5] as const;

export function cardsNeededForRunout(street: NormalGameState["street"]): number {
  if (street === "preflop") return 8; // burn + flop, burn + turn, burn + river
  if (street === "flop") return 4; // burn + turn, burn + river
  if (street === "turn") return 2; // burn + river
  return 0;
}

export function maxRunCountForState(state: Pick<NormalGameState, "street" | "deck">): number {
  const perRun = cardsNeededForRunout(state.street);
  if (perRun === 0) return 1;
  return Math.max(1, Math.floor(state.deck.length / perRun));
}

export function runOptionsForState(state: Pick<NormalGameState, "street" | "deck">): number[] {
  const max = maxRunCountForState(state);
  const options: number[] = RUN_IT_OPTIONS.filter((n) => n <= max);
  if (!options.includes(max) && max > 1) options.push(max);
  return [...new Set(options)].sort((a, b) => a - b);
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

function bestIds(scores: Record<string, Score>, ids: string[]): string[] {
  const scoredIds = ids.filter((id) => scores[id]);
  if (scoredIds.length <= 1) return scoredIds;
  let best = scores[scoredIds[0]];
  for (const id of scoredIds) {
    if (compareScore(scores[id], best) > 0) best = scores[id];
  }
  return scoredIds.filter((id) => compareScore(scores[id], best) === 0);
}

function splitAmount(amount: number, winners: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (winners.length === 0 || amount <= 0) return out;
  const share = Math.floor(amount / winners.length);
  const remainder = amount - share * winners.length;
  winners.forEach((id, idx) => {
    out[id] = share + (idx === 0 ? remainder : 0);
  });
  return out;
}

export function resolveRunItN(
  state: NormalGameState,
  holeCards: Record<string, [Card, Card]>,
  requestedRunCount: number,
): RunItResolution {
  const runCount = clampRunCount(requestedRunCount, state);
  const pots = state.betting.sidePots.length > 0
    ? state.betting.sidePots
    : computeSidePots(state.seats, state.betting.pot);
  const liveIds = state.seats
    .filter((s) => s.status !== "folded" && s.status !== "out")
    .map((s) => s.id);
  const runs: RunItRun[] = [];
  const winningsByPlayer: Record<string, number> = {};
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

    const potResults: RunPotResult[] = [];
    const runWinnerSet = new Set<string>();
    let bestRunCategory: Category = 0;

    pots.forEach((pot: SidePot, potIndex) => {
      const baseShare = Math.floor(pot.amount / runCount);
      const runPotAmount =
        runIdx === runCount - 1 ? pot.amount - baseShare * (runCount - 1) : baseShare;
      perRunPot[runIdx] += runPotAmount;

      const eligible = pot.eligibleIds.filter((id) => liveIds.includes(id));
      const winnerIds = bestIds(scores, eligible);
      const finalWinnerIds = winnerIds.length > 0 ? winnerIds : eligible.slice(0, 1);
      for (const id of finalWinnerIds) {
        runWinnerSet.add(id);
        const category = scores[id] ? categoryFor(scores[id]) : 0;
        if (category > bestRunCategory) bestRunCategory = category;
      }

      const payouts = splitAmount(runPotAmount, finalWinnerIds);
      for (const [id, amount] of Object.entries(payouts)) {
        winningsByPlayer[id] = (winningsByPlayer[id] ?? 0) + amount;
      }
      potResults.push({
        potIndex,
        amount: runPotAmount,
        eligibleIds: eligible,
        winnerIds: finalWinnerIds,
      });
    });

    runs.push({
      community: dealt.community,
      winners: [...runWinnerSet],
      category: bestRunCategory,
      potResults,
      steps: dealt.steps,
    });
  }

  const maxWon = Math.max(0, ...Object.values(winningsByPlayer));
  const winners = Object.entries(winningsByPlayer)
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
