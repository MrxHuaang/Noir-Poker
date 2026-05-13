/// <reference lib="webworker" />
import type { Card } from "@/lib/poker";
import { makeDeck, shuffle } from "@/lib/poker";
import { bestHand, compareScore, type Score } from "@/lib/handEval";

type SeatLite = {
  id: string;
  hole: [Card, Card];
  folded: boolean;
};

type EquityReq = {
  type: "equity";
  seats: SeatLite[];
  community: Card[];
  trials?: number;
};

type RunReq = {
  type: "run";
  seats: SeatLite[];
  community: Card[];
  N: number;
};

type Req = EquityReq | RunReq;

type EquityRes = {
  type: "equity";
  equity: Record<string, number>;
  outs: Record<string, number>;
};

type RunOne = {
  community: Card[];
  winners: string[];
  category: number;
};

type RunRes = {
  type: "run";
  runs: RunOne[];
};

function unseenDeck(seats: SeatLite[], community: Card[]): Card[] {
  const used = new Set<string>();
  for (const s of seats) {
    used.add(s.hole[0].id);
    used.add(s.hole[1].id);
  }
  for (const c of community) used.add(c.id);
  return makeDeck().filter((c) => !used.has(c.id));
}

function distribute(
  acc: Record<string, number>,
  active: SeatLite[],
  community5: Card[],
  weight = 1,
) {
  let bestScore: Score | null = null;
  const scores: Record<string, Score> = {};
  for (const s of active) {
    const sc = bestHand([...s.hole, ...community5]);
    scores[s.id] = sc;
    if (!bestScore || compareScore(sc, bestScore) > 0) bestScore = sc;
  }
  const winners = active.filter(
    (s) => compareScore(scores[s.id], bestScore!) === 0,
  );
  const share = weight / winners.length;
  for (const w of winners) acc[w.id] = (acc[w.id] || 0) + share;
}

function computeEquity(req: EquityReq): EquityRes {
  const active = req.seats.filter((s) => !s.folded);
  const equity: Record<string, number> = {};
  const outs: Record<string, number> = {};
  for (const s of req.seats) {
    equity[s.id] = 0;
    outs[s.id] = 0;
  }
  if (active.length === 0) return { type: "equity", equity, outs };
  if (active.length === 1) {
    equity[active[0].id] = 1;
    return { type: "equity", equity, outs };
  }

  const unseen = unseenDeck(req.seats, req.community);
  const missing = 5 - req.community.length;

  if (missing === 0) {
    distribute(equity, active, req.community, 1);
  } else if (missing === 1) {
    // exact: try every card
    for (const c of unseen) {
      distribute(equity, active, [...req.community, c], 1 / unseen.length);
    }
    // outs per active: cards that make this seat sole winner
    for (const s of active) {
      let count = 0;
      for (const c of unseen) {
        const board = [...req.community, c];
        let best: Score | null = null;
        const scores: Record<string, Score> = {};
        for (const a of active) {
          const sc = bestHand([...a.hole, ...board]);
          scores[a.id] = sc;
          if (!best || compareScore(sc, best) > 0) best = sc;
        }
        if (compareScore(scores[s.id], best!) === 0) {
          const winners = active.filter(
            (x) => compareScore(scores[x.id], best!) === 0,
          );
          if (winners.length === 1) count++;
        }
      }
      outs[s.id] = count;
    }
  } else if (missing === 2) {
    let total = 0;
    for (let i = 0; i < unseen.length; i++) {
      for (let j = i + 1; j < unseen.length; j++) {
        distribute(equity, active, [...req.community, unseen[i], unseen[j]], 1);
        total++;
      }
    }
    for (const k in equity) equity[k] /= total;
  } else {
    // preflop: MC
    const trials = req.trials ?? 5000;
    for (let t = 0; t < trials; t++) {
      const sh = shuffle(unseen);
      const board = sh.slice(0, 5);
      distribute(equity, active, board, 1 / trials);
    }
  }

  return { type: "equity", equity, outs };
}

function computeRuns(req: RunReq): RunRes {
  const active = req.seats.filter((s) => !s.folded);
  const unseen = unseenDeck(req.seats, req.community);
  const missing = 5 - req.community.length;
  const runs: RunOne[] = [];
  for (let i = 0; i < req.N; i++) {
    const sh = shuffle(unseen);
    const extra = sh.slice(0, missing);
    const community5 = [...req.community, ...extra];
    let best: Score | null = null;
    const scores: Record<string, Score> = {};
    for (const s of active) {
      const sc = bestHand([...s.hole, ...community5]);
      scores[s.id] = sc;
      if (!best || compareScore(sc, best) > 0) best = sc;
    }
    const winners = active
      .filter((s) => compareScore(scores[s.id], best!) === 0)
      .map((s) => s.id);
    runs.push({
      community: community5,
      winners,
      category: best![0],
    });
  }
  return { type: "run", runs };
}

self.onmessage = (e: MessageEvent<Req>) => {
  const req = e.data;
  if (req.type === "equity") {
    (self as unknown as Worker).postMessage(computeEquity(req));
  } else if (req.type === "run") {
    (self as unknown as Worker).postMessage(computeRuns(req));
  }
};

export {};
