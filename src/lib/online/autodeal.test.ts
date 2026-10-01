import { describe, expect, it } from "vitest";
import { act, autoNext, createRoom, setPaused, sit, startHand, type EngineState } from "./engine";
import { NEXT_HAND_MS } from "./protocol";

const NOW = 1_700_000_000_000;

function room(n: number): EngineState {
  const st = createRoom("AUTO1", "p1", { sb: 5, bb: 10, stack: 1000 }, NOW);
  for (let i = 1; i <= n; i++) sit(st, `p${i}`, `P${i}`, `s${i}`, true);
  return st;
}

// Everyone folds to the big blind: the hand ends without a showdown.
function foldAround(st: EngineState, now: number) {
  while (st.phase !== "showdown") act(st, st.betting!.toAct, "fold", 0, now);
}

describe("automatic next hand", () => {
  it("arms a pause after the hand and deals when it is over", () => {
    const st = room(3);
    startHand(st, "p1", NOW);
    foldAround(st, NOW);
    expect(st.deadline).toBe(NOW + NEXT_HAND_MS);
    expect(autoNext(st, NOW + NEXT_HAND_MS - 1)).toBe(false);
    const hand = st.handNum;
    expect(autoNext(st, NOW + NEXT_HAND_MS)).toBe(true);
    expect(st.handNum).toBe(hand + 1);
    expect(st.phase).toBe("preflop");
  });

  it("does not deal while paused", () => {
    const st = room(2);
    startHand(st, "p1", NOW);
    foldAround(st, NOW);
    setPaused(st, "p1", true, NOW);
    expect(autoNext(st, NOW + 60_000)).toBe(false);
  });

  it("stops when fewer than two players have chips", () => {
    const st = room(2);
    startHand(st, "p1", NOW);
    // p2 (the button, first to act heads-up) shoves, p1 calls: someone busts.
    act(st, st.betting!.toAct, "all-in", 0, NOW);
    act(st, st.betting!.toAct, "call", 0, NOW);
    expect(st.phase).toBe("showdown");
    const funded = Object.values(st.chips).filter((c) => c > 0).length;
    const later = st.deadline + 1;
    expect(autoNext(st, later)).toBe(true);
    if (funded < 2) {
      expect(st.autoDeal).toBe(false);
      expect(st.phase).toBe("showdown");
    } else {
      expect(st.phase).toBe("preflop");
    }
  });

  it("waits longer after an all-in runout", () => {
    const st = room(2);
    startHand(st, "p1", NOW);
    act(st, st.betting!.toAct, "all-in", 0, NOW);
    act(st, st.betting!.toAct, "call", 0, NOW);
    expect(st.deadline - NOW).toBeGreaterThan(NEXT_HAND_MS + 5_000);
  });
});
