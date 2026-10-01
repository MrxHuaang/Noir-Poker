// Win chances for hands that are already face up (an all-in runout, where
// every hand is public). Display only: nothing here decides a pot. Exact
// enumeration once the flop is out; before it, a Monte Carlo sample (the
// 1.7M preflop boards would take too long in the browser).
import { bestHand, compareScore, type Score } from "./handEval";
import { cardFromId, makeDeck, type Card } from "./poker";

export type Equity = Record<string, number>; // seatId -> 0..100 (ties split)

const PREFLOP_SAMPLES = 4000;

function score(hole: Card[], board: Card[]): Score {
  return bestHand([...hole, ...board]);
}

function* boards(deck: Card[], k: number, start = 0, picked: Card[] = []): Generator<Card[]> {
  if (picked.length === k) {
    yield picked;
    return;
  }
  for (let i = start; i <= deck.length - (k - picked.length); i++) {
    picked.push(deck[i]);
    yield* boards(deck, k, i + 1, picked);
    picked.pop();
  }
}

/**
 * Equity of each hand given the board so far. `rand` is injectable for
 * deterministic tests of the preflop sample.
 */
export function equity(hands: Record<string, string[]>, boardIds: string[], rand: () => number = Math.random): Equity {
  const ids = Object.keys(hands);
  const holes = ids.map((id) => hands[id].map(cardFromId).filter((c): c is Card => !!c));
  const board = boardIds.map(cardFromId).filter((c): c is Card => !!c);
  const out: Equity = {};
  if (ids.length < 2 || holes.some((h) => h.length !== 2) || board.length > 5) return out;
  const used = new Set([...holes.flat(), ...board].map((c) => c.id));
  const deck = makeDeck().filter((c) => !used.has(c.id));
  const need = 5 - board.length;
  const share = new Array<number>(ids.length).fill(0);
  let total = 0;

  const play = (extra: Card[]) => {
    const full = extra.length ? [...board, ...extra] : board;
    const scores = holes.map((h) => score(h, full));
    let best = scores[0];
    for (const s of scores) if (compareScore(s, best) > 0) best = s;
    const tops = scores.map((s) => compareScore(s, best) === 0);
    const n = tops.filter(Boolean).length;
    tops.forEach((t, k) => {
      if (t) share[k] += 1 / n;
    });
    total++;
  };

  if (need === 0) play([]);
  else if (need <= 2) for (const extra of boards(deck, need)) play(extra);
  else {
    const pool = deck.slice();
    for (let s = 0; s < PREFLOP_SAMPLES; s++) {
      // Partial Fisher-Yates: the first `need` cards are a fresh sample.
      for (let j = 0; j < need; j++) {
        const r = j + Math.floor(rand() * (pool.length - j));
        const t = pool[j];
        pool[j] = pool[r];
        pool[r] = t;
      }
      play(pool.slice(0, need));
    }
  }
  ids.forEach((id, k) => {
    out[id] = total ? Math.round((share[k] / total) * 100) : 0;
  });
  return out;
}

// The runout re-renders often: the same hands and board give the same answer.
const cache = new Map<string, Equity>();

export function cachedEquity(hands: Record<string, string[]>, board: string[]): Equity {
  const key = Object.keys(hands).sort().map((id) => `${id}:${hands[id].join("")}`).join("|") + "/" + board.join("");
  const hit = cache.get(key);
  if (hit) return hit;
  const eq = equity(hands, board);
  if (cache.size > 64) cache.clear();
  cache.set(key, eq);
  return eq;
}
