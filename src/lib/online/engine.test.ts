import { describe, expect, it } from "vitest";
import {
  act,
  createRoom,
  leave,
  ownerOf,
  publicView,
  rebuy,
  sidePots,
  sit,
  startHand,
  tableChips,
  timeout,
  configure,
  type EngineState,
} from "./engine";
import { makeDeck, shuffle } from "../poker";
import { TURN_MS } from "./protocol";

const NOW = 1_700_000_000_000;

function room(n: number, cfg = {}): EngineState {
  const st = createRoom("TEST1", "p1", { sb: 5, bb: 10, stack: 1000, ...cfg }, NOW);
  for (let i = 1; i <= n; i++) sit(st, `p${i}`, `P${i}`, `s${i}`, true);
  return st;
}

// Deal order (no burns): seat i gets deck[2i, 2i+1] in seat order, then the
// board takes the next cards (flop 3, turn 1, river 1).
function deckWith(...ids: string[]): string[] {
  const rest = makeDeck()
    .map((c) => c.id)
    .filter((id) => !ids.includes(id));
  return [...ids, ...rest];
}

function play(st: EngineState, ...actions: string[]) {
  for (const a of actions) {
    const [name, amt] = a.split(":");
    act(st, st.betting!.toAct, name, Number(amt ?? 0), NOW);
  }
}

function paidTotal(st: EngineState): number {
  return st.payouts.reduce((t, p) => t + p.amount, 0);
}

