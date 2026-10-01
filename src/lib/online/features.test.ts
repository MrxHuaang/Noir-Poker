import { describe, expect, it } from "vitest";
import {
  act,
  autoNext,
  back,
  createRoom,
  handRecord,
  markPresence,
  publicView,
  react,
  show,
  sit,
  startHand,
  tableChips,
  timeout,
  type EngineState,
} from "./engine";
import { statDeltas, statsView } from "./stats";
import type { TableRules } from "./protocol";

const NOW = 1_700_000_000_000;

function room(n: number, rules: Partial<TableRules> = {}): EngineState {
  const st = createRoom("FEAT1", "p1", { sb: 5, bb: 10, stack: 1000, casual: true, rules }, NOW);
  for (let i = 1; i <= n; i++) sit(st, `p${i}`, `P${i}`, `s${i}`, false);
  return st;
}

const seatOf = (st: EngineState, id: string) => st.betting!.seats.find((s) => s.id === id)!;

describe("straddle", () => {
  it("the seat after the big blind posts two big blinds and speaks last", () => {
    const st = room(4, { straddle: true });
    startHand(st, "p1", NOW);
    const b = st.betting!;
    const str = st.straddler!;
    expect(seatOf(st, str).bet).toBe(20);
    expect(b.currentBet).toBe(20);
    expect(b.toAct).not.toBe(str);
    expect(publicView(st).seats.find((s) => s.id === str)?.straddle).toBe(true);
    // Everyone calls round to the straddle, who still has the option.
    let guard = 0;
    while (b.toAct && b.toAct !== str && guard++ < 10) act(st, b.toAct, "call", 0, NOW);
    expect(b.toAct).toBe(str);
    act(st, str, "check", 0, NOW);
    expect(st.phase).toBe("flop");
    expect(tableChips(st)).toBe(4000);
  });

  it("is skipped heads-up", () => {
    const st = room(2, { straddle: true });
    startHand(st, "p1", NOW);
    expect(st.straddler).toBeUndefined();
  });
});

describe("bomb pot", () => {
  it("everyone antes and the hand starts on the flop", () => {
    const st = room(3, { bombEvery: 1, bombBB: 2 });
    startHand(st, "p1", NOW);
    expect(st.bomb).toBe(true);
    expect(st.phase).toBe("flop");
    expect(st.board).toHaveLength(3);
    expect(st.betting!.pot).toBe(60);
    expect(st.betting!.currentBet).toBe(0);
    expect(st.betting!.toAct).not.toBe("");
    expect(publicView(st).bomb).toBe(true);
    expect(tableChips(st)).toBe(3000);
  });

  it("comes every N hands", () => {
    const st = room(2, { bombEvery: 2 });
    startHand(st, "p1", NOW);
    expect(st.bomb).toBe(false);
    act(st, st.betting!.toAct, "fold", 0, NOW);
    autoNext(st, st.deadline + 1);
    expect(st.bomb).toBe(true);
  });
});

describe("show after the hand", () => {
  it("the winner of an uncalled pot may show; a folder may not", () => {
    const st = room(2);
    startHand(st, "p1", NOW);
    const folder = st.betting!.toAct;
    act(st, folder, "fold", 0, NOW);
    const winner = Object.keys(st.holes).find((id) => id !== folder)!;
    expect(() => show(st, folder)).toThrow();
    show(st, winner);
    expect(publicView(st).reveals?.[winner]).toEqual(st.holes[winner]);
  });

  it("not during the hand", () => {
    const st = room(2);
    startHand(st, "p1", NOW);
    expect(() => show(st, "p1")).toThrow();
  });
});

describe("reactions", () => {
  it("are public and rate limited", () => {
    const st = room(2);
    react(st, "p1", "hat", NOW);
    expect(publicView(st).reaction).toEqual({ seatId: "p1", kind: "hat", ts: NOW });
    expect(() => react(st, "p1", "tap", NOW + 100)).toThrow();
    react(st, "p1", "tap", NOW + 3000);
    expect(() => react(st, "p1", "dance", NOW + 9000)).toThrow();
    expect(() => react(st, "nobody", "hat", NOW)).toThrow();
  });
});

describe("dropped connections", () => {
  it("a stale player on the clock is acted for and kept seated", () => {
    const st = room(3);
    startHand(st, "p1", NOW);
    const id = st.betting!.toAct;
    expect(timeout(st, st.deadline, (u) => u === id)).toBe(true);
    expect(st.players[id]).toBeDefined();
    expect(publicView(st).seats.find((s) => s.id === id)?.gone).toBe(true);
    expect(seatOf(st, id).status).toBe("folded");
  });

  it("the gone are skipped at the deal, the long gone stand up, the returned play again", () => {
    const st = room(3);
    markPresence(st, (u) => (u === "p2" ? 100_000 : u === "p3" ? 400_000 : 0), 75_000, 300_000, NOW);
    expect(st.players.p3).toBeUndefined();
    expect(st.gone?.p2).toBe(true);
    st.chips.p4 = 0;
    sit(st, "p4", "P4", "s4", false);
    startHand(st, "p1", NOW);
    expect(Object.keys(st.holes).sort()).toEqual(["p1", "p4"]);
    expect(back(st, "p2")).toBe(true);
    expect(st.gone?.p2).toBeUndefined();
  });
});

describe("stats", () => {
  it("counts VPIP, PFR, flops and showdowns from the hand record", () => {
    const st = room(3);
    startHand(st, "p1", NOW);
    const b = st.betting!;
    const first = b.toAct;
    act(st, first, "raise", 30, NOW);
    const second = b.toAct;
    act(st, second, "call", 0, NOW);
    const third = b.toAct;
    act(st, third, "fold", 0, NOW);
    // Check it down.
    let guard = 0;
    while (st.phase !== "showdown" && guard++ < 20) act(st, st.betting!.toAct, "check", 0, NOW);
    const rec = handRecord(st, NOW)!;
    expect(rec.vpip?.sort()).toEqual([first, second].sort());
    expect(rec.pfr).toEqual([first]);
    expect(rec.sawFlop?.sort()).toEqual([first, second].sort());
    const d = statDeltas(rec);
    expect(d[third]).toMatchObject({ hands: 1, vpip: 0, sawFlop: 0, showdowns: 0 });
    expect(d[first].showdowns).toBe(1);
    expect(d[first].showdownsWon + d[second].showdownsWon).toBeGreaterThanOrEqual(1);
  });

  it("turns totals into percentages", () => {
    const v = statsView({ hands: 10, vpip: 3, pfr: 2, sawFlop: 4, showdowns: 2, showdownsWon: 1, potsWon: 3, biggestPot: 500 });
    expect(v).toMatchObject({ vpip: 30, pfr: 20, sawFlop: 40, wtsd: 50, wsd: 50 });
  });
});
