import { describe, expect, it } from "vitest";
import {
  act,
  approve,
  autoNext,
  blindsAt,
  createRoom,
  deny,
  kick,
  normalizeRules,
  publicView,
  setAway,
  sit,
  startHand,
  tableChips,
  timeout,
  voteRun,
  type EngineState,
} from "./engine";
import type { TableRules } from "./protocol";

const NOW = 1_700_000_000_000;

function room(n: number, rules: Partial<TableRules> = {}, cfg = {}): EngineState {
  const st = createRoom("RULE1", "p1", { sb: 5, bb: 10, stack: 1000, casual: true, rules, ...cfg }, NOW);
  for (let i = 1; i <= n; i++) sit(st, `p${i}`, `P${i}`, `s${i}`, false);
  return st;
}

// Everyone still able to act shoves or calls.
function allIn(st: EngineState, now = NOW) {
  let guard = 0;
  while (st.betting && st.betting.toAct && guard++ < 20) {
    const b = st.betting;
    const seat = b.seats.find((s) => s.id === b.toAct)!;
    act(st, b.toAct, b.currentBet > seat.bet ? "call" : "all-in", 0, now);
  }
}

describe("normalizeRules", () => {
  it("clamps nonsense into sane rules", () => {
    const r = normalizeRules({ turnSecs: 2, maxSeats: 40, showdownSecs: 7, levels: [{ sb: 50, bb: 10, ante: -3, mins: 999 }] });
    expect(r.turnSecs).toBe(5);
    expect(r.maxSeats).toBe(9);
    expect(r.showdownSecs).toBe(6);
    expect(r.levels[0]).toEqual({ sb: 50, bb: 50, ante: 0, mins: 240 });
  });
});

describe("antes and blind levels", () => {
  it("posts antes as dead money", () => {
    const st = room(3, { ante: 2 });
    startHand(st, "p1", NOW);
    // 3 antes + 5 + 10
    expect(st.betting!.pot).toBe(21);
    expect(st.betting!.currentBet).toBe(10);
    expect(tableChips(st)).toBe(3000);
  });

  it("climbs the schedule and holds the last level", () => {
    const st = room(2, {
      levels: [
        { sb: 5, bb: 10, ante: 0, mins: 10 },
        { sb: 10, bb: 20, ante: 2, mins: 10 },
        { sb: 25, bb: 50, ante: 5, mins: 0 },
      ],
    });
    expect(blindsAt(st, NOW).bb).toBe(10);
    expect(blindsAt(st, NOW + 10 * 60_000)).toMatchObject({ bb: 20, ante: 2, level: 2 });
    expect(blindsAt(st, NOW + 25 * 60_000)).toMatchObject({ bb: 50, level: 3, nextAt: 0 });
    expect(blindsAt(st, NOW + 5 * 60_000).nextAt).toBe(NOW + 10 * 60_000);
  });
});

describe("decision time and time bank", () => {
  it("uses the bank before folding, then folds", () => {
    const st = room(2, { turnSecs: 10, bankSecs: 20 });
    startHand(st, "p1", NOW);
    const who = st.betting!.toAct;
    expect(st.deadline).toBe(NOW + 10_000);
    expect(timeout(st, NOW + 10_000, () => false)).toBe(true);
    expect(st.betting!.toAct).toBe(who);
    expect(publicView(st).timeBank).toBe(true);
    expect(st.deadline).toBe(NOW + 30_000);
    expect(timeout(st, NOW + 30_000, () => false)).toBe(true);
    expect(st.betting!.toAct === who && st.phase !== "showdown").toBe(false);
  });

  it("has no clock when the decision time is unlimited", () => {
    const st = room(2, { turnSecs: 0 });
    startHand(st, "p1", NOW);
    expect(st.deadline).toBe(0);
  });
});

