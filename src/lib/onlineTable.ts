// Adapts the Go server's PublicState (online mode) to the view-model the rich
// table components consume (NormalSeat / BettingRound from the legacy engine).
// Pure mapping — NO game rules live here: the server already validated
// everything; this only reshapes data for TableShell / BettingDock.
import type { BettingRound, NormalSeat, SeatStatus } from "./betting";
import type { Card } from "./poker";
import { cardFromId } from "./poker";
import { bestHand, categoryFor } from "./handEval";
import type { PublicState, RunResult } from "@/hooks/useGameSocket";
import type { RunOne } from "@/hooks/useEquity";

const SEAT_STATUS: Record<string, SeatStatus> = {
  active: "active",
  folded: "folded",
  "all-in": "all-in",
  out: "out",
};

function parseCards(ids: string[] | undefined): Card[] {
  if (!ids) return [];
  const out: Card[] = [];
  for (const id of ids) {
    const c = cardFromId(id);
    if (c) out.push(c);
  }
  return out;
}

function parsePair(ids: string[] | undefined): [Card, Card] | null {
  const cards = parseCards(ids);
  return cards.length === 2 ? [cards[0], cards[1]] : null;
}

export type OnlineTableView = {
  seats: NormalSeat[];
  betting: BettingRound;
  community: Card[];
  ownHole: [Card, Card] | null;
  revealedHoles: Record<string, [Card, Card]> | undefined;
  winners: string[] | undefined;
};

export function adaptOnlineState(
  state: PublicState | null,
  hole: string[] | null,
): OnlineTableView {
  const seats: NormalSeat[] = (state?.seats ?? []).map((s) => ({
    id: s.id,
    name: s.name || s.id.slice(0, 6),
    seed: s.seed || s.id,
    ownerUid: s.id,
    chips: s.chips,
    bet: s.bet ?? 0,
    totalBet: s.totalBet ?? s.bet ?? 0,
    revealed: !!state?.reveals?.[s.id],
    status: SEAT_STATUS[s.status] ?? "active",
    timeBank: 0,
    turnDeadline:
      state && state.toAct === s.id && state.deadline ? state.deadline : null,
  }));

  const dealerIdx = state?.dealer
    ? seats.findIndex((s) => s.id === state.dealer)
    : -1;

  const betting: BettingRound = {
    pot: state?.pot ?? 0,
    sidePots: [],
    currentBet: state?.currentBet ?? 0,
    minRaise: state?.minRaise ?? state?.bb ?? 0,
    bigBlind: state?.bb ?? 0,
    toActId: state?.toAct || null,
    lastAggressorId: null,
    dealerIdx,
    sbIdx: -1,
    bbIdx: -1,
    handNum: state?.handNum ?? 0,
    actedThisRound: [],
  };

  let revealedHoles: Record<string, [Card, Card]> | undefined;
  if (state?.reveals) {
    revealedHoles = {};
    for (const [id, ids] of Object.entries(state.reveals)) {
      const pair = parsePair(ids);
      if (pair) revealedHoles[id] = pair;
    }
    if (Object.keys(revealedHoles).length === 0) revealedHoles = undefined;
  }

  return {
    seats,
    betting,
    community: parseCards(state?.board),
    ownHole: parsePair(hole ?? undefined),
    revealedHoles,
    winners: state?.winners?.length ? state.winners.map((w) => w.id) : undefined,
  };
}

// Adapts run-it-N results for the RunResults modal. The winning hand category
// per run is computed client-side from PUBLIC data (revealed holes + run
// board) — display only, the server already settled the pots.
export function adaptOnlineRuns(
  runs: RunResult[] | undefined,
  reveals: Record<string, string[]> | undefined,
): RunOne[] | null {
  if (!runs || runs.length <= 1) return null;
  return runs.map((run) => {
    const community = parseCards(run.board);
    const winnerIds = run.winners.map((w) => w.id);
    let category = 0;
    const firstWinnerHole = winnerIds.length
      ? parseCards(reveals?.[winnerIds[0]])
      : [];
    if (firstWinnerHole.length === 2 && community.length === 5) {
      category = categoryFor(bestHand([...firstWinnerHole, ...community]));
    }
    return { community, winners: winnerIds, category };
  });
}
