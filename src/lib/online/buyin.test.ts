import { describe, expect, it } from "vitest";
import {
  act,
  approve,
  buyInFor,
  buyInRange,
  configure,
  createRoom,
  publicView,
  rebuy,
  show,
  sit,
  startHand,
  type EngineState,
} from "./engine";
import type { TableRules } from "./protocol";

const NOW = 1_700_000_000_000;

function room(rules: Partial<TableRules> = {}, cfg = {}): EngineState {
  return createRoom("BUY01", "p1", { sb: 5, bb: 10, stack: 1000, casual: true, rules, ...cfg }, NOW);
}

describe("buy-in range", () => {
  it("keeps the fixed stack when there is no range", () => {
    const st = room();
    expect(buyInRange(st)).toEqual({ min: 1000, max: 1000 });
    sit(st, "p1", "P1", "s1", false, 400);
    expect(st.chips.p1).toBe(1000);
    expect(st.players.p1.buyIn).toBe(1000);
  });

  it("seats each player with what they bring, clamped to the range", () => {
    const st = room({ buyInMin: 400, buyInMax: 2000 });
    expect(publicView(st).buyIn).toEqual({ min: 400, max: 2000 });
    sit(st, "p1", "P1", "s1", false, 700);
    sit(st, "p2", "P2", "s2", false, 99_999);
    sit(st, "p3", "P3", "s3", false, 5);
    sit(st, "p4", "P4", "s4", false);
    expect([st.chips.p1, st.chips.p2, st.chips.p3, st.chips.p4]).toEqual([700, 2000, 400, 1000]);
    expect(st.players.p2.buyIn).toBe(2000);
  });

  it("never goes below two big blinds and repairs an inverted range", () => {
    const st = room({ buyInMin: 1, buyInMax: 3 });
    expect(buyInRange(st)).toEqual({ min: 20, max: 20 });
    sit(st, "p1", "P1", "s1", false);
    configure(st, "p1", { rules: { buyInMin: 900, buyInMax: 300 } }, NOW);
    expect(buyInRange(st)).toEqual({ min: 900, max: 900 });
  });

  it("tournaments ignore the range", () => {
    const st = room({ buyInMin: 100, buyInMax: 5000 }, { tournament: true });
    expect(buyInRange(st)).toEqual({ min: 1000, max: 1000 });
    expect(publicView(st).buyIn).toBeUndefined();
  });

  it("an approved request sits with the amount asked for", () => {
    const st = room({ buyInMin: 200, buyInMax: 2000, approveSeats: true });
    sit(st, "p1", "P1", "s1", false);
    expect(sit(st, "p2", "P2", "s2", false, 1500)).toBe("requested");
    approve(st, "p1", "p2");
    expect(st.chips.p2).toBe(1500);
  });

  it("rebuys inside the range", () => {
    const st = room({ buyInMin: 200, buyInMax: 2000 });
    sit(st, "p1", "P1", "s1", false, 500);
    st.chips.p1 = 0;
    expect(rebuy(st, "p1", 1800)).toBe(1800);
    expect(st.players.p1.buyIn).toBe(2300);
    expect(buyInFor(st, 50)).toBe(200);
  });
});

describe("show one card", () => {
  function finished(): EngineState {
    const st = room();
    sit(st, "p1", "P1", "s1", false);
    sit(st, "p2", "P2", "s2", false);
    startHand(st, "p1", NOW);
    // Everyone folds to one: no showdown reveal.
    act(st, st.betting!.toAct, "fold", 0, NOW);
    expect(st.phase).toBe("showdown");
    return st;
  }

  it("turns up the left card, then the right one completes the reveal", () => {
    const st = finished();
    const winner = st.winners[0].id;
    const h = st.holes[winner];
    show(st, winner, 0);
    expect(publicView(st).shown?.[winner]).toEqual([h[0], ""]);
    expect(publicView(st).reveals?.[winner]).toBeUndefined();
    show(st, winner, 1);
    expect(publicView(st).reveals?.[winner]).toEqual(h);
    expect(publicView(st).shown).toBeUndefined();
  });

  it("shows both at once without a card index", () => {
    const st = finished();
    const winner = st.winners[0].id;
    show(st, winner);
    expect(publicView(st).reveals?.[winner]).toEqual(st.holes[winner]);
  });

  it("forgets shown cards on the next deal", () => {
    const st = finished();
    const winner = st.winners[0].id;
    show(st, winner, 1);
    startHand(st, "p1", NOW + 10_000);
    expect(st.shown).toBeUndefined();
  });
});

describe("ambience", () => {
  it("keeps known ids and ignores the rest", () => {
    const st = room();
    sit(st, "p1", "P1", "s1", false);
    configure(st, "p1", { ambience: { place: "jazz", felt: "rojo" as never, rail: "nogal", dealer: "conde" } }, NOW);
    expect(publicView(st).ambience).toEqual({ place: "jazz", felt: "verde", rail: "nogal", dealer: "conde" });
    configure(st, "p1", { ambience: { dealer: "nadie" as never } }, NOW);
    expect(publicView(st).ambience?.dealer).toBe("conde");
  });
});
