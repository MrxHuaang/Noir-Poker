import { Card, GameState, Rank, Suit } from "./poker";
import { showdown } from "./handEval";

export const ALL_CARDS: Card[] = (() => {
  const cards: Card[] = [];
  for (const suit of ["S", "H", "D", "C"] as Suit[]) {
    for (const rank of ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as Rank[]) {
      cards.push({ rank, suit, id: `${rank}${suit}` });
    }
  }
  return cards;
})();

export function getRemainingDeck(knownCards: Card[]): Card[] {
  const knownIds = new Set(knownCards.map(c => c.id));
  return ALL_CARDS.filter(c => !knownIds.has(c.id));
}

export type EquityResult = {
  seatId: string;
  equity: number;
};

// Extremely simple and fast Monte Carlo evaluator for the UI
export function calculateEquity(
  holes: { id: string; cards: [Card, Card] }[],
  community: Card[],
  deck: Card[],
  iterations = 1000
): EquityResult[] {
  if (holes.length < 2) return holes.map(h => ({ seatId: h.id, equity: 100 }));

  const wins: Record<string, number> = {};
  holes.forEach(h => (wins[h.id] = 0));

  const neededCards = 5 - community.length;
  if (neededCards === 0) {
    // Already showdown
    const handShodownSeats = holes.map(h => ({
      player: { id: h.id },
      hole: h.cards,
      folded: false,
    }));
    const res = showdown(handShodownSeats, community);
    if (!res) return holes.map(h => ({ seatId: h.id, equity: 0 }));
    const share = 100 / res.winners.length;
    return holes.map(h => ({
      seatId: h.id,
      equity: res.winners.includes(h.id) ? share : 0,
    }));
  }

  for (let i = 0; i < iterations; i++) {
    // fast shuffle deck inline
    const simDeck = [...deck];
    for (let j = simDeck.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [simDeck[j], simDeck[k]] = [simDeck[k], simDeck[j]];
    }

    const simCommunity = [...community, ...simDeck.slice(0, neededCards)];

    const handShodownSeats = holes.map(h => ({
      player: { id: h.id },
      hole: h.cards,
      folded: false,
    }));

    const res = showdown(handShodownSeats, simCommunity);
    if (res) {
      const winCount = res.winners.length;
      for (const wid of res.winners) {
        wins[wid] += 1 / winCount;
      }
    }
  }

  return holes.map(h => ({
    seatId: h.id,
    equity: Math.round((wins[h.id] / iterations) * 100),
  }));
}
