import { describe, expect, it } from "vitest";
import { chairFor, positionNames, toSceneSnapshot } from "./noirScene";
import { castFromSeed, seedForCast } from "./noirCast";
import type { PublicSeat, PublicState } from "./online/protocol";

const seat = (id: string, o: Partial<PublicSeat> = {}): PublicSeat => ({
  id,
  name: id.toUpperCase(),
  seed: id,
  chips: 1000,
  bet: 0,
  status: "active",
  hasCards: true,
  ...o,
});

const base = (o: Partial<PublicState> = {}): PublicState => ({
  code: "ABCD",
  handNum: 3,
  phase: "preflop",
  board: [],
  pot: 30,
  toAct: "c",
  deadline: 123,
  seats: [seat("a", { bet: 10 }), seat("b", { bet: 20 }), seat("c"), seat("d")],
  sb: 10,
  bb: 20,
  startStack: 1000,
  dealer: "d",
  ...o,
});

describe("chairFor", () => {
  it("puts the viewer in chair 0 and spreads the rest", () => {
    const chairs = [0, 1, 2, 3].map((k) => chairFor(k, 4, 2));
    expect(chairs[2]).toBe(0);
    expect(new Set(chairs).size).toBe(4);
  });
  it("uses distinct chairs for a full table", () => {
    const chairs = Array.from({ length: 9 }, (_, k) => chairFor(k, 9, 0));
    expect(new Set(chairs).size).toBe(9);
  });
});

describe("positionNames", () => {
  it("names from the button", () => {
    expect(positionNames(4, 3)).toEqual(["SB", "BB", "CO", "BTN"]);
    expect(positionNames(2, 0)).toEqual(["BTN", "BB"]);
  });
});

describe("toSceneSnapshot", () => {
  it("shows only the viewer's cards and keeps the pot without live bets", () => {
    const snap = toSceneSnapshot(base(), ["AS", "KS"], "b");
    const me = snap.seats[0]!;
    expect(me.id).toBe("b");
    expect(me.cards).toEqual(["AS", "KS"]);
    const others = snap.seats.filter((s) => s && s.id !== "b");
    expect(others.every((s) => s!.cards === "backs")).toBe(true);
    expect(snap.pot).toBe(0);
    expect(snap.seats.find((s) => s?.id === "d")?.pos).toBe("BTN");
    expect(snap.turn).toBe(snap.seats.findIndex((s) => s?.id === "c"));
  });

  it("reveals and describes hands at showdown", () => {
    const snap = toSceneSnapshot(
      base({
        phase: "showdown",
        toAct: "",
        board: ["AH", "AD", "7C", "2S", "9H"],
        reveals: { a: ["AC", "KD"], c: ["QS", "QH"] },
        winners: [{ id: "a", amount: 400 }],
      }),
      null,
      null,
    );
    const a = snap.seats.find((s) => s?.id === "a")!;
    expect(a.cards).toEqual(["AC", "KD"]);
    expect(a.hand).toMatch(/Trío/i);
    expect(snap.winners).toEqual([{ chair: snap.seats.indexOf(a), amount: 400 }]);
    expect(snap.turn).toBe(-1);
  });

  it("flags an all-in runout", () => {
    const snap = toSceneSnapshot(
      base({ seats: [seat("a", { status: "all-in", chips: 0 }), seat("b", { status: "all-in", chips: 0 }), seat("c", { status: "folded", hasCards: false })] }),
      null,
      "a",
    );
    expect(snap.allin).toBe(true);
  });

  it("empties the table between hands", () => {
    const snap = toSceneSnapshot(base({ phase: "idle" }), ["AS", "KS"], "a");
    expect(snap.seats.every((s) => !s || s.cards === null)).toBe(true);
    expect(snap.board).toEqual([]);
  });
});

describe("castFromSeed", () => {
  it("honours a chosen character and is stable otherwise", () => {
    expect(castFromSeed(seedForCast("lulu"))).toBe("lulu");
    expect(castFromSeed("some-seed")).toBe(castFromSeed("some-seed"));
  });
});
