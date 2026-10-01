import { describe, expect, it } from "vitest";
import { act, autoNext, createRoom, publicView, rebuy, sit, startHand, tableChips, type EngineState } from "./engine";

const NOW = 1_700_000_000_000;

function tourney(n: number): EngineState {
  const st = createRoom("TOUR1", "p1", { sb: 5, bb: 10, stack: 500, casual: true, tournament: true, blindLevelSecs: 300 }, NOW);
  for (let i = 1; i <= n; i++) sit(st, `p${i}`, `P${i}`, `s${i}`, false);
  return st;
}

// Everyone goes all-in and calls until the hand ends.
function shove(st: EngineState, now: number) {
  let guard = 0;
  while (st.phase !== "showdown" && guard++ < 20) {
    const b = st.betting!;
    const seat = b.seats.find((s) => s.id === b.toAct)!;
    act(st, b.toAct, b.currentBet > seat.bet ? "call" : "all-in", 0, now);
  }
}

describe("online tournament", () => {
  it("closes the door and forbids rebuys once dealt", () => {
    const st = tourney(3);
    startHand(st, "p1", NOW);
    expect(st.tStarted).toBe(true);
    expect(() => sit(st, "late", "Late", "x", false)).toThrow(/torneo/i);
    expect(() => rebuy(st, "p2")).toThrow(/recompras/i);
    expect(publicView(st).tournament).toBe(true);
    expect(publicView(st).nextBlindsAt).toBe(NOW + 300_000);
  });

  it("plays down to one winner who holds every chip", () => {
    const st = tourney(4);
    const total = tableChips(st);
    startHand(st, "p1", NOW);
    let now = NOW;
    for (let hand = 0; hand < 60 && !st.tFinished; hand++) {
      shove(st, now);
      if (st.tFinished) break;
      now = st.deadline + 1;
      expect(autoNext(st, now)).toBe(true);
    }
    expect(st.tFinished).toBe(true);
    const view = publicView(st);
    expect(view.ranking?.length).toBe(4);
    const winner = view.ranking![0].id;
    expect(st.chips[winner]).toBe(total);
    // Busted players already stood up (cash-out of 0), the winner is still seated.
    expect(Object.keys(st.players)).toContain(winner);
    expect(st.autoDeal).toBe(false);
  });
});
