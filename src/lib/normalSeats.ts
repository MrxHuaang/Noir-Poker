// Pure seat lifecycle for the host-authoritative normal mode: who is dealt into
// the next hand, what status every seat takes once a hand settles, what happens
// to a seat whose lobby entry disappears (cash-out / kick), and how a hand the
// host can no longer finish (host refresh: the deck is not public) is voided.
//
// The lobby subcollection is the membership authority: a seat whose lobby doc
// is gone must never be dealt in again, and a NEW lobby entry for the same uid
// (different joinedAt) always builds a fresh seat from the new entry's chips.
import type { NormalGameState, NormalSeat, RoomConfig, SeatStatus } from "./betting";
import { handleAction } from "./betting";
import type { NormalLobbyPlayer } from "./normalRooms";
import { isInHand } from "./showdownPayout";

export const MAX_TABLE_SEATS = 9;

export type LobbyById = Record<string, NormalLobbyPlayer>;

const BETTING_PHASES: ReadonlyArray<NormalGameState["phase"]> = [
  "preflop",
  "flop",
  "turn",
  "river",
];

export function isBettingPhase(phase: NormalGameState["phase"]): boolean {
  return BETTING_PHASES.includes(phase);
}

export function indexLobby(lobby: NormalLobbyPlayer[]): LobbyById {
  const out: LobbyById = {};
  for (const p of lobby) out[p.uid] = p;
  return out;
}

// True when the seat no longer belongs to a lobby entry: the entry was deleted
// (cash-out / kick) or replaced by a new approval for the same uid.
export function isDetached(seat: NormalSeat, lobbyById: LobbyById): boolean {
  const p = lobbyById[seat.id];
  if (!p) return true;
  return seat.joinedAt !== undefined && p.joinedAt !== seat.joinedAt;
}

// Fresh seat built from a lobby entry. `freeStack` (casual rooms) keeps the
// legacy fallback of giving the starting stack to a zero-chip entry; in coins
// rooms a zero-chip entry stays at zero (chips only come from a buy-in).
export function seatFromLobby(
  p: NormalLobbyPlayer,
  config: RoomConfig,
  freeStack: boolean,
): NormalSeat {
  const chips = p.chips > 0 ? p.chips : freeStack ? config.startingStack : 0;
  return {
    id: p.uid,
    name: p.name,
    seed: p.seed,
    ownerUid: p.uid,
    chips,
    bet: 0,
    totalBet: 0,
    revealed: false,
    status: chips <= 0 ? "out" : p.sittingOut ? "sitting-out" : "waiting",
    timeBank: config.timeBankInit,
    turnDeadline: null,
    joinedAt: p.joinedAt,
    ...(p.preferredSlot !== undefined ? { preferredSlot: p.preferredSlot } : {}),
  };
}

// Status a seat takes once its hand is settled (or when preparing the next one).
export function settledStatus(
  seat: NormalSeat,
  chips: number,
  lobbyById: LobbyById,
): SeatStatus {
  if (isDetached(seat, lobbyById)) return "out";
  if (chips <= 0) return "out";
  if (lobbyById[seat.id].sittingOut) return "sitting-out";
  return "waiting";
}

// Seats after a settle: payouts credited, per-hand fields reset, statuses
// derived from the lobby (sit-out preserved, departed players retired).
export function settleSeats(
  seats: NormalSeat[],
  payouts: Record<string, number>,
  lobbyById: LobbyById,
  reveal: boolean,
): NormalSeat[] {
  return seats.map((s) => {
    const detached = isDetached(s, lobbyById);
    // A departed player was already paid by the server at cash-out time.
    const chips = detached ? 0 : s.chips + (payouts[s.id] ?? 0);
    return {
      ...s,
      chips,
      bet: 0,
      totalBet: 0,
      turnDeadline: null,
      revealed: reveal && isInHand(s),
      status: settledStatus(s, chips, lobbyById),
    };
  });
}

// lobby/{uid}.chips values that differ from `valueOf(seat)` for every seat
// still backed by its lobby entry (the economy server pays lobby chips when no
// hand is live).
export function lobbyChipsUpdates(
  seats: NormalSeat[],
  lobbyById: LobbyById,
  valueOf: (seat: NormalSeat) => number = (seat) => seat.chips,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of seats) {
    if (isDetached(s, lobbyById)) continue;
    const value = Math.max(0, Math.floor(valueOf(s)));
    if (lobbyById[s.id].chips !== value) out[s.id] = value;
  }
  return out;
}

export type NextHandSeats = {
  seats: NormalSeat[];
  // prevDealerIdx remapped onto the new seat list (seats may have been dropped).
  dealerIdx: number;
  // Approved rebuys credited to a seat, by uid.
  appliedRebuys: Record<string, number>;
  // Lobby entries left without a seat because the table is full.
  overflow: string[];
};

