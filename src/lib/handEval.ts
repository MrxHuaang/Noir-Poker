import type { Card, Rank } from "./poker";

export const RANK_VAL: Record<Rank, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

export type Category =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const CATEGORY_LABEL: Record<Category, string> = {
  0: "Carta alta",
  1: "Par",
  2: "Doble par",
  3: "Trío",
  4: "Escalera",
  5: "Color",
  6: "Full",
  7: "Póker",
  8: "Escalera de color",
};

export type Score = number[];

export function categoryFor(score: Score): Category {
  return score[0] as Category;
}

export function categoryLabel(score: Score): string {
  return CATEGORY_LABEL[score[0] as Category];
}

function eval5(cards: Card[]): Score {
  const ranks = cards.map((c) => RANK_VAL[c.rank]).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5;
  }
  const counts: Record<number, number> = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([r, c]) => ({ r: Number(r), c }))
    .sort((a, b) => b.c - a.c || b.r - a.r);
  const sig = groups.map((g) => g.c).join("");

  if (straightHigh && flush) return [8, straightHigh];
  if (sig === "41") return [7, groups[0].r, groups[1].r];
  if (sig === "32") return [6, groups[0].r, groups[1].r];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (sig === "311") return [3, groups[0].r, groups[1].r, groups[2].r];
  if (sig === "221") return [2, groups[0].r, groups[1].r, groups[2].r];
  if (sig === "2111")
    return [1, groups[0].r, groups[1].r, groups[2].r, groups[3].r];
  return [0, ...ranks];
}

function* combos<T>(arr: T[], k: number, start = 0, picked: T[] = []): Generator<T[]> {
  if (picked.length === k) {
    yield picked.slice();
    return;
  }
  for (let i = start; i <= arr.length - (k - picked.length); i++) {
    picked.push(arr[i]);
    yield* combos(arr, k, i + 1, picked);
    picked.pop();
  }
}

export function compareScore(a: Score, b: Score): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export function bestHand(cards: Card[]): Score {
  let best: Score | null = null;
  for (const c of combos(cards, 5)) {
    const s = eval5(c);
    if (!best || compareScore(s, best) > 0) best = s;
  }
  return best!;
}

export type Showdown = {
  scores: Record<string, Score>;
  winners: string[];
  category: Category;
};

export function showdown(
  seats: { player: { id: string }; hole: [Card, Card]; folded?: boolean }[],
  community: Card[],
): Showdown | null {
  const active = seats.filter((s) => !s.folded);
  if (active.length === 0) return null;
  if (active.length === 1) {
    return {
      scores: { [active[0].player.id]: [0] },
      winners: [active[0].player.id],
      category: 0,
    };
  }
  const scores: Record<string, Score> = {};
  for (const s of active) {
    scores[s.player.id] = bestHand([...s.hole, ...community]);
  }
  let bestScore: Score = scores[active[0].player.id];
  for (const s of active) {
    if (compareScore(scores[s.player.id], bestScore) > 0) {
      bestScore = scores[s.player.id];
    }
  }
  const winners = active
    .filter((s) => compareScore(scores[s.player.id], bestScore) === 0)
    .map((s) => s.player.id);
  return { scores, winners, category: bestScore[0] as Category };
}