describe("online engine", () => {
  it("needs two funded players", () => {
    const st = room(1);
    expect(() => startHand(st, "p1", NOW)).toThrow();
  });

  it("only the owner deals", () => {
    const st = room(2);
    expect(() => startHand(st, "p2", NOW)).toThrow(/anfitrion/);
  });

  it("plays a heads-up hand to showdown (AA beats KK)", () => {
    const st = room(2);
    startHand(st, "p1", NOW, deckWith("AS", "AH", "KS", "KH", "2C", "7D", "9S", "JH", "3C"));
    expect(st.dealerId).toBe("p1");
    expect(st.betting!.toAct).toBe("p1"); // HU: button/SB first preflop
    play(st, "call", "check", "check", "check", "check", "check", "check", "check");
    expect(st.phase).toBe("showdown");
    expect(st.winners).toEqual([{ id: "p1", amount: 20 }]);
    expect(st.chips).toEqual({ p1: 1010, p2: 990 });
    const pub = publicView(st);
    expect(pub.reveals?.p1).toHaveLength(2);
    expect(pub.reveals?.p2).toHaveLength(2);
    expect(pub.handCategories?.p1).toBe(1);
  });

  it("never exposes hole cards or the deck in the public view", () => {
    const st = room(3);
    startHand(st, "p1", NOW);
    const json = JSON.stringify(publicView(st));
    for (const h of Object.values(st.holes)) for (const c of h) expect(json).not.toContain(`"${c}"`);
    expect(json).not.toContain("deck");
  });

  it("postflop the non-button acts first heads-up", () => {
    const st = room(2);
    startHand(st, "p1", NOW);
    play(st, "call", "check");
    expect(st.phase).toBe("flop");
    expect(st.betting!.toAct).toBe("p2");
  });

  it("rotates the button and carries stacks", () => {
    const st = room(2);
    startHand(st, "p1", NOW, deckWith("AS", "AH", "KS", "KH", "2C", "7D", "9S", "JH", "3C"));
    play(st, "call", "check", "check", "check", "check", "check", "check", "check");
    startHand(st, "p1", NOW);
    expect(st.handNum).toBe(2);
    expect(st.dealerId).toBe("p2");
    const seat = (id: string) => st.betting!.seats.find((s) => s.id === id)!;
    expect(seat("p1").chips).toBe(1000); // 1010 - BB
    expect(seat("p2").chips).toBe(985); // 990 - SB
  });

  it("rejects a restart mid-hand", () => {
    const st = room(2);
    startHand(st, "p1", NOW);
    expect(() => startHand(st, "p1", NOW)).toThrow(/curso/);
  });

  it("fold to one awards the pot without reveals", () => {
    const st = room(3);
    startHand(st, "p1", NOW);
    play(st, "fold", "fold");
    expect(st.phase).toBe("showdown");
    expect(st.winners).toEqual([{ id: "p3", amount: 15 }]);
    expect(Object.keys(st.reveals)).toHaveLength(0);
    expect(tableChips(st)).toBe(3000);
  });

  it("enforces the min-raise and short all-in rules", () => {
    const st = room(2);
    startHand(st, "p1", NOW);
    expect(() => act(st, "p1", "raise", 15, NOW)).toThrow(/minimo/);
    act(st, "p1", "raise", 30, NOW);
    expect(st.betting!.currentBet).toBe(30);
    expect(st.betting!.minRaise).toBe(20);
    expect(() => act(st, "p2", "raise", 45, NOW)).toThrow(/minimo/);
    act(st, "p2", "raise", 50, NOW);
    expect(st.betting!.currentBet).toBe(50);
  });

  it("treats a bet facing a bet as a raise (never lowers the current bet)", () => {
    const st = room(2);
    startHand(st, "p1", NOW);
    play(st, "call", "check"); // flop, p2 first
    act(st, "p2", "bet", 50, NOW);
    act(st, "p1", "bet", 100, NOW); // raise by 100 over 50
    expect(st.betting!.currentBet).toBe(150);
    expect(st.betting!.toAct).toBe("p2");
  });

  it("rejects out-of-turn and unknown actions", () => {
    const st = room(3);
    startHand(st, "p1", NOW);
    expect(() => act(st, "p2", "call", 0, NOW)).toThrow(/turno/);
    expect(() => act(st, st.betting!.toAct, "nope", 0, NOW)).toThrow();
    expect(() => act(st, st.betting!.toAct, "call", -5, NOW)).toThrow();
  });

  it("builds side pots by all-in tiers and conserves chips", () => {
    const st = createRoom("T", "a", { sb: 5, bb: 10, stack: 1000 }, NOW);
    sit(st, "a", "A", "a", true);
    sit(st, "b", "B", "b", true);
    sit(st, "c", "C", "c", true);
    st.chips = { a: 100, b: 300, c: 1000 };
    startHand(st, "a", NOW);
    // 3-handed: dealer a, sb b, bb c, utg a.
    play(st, "all-in", "all-in", "call");
    expect(st.phase).toBe("showdown");
    expect(tableChips(st)).toBe(1400);
  });

  it("awards a dead tier to the players still in", () => {
    const b = {
      seats: [
        { id: "x", chips: 0, bet: 0, totalBet: 100, status: "folded" as const },
        { id: "y", chips: 0, bet: 0, totalBet: 50, status: "all-in" as const },
        { id: "z", chips: 0, bet: 0, totalBet: 50, status: "all-in" as const },
      ],
      pot: 200,
      currentBet: 0,
      minRaise: 10,
      bigBlind: 10,
      toAct: "",
      acted: [],
    };
    const pots = sidePots(b);
    expect(pots.reduce((t, p) => t + p.amount, 0)).toBe(200);
    for (const p of pots) expect(p.eligible.length).toBeGreaterThan(0);
  });

  it("runs the board out when both blinds are all-in from posting", () => {
    const st = room(2);
    st.chips = { p1: 5, p2: 10 };
    startHand(st, "p1", NOW);
    expect(st.phase).toBe("showdown");
    expect(st.board).toHaveLength(5);
    expect(tableChips(st)).toBe(15);
  });

  it("lets the big blind act when the small blind is all-in from posting", () => {
    const st = room(2);
    st.chips = { p1: 3, p2: 1000 };
    startHand(st, "p1", NOW);
    expect(st.betting!.toAct).toBe("p2");
    act(st, "p2", "check", 0, NOW);
    expect(st.phase).toBe("showdown");
    expect(tableChips(st)).toBe(1003);
  });

  it("runs it twice and splits the pot", () => {
    const st = room(2, { runItN: 2 });
    startHand(st, "p1", NOW);
    play(st, "all-in", "call");
    expect(st.phase).toBe("showdown");
    expect(st.runs).toHaveLength(2);
    const runTotal = st.runs.reduce((t, r) => t + r.pot, 0);
    expect(runTotal).toBe(2000);
    expect(tableChips(st)).toBe(2000);
    expect(new Set(st.runs.map((r) => r.board.join())).size).toBe(2);
  });

  it("auto-checks or folds on timeout and skips stale players without standing them up", () => {
    const st = room(3);
    startHand(st, "p1", NOW);
    const first = st.betting!.toAct;
    expect(timeout(st, NOW + 1000, () => false)).toBe(false);
    expect(timeout(st, NOW + TURN_MS + 1, () => false)).toBe(true);
    expect(st.betting!.seats.find((s) => s.id === first)!.status).toBe("folded");
    const second = st.betting!.toAct;
    expect(timeout(st, st.deadline + 1, (id) => id === second)).toBe(true);
    // A dropped connection keeps the seat: the deal stands them up only
    // after a long absence (markPresence).
    expect(st.players[second]).toBeDefined();
    expect(st.gone?.[second]).toBe(true);
    expect(st.payouts.map((p) => p.uid)).not.toContain(second);
  });

  it("leaving mid-hand folds and pays the stack behind", () => {
    const st = room(3);
    startHand(st, "p1", NOW);
    // dealer p1, sb p2 (5), bb p3 (10). p2 leaves before acting.
    leave(st, "p2", NOW);
    expect(st.payouts).toEqual([{ uid: "p2", amount: 995, buyIn: 1000, coins: true }]);
    play(st, "fold"); // p1 folds -> p3 wins
    expect(st.phase).toBe("showdown");
    expect(tableChips(st) + paidTotal(st)).toBe(3000);
    expect(publicView(st).seats.find((s) => s.id === "p2")?.status).toBe("folded");
  });

  it("an all-in player who leaves is paid when the hand settles", () => {
    const st = room(2);
    startHand(st, "p1", NOW);
    act(st, "p1", "all-in", 0, NOW);
    leave(st, "p1", NOW);
    expect(st.payouts).toHaveLength(0);
    act(st, "p2", "call", 0, NOW);
    expect(st.phase).toBe("showdown");
    expect(st.payouts).toHaveLength(1);
    expect(st.payouts[0].uid).toBe("p1");
    expect(tableChips(st) + paidTotal(st)).toBe(2000);
    expect(st.chips.p1).toBeUndefined();
  });

  it("cannot sit back into a hand still being settled", () => {
    const st = room(3);
    startHand(st, "p1", NOW);
    leave(st, "p2", NOW);
    expect(() => sit(st, "p2", "P2", "s2", true)).toThrow();
  });

  it("queues players beyond nine seats and promotes on leave", () => {
    const st = room(10);
    expect(st.seatIds).toHaveLength(9);
    expect(st.waiting).toEqual(["p10"]);
    leave(st, "p4", NOW);
    expect(st.seatIds).toContain("p10");
    expect(st.waiting).toHaveLength(0);
  });

  it("players sitting mid-hand join next hand", () => {
    const st = room(2);
    startHand(st, "p1", NOW);
    expect(sit(st, "p3", "P3", "s3", true)).toBe("joining");
    expect(publicView(st).joining).toEqual(["p3"]);
    play(st, "fold");
    expect(publicView(st).seats.map((s) => s.id)).toContain("p3");
    startHand(st, "p1", NOW);
    expect(st.betting!.seats).toHaveLength(3);
  });

  it("owner is the creator while present, else the earliest arrival", () => {
    const st = room(3);
    expect(ownerOf(st)).toBe("p1");
    leave(st, "p1", NOW);
    expect(ownerOf(st)).toBe("p2");
    sit(st, "p1", "P1", "s1", true);
    expect(ownerOf(st)).toBe("p1");
  });

  it("rebuy only when busted and between hands", () => {
    const st = room(2);
    expect(() => rebuy(st, "p1")).toThrow();
    st.chips.p1 = 0;
    expect(rebuy(st, "p1")).toBe(1000);
    expect(st.players.p1.buyIn).toBe(2000);
  });

  it("escalates blinds lazily and clamps config", () => {
    const st = room(2, { blindLevelSecs: 60 });
    startHand(st, "p1", NOW + 61_000);
    expect(st.sb).toBe(10);
    expect(st.bb).toBe(20);
    const st2 = room(2);
    configure(st2, "p1", { sb: -4, bb: 3, stack: 5, casual: true }, NOW);
    expect(st2.casual).toBe(false);
    expect(st2.bb).toBeGreaterThanOrEqual(st2.sb);
    expect(st2.startStack).toBeGreaterThanOrEqual(st2.bb * 2);
    expect(() => configure(st2, "p2", { sb: 1 }, NOW)).toThrow();
  });

  it("conserves chips over many random hands", () => {
    const st = room(6);
    const total = () => tableChips(st) + paidTotal(st);
    const initial = total();
    const choices = ["fold", "check", "call", "bet", "raise", "all-in"];
    for (let hand = 0; hand < 300; hand++) {
      const owner = ownerOf(st);
      const funded = st.seatIds.filter((id) => (st.chips[id] ?? 0) > 0);
      if (funded.length < 2) {
        for (const id of Object.keys(st.players)) if ((st.chips[id] ?? 0) === 0) rebuy(st, id);
      }
      startHand(st, owner, NOW, shuffle(makeDeck()).map((c) => c.id));
      let guard = 0;
      while (st.phase !== "showdown" && guard++ < 200) {
        const id = st.betting!.toAct;
        const a = choices[Math.floor(Math.random() * choices.length)];
        const amt = Math.floor(Math.random() * 400);
        try {
          act(st, id, a, amt, NOW);
        } catch {
          act(st, id, "fold", 0, NOW);
        }
      }
      expect(st.phase).toBe("showdown");
      const buyIns = Object.values(st.players).reduce((t, p) => t + p.buyIn, 0);
      expect(total()).toBe(buyIns);
    }
    expect(initial).toBe(6000);
  });
});