export function nextHandSeats({
  prevSeats,
  prevDealerIdx,
  lobby,
  config,
  pendingRebuys,
  freeStack,
  maxSeats = MAX_TABLE_SEATS,
}: {
  prevSeats: NormalSeat[] | null;
  prevDealerIdx: number;
  lobby: NormalLobbyPlayer[];
  config: RoomConfig;
  pendingRebuys: Record<string, number>;
  freeStack: boolean;
  maxSeats?: number;
}): NextHandSeats {
  const lobbyById = indexLobby(lobby);
  const seats: NormalSeat[] = [];
  const keptPrevIdx: number[] = [];
  const seated = new Set<string>();
  const overflow: string[] = [];

  (prevSeats ?? []).forEach((s, idx) => {
    const p = lobbyById[s.id];
    if (!p) return; // left the table (cash-out / kick): drop the seat
    if (seats.length >= maxSeats) {
      overflow.push(s.id);
      seated.add(s.id);
      return;
    }
    if (s.joinedAt !== undefined && p.joinedAt !== s.joinedAt) {
      // Re-approved after leaving: fresh seat from the NEW entry, same position.
      seats.push(seatFromLobby(p, config, freeStack));
    } else {
      seats.push({
        ...s,
        name: p.name,
        seed: p.seed,
        ownerUid: p.uid,
        joinedAt: p.joinedAt,
        bet: 0,
        totalBet: 0,
        revealed: false,
        turnDeadline: null,
        ...(p.preferredSlot !== undefined ? { preferredSlot: p.preferredSlot } : {}),
      });
    }
    keptPrevIdx.push(idx);
    seated.add(s.id);
  });

  for (const p of lobby) {
    if (seated.has(p.uid)) continue;
    if (seats.length >= maxSeats) {
      overflow.push(p.uid);
      continue;
    }
    seats.push(seatFromLobby(p, config, freeStack));
    seated.add(p.uid);
  }

  const appliedRebuys: Record<string, number> = {};
  const withRebuys = seats.map((s) => {
    const rebuy = Math.floor(pendingRebuys[s.id] ?? 0);
    const chips = rebuy > 0 ? s.chips + rebuy : s.chips;
    if (rebuy > 0) appliedRebuys[s.id] = rebuy;
    return { ...s, chips, status: settledStatus(s, chips, lobbyById) };
  });

  // Remap the button: the previous dealer if still seated, otherwise the
  // closest seat before it, so the next hand's button moves on naturally.
  let dealerIdx = -1;
  if (prevSeats && prevDealerIdx >= 0) {
    for (let back = 0; back < prevSeats.length; back++) {
      const prevIdx = (prevDealerIdx - back + prevSeats.length) % prevSeats.length;
      const at = keptPrevIdx.indexOf(prevIdx);
      if (at >= 0) {
        dealerIdx = at;
        break;
      }
    }
  }

  return { seats: withRebuys, dealerIdx, appliedRebuys, overflow };
}

// Seats that would actually be dealt in.
export function countDealable(seats: NormalSeat[]): number {
  return seats.filter(
    (s) => s.status !== "out" && s.status !== "sitting-out" && s.chips > 0,
  ).length;
}

// Retires every seat whose lobby entry is gone. In a live hand the seat is
// folded (even when all-in: a departed player forfeits what is already in the
// pot) and its chips behind are zeroed (the server paid them at cash-out);
// between hands it simply goes "out" with 0 chips.
export function detachSeats(
  state: NormalGameState,
  lobbyById: LobbyById,
  live: boolean,
): { state: NormalGameState; detached: string[] } {
  const ids = new Set(
    state.seats
      .filter(
        (s) =>
          isDetached(s, lobbyById) &&
          !(s.chips === 0 && (s.status === "out" || s.status === "folded")),
      )
      .map((s) => s.id),
  );
  if (ids.size === 0) return { state, detached: [] };

  let next = state;
  const toAct = next.betting.toActId;
  if (live && toAct && ids.has(toAct) && isBettingPhase(next.phase)) {
    // Folding the actor through the betting engine passes the turn on.
    next = handleAction(next, toAct, "fold");
  }
  next = {
    ...next,
    seats: next.seats.map((s) => {
      if (!ids.has(s.id)) return s;
      const inHandNow = s.status === "active" || s.status === "all-in" || s.status === "folded";
      return {
        ...s,
        chips: 0,
        turnDeadline: null,
        status: live && inHandNow ? ("folded" as const) : ("out" as const),
      };
    }),
  };
  if (live && next.allInNegotiation) {
    const votes: Record<string, number> = {};
    for (const [id, vote] of Object.entries(next.allInNegotiation.votes)) {
      if (!ids.has(id)) votes[id] = vote;
    }
    next = {
      ...next,
      allInNegotiation: {
        ...next.allInNegotiation,
        playerIds: next.allInNegotiation.playerIds.filter((id) => !ids.has(id)),
        votes,
      },
    };
  }
  return { state: next, detached: [...ids] };
}

// A hand the host cannot finish (after a host refresh the deck is gone: only
// deckCount is public). Every seat gets its committed chips back and the table
// goes between hands. Chips are conserved exactly.
export function voidHand(state: NormalGameState): NormalGameState {
  return {
    ...state,
    seats: state.seats.map((s) => {
      const chips = s.chips + s.totalBet;
      return {
        ...s,
        chips,
        bet: 0,
        totalBet: 0,
        revealed: false,
        turnDeadline: null,
        status: chips <= 0 ? ("out" as const) : s.status === "sitting-out" ? ("sitting-out" as const) : ("waiting" as const),
      };
    }),
    community: [],
    deck: [],
    burns: [],
    street: "preflop",
    phase: "between-hands",
    allInNegotiation: undefined,
    lastAction: undefined,
    betting: {
      ...state.betting,
      pot: 0,
      sidePots: [],
      currentBet: 0,
      toActId: null,
      lastAggressorId: null,
      actedThisRound: [],
    },
  };
}

// Sets the turn deadline on the current actor if it has none yet. Only betting
// phases have a clock.
export function withTurnDeadline(
  state: NormalGameState,
  turnTime: number,
  now = Date.now(),
): NormalGameState {
  const toAct = state.betting.toActId;
  if (!toAct || !isBettingPhase(state.phase)) return state;
  const seat = state.seats.find((s) => s.id === toAct);
  if (!seat || seat.status !== "active" || seat.turnDeadline) return state;
  return {
    ...state,
    seats: state.seats.map((s) => (s.id === toAct ? { ...s, turnDeadline: now + turnTime } : s)),
  };
}
