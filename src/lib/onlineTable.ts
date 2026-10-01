// Adapts the online mode's run-it-N results for the runs modal. Pure mapping,
// NO game rules live here: the server already settled the pots.
import type { Card } from "./poker";
import { cardFromId } from "./poker";
import { bestHand, categoryFor } from "./handEval";
import type { RunResult } from "./online/protocol";
import type { RunOne } from "@/lib/poker";

function parseCards(ids: string[] | undefined): Card[] {
  if (!ids) return [];
  const out: Card[] = [];
  for (const id of ids) {
    const c = cardFromId(id);
    if (c) out.push(c);
  }
  return out;
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
