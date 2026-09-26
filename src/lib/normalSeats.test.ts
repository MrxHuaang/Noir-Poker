import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  startHand,
  type NormalGameState,
  type NormalSeat,
} from "./betting";
import type { NormalLobbyPlayer } from "./normalRooms";
import {
  countDealable,
  detachSeats,
  indexLobby,
  lobbyChipsUpdates,
  nextHandSeats,
  settleSeats,
  voidHand,
  withTurnDeadline,
} from "./normalSeats";

function lobbyEntry(uid: string, chips: number, over: Partial<NormalLobbyPlayer> = {}): NormalLobbyPlayer {
  return { uid, name: uid, seed: uid, joinedAt: 1, chips, sittingOut: false, ...over };
}

function seat(id: string, chips: number, over: Partial<NormalSeat> = {}): NormalSeat {
  return {
    id,
    name: id,
    seed: id,
    ownerUid: id,
    chips,
    bet: 0,
    totalBet: 0,
    revealed: false,
    status: "waiting",
    timeBank: 0,
    turnDeadline: null,
    joinedAt: 1,
    ...over,
  };
}

function plan(prevSeats: NormalSeat[] | null, lobby: NormalLobbyPlayer[], extra: {
  prevDealerIdx?: number;
  pendingRebuys?: Record<string, number>;
  freeStack?: boolean;
} = {}) {
  return nextHandSeats({
    prevSeats,
    prevDealerIdx: extra.prevDealerIdx ?? -1,
    lobby,
    config: DEFAULT_CONFIG,
    pendingRebuys: extra.pendingRebuys ?? {},
    freeStack: extra.freeStack ?? false,
  });
}

describe("nextHandSeats", () => {
  it("drops seats whose lobby entry is gone and keeps the others' chips", () => {
    const res = plan(
      [seat("a", 700), seat("b", 300, { status: "out" }), seat("c", 1000)],
      [lobbyEntry("a", 900), lobbyEntry("c", 1000)],
    );
    expect(res.seats.map((s) => s.id)).toEqual(["a", "c"]);
    // Seat chips are the table truth (lobby may lag a settle).
    expect(res.seats[0].chips).toBe(700);
  });

  it("builds a fresh seat from the NEW lobby entry after a re-approval", () => {
    const res = plan(
      [seat("a", 0, { status: "out", joinedAt: 1 }), seat("b", 500)],
      [lobbyEntry("a", 400, { joinedAt: 99 }), lobbyEntry("b", 500)],
    );
    const a = res.seats.find((s) => s.id === "a")!;
    expect(a.chips).toBe(400);
    expect(a.joinedAt).toBe(99);
    expect(a.status).toBe("waiting");
  });

  it("keeps newcomers' preferred slot and honours sit-out", () => {
    const res = plan(
      [seat("a", 500)],
      [
        lobbyEntry("a", 500, { sittingOut: true }),
        lobbyEntry("n", 800, { preferredSlot: 6, joinedAt: 5 }),
      ],
    );
    expect(res.seats.find((s) => s.id === "a")!.status).toBe("sitting-out");
    const n = res.seats.find((s) => s.id === "n")!;
    expect(n.preferredSlot).toBe(6);
    expect(n.chips).toBe(800);
    expect(countDealable(res.seats)).toBe(1);
  });

  it("credits approved rebuys and counts the busted player as dealable again", () => {
    const res = plan(
      [seat("a", 0, { status: "out" }), seat("b", 2000)],
      [lobbyEntry("a", 0), lobbyEntry("b", 2000)],
      { pendingRebuys: { a: 1000, ghost: 50 } },
    );
    expect(res.appliedRebuys).toEqual({ a: 1000 });
    expect(res.seats.find((s) => s.id === "a")!.chips).toBe(1000);
    expect(countDealable(res.seats)).toBe(2);
  });

  it("gives a zero-chip entry the starting stack only in casual rooms", () => {
    const coins = plan(null, [lobbyEntry("a", 0), lobbyEntry("b", 100)]);
    expect(coins.seats[0].status).toBe("out");
    const casual = plan(null, [lobbyEntry("a", 0), lobbyEntry("b", 100)], { freeStack: true });
    expect(casual.seats[0].chips).toBe(DEFAULT_CONFIG.startingStack);
  });

  it("remaps the button when the dealer's seat was dropped", () => {
    // Dealer was b (idx 1) and b left: the button anchor becomes a (idx 0),
    // so the next hand's button lands on c.
    const res = plan(
      [seat("a", 500), seat("b", 500), seat("c", 500)],
      [lobbyEntry("a", 500), lobbyEntry("c", 500)],
      { prevDealerIdx: 1 },
    );
    expect(res.dealerIdx).toBe(0);
    const hand = startHand(res.seats, DEFAULT_CONFIG, 2, res.dealerIdx);
    expect(hand.seats[hand.betting.dealerIdx].id).toBe("c");
  });

  it("never seats more than 9 players", () => {
    const lobby = Array.from({ length: 11 }, (_, i) => lobbyEntry(`p${i}`, 100, { joinedAt: i }));
    const res = plan(null, lobby);
    expect(res.seats).toHaveLength(9);
    expect(res.overflow).toEqual(["p9", "p10"]);
  });
});