describe("run it: the game asks", () => {
  it("runs twice only when everyone in the all-in agrees", () => {
    const st = room(2, { runItMode: "ask", revealAllIn: true });
    startHand(st, "p1", NOW);
    allIn(st);
    expect(st.runVote).toBeDefined();
    expect(Object.keys(publicView(st).reveals ?? {})).toHaveLength(2);
    voteRun(st, "p1", 2, NOW);
    expect(st.phase).not.toBe("showdown");
    voteRun(st, "p2", 2, NOW);
    expect(st.phase).toBe("showdown");
    expect(st.runs).toHaveLength(2);
  });

  it("runs once when someone says once or the clock runs out", () => {
    const st = room(2, { runItMode: "ask" });
    startHand(st, "p1", NOW);
    allIn(st);
    voteRun(st, "p1", 2, NOW);
    expect(timeout(st, st.deadline, () => false)).toBe(true);
    expect(st.phase).toBe("showdown");
    expect(st.runs).toHaveLength(0);
    expect(tableChips(st)).toBe(2000);
  });

  it("does not restart the vote clock when someone votes again", () => {
    const st = room(2, { runItMode: "ask" });
    startHand(st, "p1", NOW);
    allIn(st);
    const deadline = st.deadline;
    voteRun(st, "p1", 2, NOW + 5_000);
    voteRun(st, "p1", 2, NOW + 9_000);
    expect(st.deadline).toBe(deadline);
    expect(timeout(st, deadline, () => false)).toBe(true);
    expect(st.phase).toBe("showdown");
  });
});

describe("rabbit hunting", () => {
  it("shows the cards that would have come after a fold", () => {
    const st = room(2, { rabbit: true });
    startHand(st, "p1", NOW);
    act(st, st.betting!.toAct, "fold", 0, NOW);
    expect(publicView(st).rabbit).toHaveLength(5);
  });
});

describe("seats: cap, approval, away, kick", () => {
  it("caps the table and queues the rest", () => {
    const st = room(4, { maxSeats: 3 });
    expect(st.seatIds).toHaveLength(3);
    expect(st.waiting).toEqual(["p4"]);
  });

  it("lets the owner decide who sits", () => {
    const st = createRoom("RULE2", "p1", { casual: true, rules: { approveSeats: true } }, NOW);
    expect(sit(st, "p1", "P1", "s1", false)).toBe("seated");
    expect(sit(st, "p2", "P2", "s2", false)).toBe("requested");
    expect(publicView(st).requests).toEqual([{ id: "p2", name: "P2" }]);
    expect(() => approve(st, "p2", "p2")).toThrow();
    expect(approve(st, "p1", "p2")).toBe("seated");
    expect(sit(st, "p3", "P3", "s3", false)).toBe("requested");
    deny(st, "p1", "p3");
    expect(publicView(st).requests).toBeUndefined();
  });

  it("does not deal to players who stepped away", () => {
    const st = room(3);
    setAway(st, "p3", true);
    startHand(st, "p1", NOW);
    expect(st.betting!.seats.map((s) => s.id)).not.toContain("p3");
    expect(publicView(st).seats.find((s) => s.id === "p3")).toBeUndefined();
  });

  it("kicks a player out and keeps them in the session book", () => {
    const st = room(3);
    kick(st, "p1", "p3", NOW);
    expect(st.players.p3).toBeUndefined();
    expect(st.payouts.find((p) => p.uid === "p3")?.amount).toBe(1000);
    expect(publicView(st).ledger?.find((l) => l.id === "p3")).toMatchObject({ left: true, stack: 1000 });
  });

  it("waits for the owner when auto-start is off", () => {
    const st = room(2, { autoStart: false });
    startHand(st, "p1", NOW);
    act(st, st.betting!.toAct, "fold", 0, NOW);
    expect(st.phase).toBe("showdown");
    expect(st.deadline).toBe(0);
    expect(autoNext(st, NOW + 60_000)).toBe(false);
  });
});