describe("settleSeats", () => {
  it("preserves sit-out, retires departed players and busts empty stacks", () => {
    const byId = indexLobby([
      lobbyEntry("a", 100, { sittingOut: true }),
      lobbyEntry("b", 100),
      lobbyEntry("c", 100),
    ]);
    const seats = settleSeats(
      [
        seat("a", 100, { status: "sitting-out" }),
        seat("b", 0, { status: "all-in", totalBet: 100 }),
        seat("c", 0, { status: "all-in", totalBet: 100 }),
        seat("gone", 300, { status: "out" }),
      ],
      { c: 200 },
      byId,
      true,
    );
    expect(seats.map((s) => s.status)).toEqual(["sitting-out", "out", "waiting", "out"]);
    expect(seats.map((s) => s.chips)).toEqual([100, 0, 200, 0]);
    expect(lobbyChipsUpdates(seats, byId)).toEqual({ b: 0, c: 200 });
  });
});

function liveState(): NormalGameState {
  const s = startHand(
    [seat("a", 1000), seat("b", 1000), seat("c", 1000)],
    DEFAULT_CONFIG,
    1,
    -1,
  );
  return s;
}

describe("detachSeats", () => {
  it("folds a departed actor and passes the turn on with a clock", () => {
    const s = liveState();
    const actor = s.betting.toActId!;
    const lobby = ["a", "b", "c"].filter((id) => id !== actor).map((id) => lobbyEntry(id, 1000));
    const { state, detached } = detachSeats(s, indexLobby(lobby), true);
    expect(detached).toEqual([actor]);
    const gone = state.seats.find((x) => x.id === actor)!;
    expect(gone.status).toBe("folded");
    expect(gone.chips).toBe(0);
    expect(state.betting.toActId).not.toBe(actor);
    expect(state.betting.toActId).not.toBeNull();
    const clocked = withTurnDeadline(state, 30_000, 1_000);
    expect(clocked.seats.find((x) => x.id === clocked.betting.toActId)!.turnDeadline).toBe(31_000);
  });

  it("forfeits an all-in departed player and drops its all-in vote", () => {
    const base = liveState();
    const s: NormalGameState = {
      ...base,
      phase: "all-in-negotiation",
      betting: { ...base.betting, toActId: null },
      seats: base.seats.map((x) => ({ ...x, status: "all-in" as const, chips: 0, totalBet: 1000 })),
      allInNegotiation: { playerIds: ["a", "b", "c"], votes: { a: 2, b: 1 } },
    };
    const lobby = [lobbyEntry("b", 1000), lobbyEntry("c", 1000)];
    const { state } = detachSeats(s, indexLobby(lobby), true);
    expect(state.seats.find((x) => x.id === "a")!.status).toBe("folded");
    expect(state.seats.find((x) => x.id === "a")!.totalBet).toBe(1000);
    expect(state.allInNegotiation?.playerIds).toEqual(["b", "c"]);
    expect(state.allInNegotiation?.votes).toEqual({ b: 1 });
  });

  it("is a no-op once the seat is retired", () => {
    const s = liveState();
    const byId = indexLobby([lobbyEntry("b", 1000), lobbyEntry("c", 1000)]);
    const once = detachSeats(s, byId, true).state;
    expect(detachSeats(once, byId, true).detached).toEqual([]);
  });
});

describe("voidHand", () => {
  it("refunds every committed chip and goes between hands", () => {
    const s = liveState();
    const before = s.seats.reduce((a, x) => a + x.chips + x.totalBet, 0);
    const v = voidHand(s);
    expect(v.phase).toBe("between-hands");
    expect(v.betting.pot).toBe(0);
    expect(v.betting.toActId).toBeNull();
    expect(v.seats.every((x) => x.totalBet === 0 && x.bet === 0)).toBe(true);
    expect(v.seats.reduce((a, x) => a + x.chips, 0)).toBe(before);
    expect(v.seats.every((x) => x.chips === 1000)).toBe(true);
  });
});
