import type { Card } from "./poker";
import { shuffle, makeDeck } from "./poker";

export type SeatStatus =
  | "waiting"
  | "active"
  | "folded"
  | "all-in"
  | "out"
  | "sitting-out";

export type BettingAction =
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "all-in"
  | "show-card"
  | "vote-run";

export type SidePot = {
  amount: number;
  eligibleIds: string[];
};

export type NormalSeat = {
  id: string;
  name: string;
  seed: string;
  ownerUid: string | null;
  chips: number;
  bet: number;
  totalBet: number;
  revealed: boolean;
  status: SeatStatus;
  timeBank: number;
  turnDeadline: number | null;
  // Physical slot preference (0-8 around the ellipse, independent of view rotation).
  preferredSlot?: number;
};

export type BettingRound = {
  pot: number;
  sidePots: SidePot[];
  currentBet: number;
  minRaise: number;
  bigBlind: number;
  toActId: string | null;
  lastAggressorId: string | null;
  dealerIdx: number;
  sbIdx: number;
  bbIdx: number;
  handNum: number;
  actedThisRound: string[];
};

export type NormalGameState = {
  seats: NormalSeat[];
  community: Card[];
  deck: Card[];
  burns: Card[];
  street: "preflop" | "flop" | "turn" | "river";
  dealId: string;
  betting: BettingRound;
  phase:
    | "lobby"
    | "preflop"
    | "flop"
    | "turn"
    | "river"
    | "showdown"
    | "between-hands"
    | "all-in-negotiation";
  allInNegotiation?: {
    playerIds: string[];
    votes: Record<string, number>; // uid -> number of runs requested
    agreedN?: number;
    options?: number[];
    createdAt?: number;
  };
  lastAction?: {
    seatId: string;
    action: string;
    amount?: number;
    ts: number;
  };
};

export type PotResult = {
  pot: SidePot;
  winnerIds: string[];
  amount: number;
};

export type HandResult = {
  potResults: PotResult[];
  winnerIds: string[];
};

export type RoomConfig = {
  mode: "normal" | "torneo";
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  turnTime: number;
  timeBankInit: number;
  blindLevels?: BlindLevel[];
  blindLevelDuration?: number;
};

export type BlindLevel = {
  sb: number;
  bb: number;
  ante: number;
};

export const DEFAULT_CONFIG: RoomConfig = {
  mode: "normal",
  startingStack: 1000,
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
  turnTime: 30000,
  timeBankInit: 60000,
};

export const TOURNAMENT_LEVELS: BlindLevel[] = [
  { sb: 10, bb: 20, ante: 0 },
  { sb: 15, bb: 30, ante: 0 },
  { sb: 25, bb: 50, ante: 5 },
  { sb: 50, bb: 100, ante: 10 },
  { sb: 75, bb: 150, ante: 15 },
  { sb: 100, bb: 200, ante: 25 },
  { sb: 150, bb: 300, ante: 30 },
  { sb: 200, bb: 400, ante: 50 },
  { sb: 300, bb: 600, ante: 75 },
  { sb: 500, bb: 1000, ante: 100 },
];

function nextActive(
  seats: NormalSeat[],
  fromIdx: number,
  wrap = true,
): number {
  const n = seats.length;
  for (let i = 1; i <= n; i++) {
    const idx = (fromIdx + i) % n;
    const s = seats[idx];
    if (s.status === "active") return idx;
    if (!wrap && fromIdx + i >= n) break;
  }
  return -1;
}

function idxOf(seats: NormalSeat[], id: string): number {
  return seats.findIndex((s) => s.id === id);
}


function activePlayers(seats: NormalSeat[]): NormalSeat[] {
  return seats.filter(
    (s) => s.status === "active" || s.status === "all-in",
  );
}

function actionablePlayers(seats: NormalSeat[]): NormalSeat[] {
  return seats.filter((s) => s.status === "active");
}

// Blind + ante posting — returns new state ready for preflop betting
export function startHand(
  seats: NormalSeat[],
  config: RoomConfig,
  handNum: number,
  prevDealerIdx: number,
): NormalGameState {
  const eligible = seats.filter(
    (s) => s.status !== "out" && s.status !== "sitting-out",
  );
  if (eligible.length < 2)
    throw new Error("Not enough players");

  const deck = shuffle(makeDeck());

  const n = seats.length;
  const newSeats: NormalSeat[] = seats.map((s) => ({
    ...s,
    bet: 0,
    totalBet: 0,
    revealed: false,
    turnDeadline: null,
    status:
      s.chips <= 0 ? "out" : (s.status === "out" || s.status === "sitting-out" ? s.status : "active"),
  }));

  // Find dealer: next eligible after prev dealer
  let dealerIdx = prevDealerIdx;
  for (let i = 1; i <= n; i++) {
    const idx = (prevDealerIdx + i) % n;
    if (
      newSeats[idx].status !== "out" &&
      newSeats[idx].status !== "sitting-out"
    ) {
      dealerIdx = idx;
      break;
    }
  }

  const activeSeatIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    const idx = (dealerIdx + 1 + i) % n;
    if (
      newSeats[idx].status !== "out" &&
      newSeats[idx].status !== "sitting-out"
    ) {
      activeSeatIndices.push(idx);
    }
  }

  const isHeadsUp = activeSeatIndices.length === 2;

  let sbIdx: number;
  let bbIdx: number;
  let utg: number;

  if (isHeadsUp) {
    // Heads-up: DEALER = SB. dealerIdx is the dealer seat.
    // activeSeatIndices[0] = seat just after dealer = BB (non-dealer).
    // activeSeatIndices[1] = dealer = SB.
    // Preflop HU: SB/dealer acts FIRST.
    sbIdx = dealerIdx; // dealer posts SB
    bbIdx = activeSeatIndices[0]; // non-dealer posts BB
    utg = dealerIdx; // dealer/SB acts first preflop HU
  } else {
    sbIdx = activeSeatIndices[0];
    bbIdx = activeSeatIndices[1];
    utg = activeSeatIndices[2] ?? activeSeatIndices[0];
  }

  const sb = config.smallBlind;
  const bb = config.bigBlind;
  const ante = config.ante;

  let pot = 0;

  // Post antes
  if (ante > 0) {
    for (const idx of activeSeatIndices) {
      const s = newSeats[idx];
      const anteAmt = Math.min(ante, s.chips);
      s.chips -= anteAmt;
      s.totalBet += anteAmt;
      pot += anteAmt;
      if (s.chips === 0) s.status = "all-in";
    }
  }

  // Post SB
  const sbSeat = newSeats[sbIdx];
  const sbAmt = Math.min(sb, sbSeat.chips);
  sbSeat.chips -= sbAmt;
  sbSeat.bet = sbAmt;
  sbSeat.totalBet += sbAmt;
  pot += sbAmt;
  if (sbSeat.chips === 0) sbSeat.status = "all-in";

  // Post BB
  const bbSeat = newSeats[bbIdx];
  const bbAmt = Math.min(bb, bbSeat.chips);
  bbSeat.chips -= bbAmt;
  bbSeat.bet = bbAmt;
  bbSeat.totalBet += bbAmt;
  pot += bbAmt;
  if (bbSeat.chips === 0) bbSeat.status = "all-in";

  // Deal hole cards (2 per active player)
  const dealtSeats = newSeats.map((s) => {
    if (s.status === "out" || s.status === "sitting-out") return s;
    return { ...s };
  });
  // Note: actual hole Card objects dealt by caller (admin) via writeDealedRoom

  const toActId = newSeats[utg].status === "active" ? newSeats[utg].id : null;

  // Find first active after UTG if UTG is all-in
  let resolvedToActId = toActId;
  if (!resolvedToActId) {
    const nextIdx = nextActive(newSeats, utg - 1);
    resolvedToActId = nextIdx >= 0 ? newSeats[nextIdx].id : null;
  }

  // Set turnDeadline on the first player to act
  const now = Date.now();
  const seatsWithDeadline = dealtSeats.map((s) =>
    s.id === resolvedToActId
      ? { ...s, turnDeadline: now + config.turnTime }
      : s,
  );

  return {
    seats: seatsWithDeadline,
    community: [],
    deck,
    burns: [],
    street: "preflop",
    dealId: crypto.randomUUID(),
    phase: "preflop",
    betting: {
      pot,
      sidePots: [],
      currentBet: bbAmt,
      minRaise: bb,
      bigBlind: bb,
      toActId: resolvedToActId,
      lastAggressorId: newSeats[bbIdx].id,
      dealerIdx,
      sbIdx,
      bbIdx,
      handNum,
      actedThisRound: [],
    },
  };
}

export function handleAction(
  state: NormalGameState,
  seatId: string,
  action: BettingAction,
  amount = 0,
): NormalGameState {
  if (state.betting.toActId !== seatId) return state;

  const seats = state.seats.map((s) => ({ ...s }));
  const bet = { ...state.betting };
  const sIdx = idxOf(seats, seatId);
  if (sIdx < 0) return state;
  const seat = seats[sIdx];

  switch (action) {
    case "fold":
      seat.status = "folded";
      break;

    case "check":
      if (seat.bet < bet.currentBet) return state; // can't check, must call
      break;

    case "call": {
      const toCall = Math.min(bet.currentBet - seat.bet, seat.chips);
      seat.chips -= toCall;
      seat.bet += toCall;
      seat.totalBet += toCall;
      bet.pot += toCall;
      if (seat.chips === 0) seat.status = "all-in";
      break;
    }

    case "bet": {
      const betAmt = Math.min(amount, seat.chips);
      if (betAmt <= 0) return state;
      seat.chips -= betAmt;
      seat.bet += betAmt;
      seat.totalBet += betAmt;
      bet.pot += betAmt;
      bet.currentBet = seat.bet;
      bet.minRaise = betAmt;
      bet.lastAggressorId = seatId;
      bet.actedThisRound = [seatId];
      if (seat.chips === 0) seat.status = "all-in";
      break;
    }

    case "raise": {
      const maxTotal = seat.chips + seat.bet;
      const raiseTotal = Math.min(amount, maxTotal);
      const raiseIncrease = raiseTotal - seat.bet;
      if (raiseIncrease <= 0) return state;
      const isAllIn = raiseTotal === maxTotal;
      const minRaiseTotal = bet.currentBet + bet.minRaise;
      // A legal raise must reach at least minRaiseTotal. A short all-in (the
      // player commits every chip) is allowed below that; anything else is an
      // illegal under-raise and is rejected.
      if (!isAllIn && raiseTotal < minRaiseTotal) return state;
      seat.chips -= raiseIncrease;
      seat.bet = raiseTotal;
      seat.totalBet += raiseIncrease;
      bet.pot += raiseIncrease;
      // Only re-open the action if the total actually exceeds the current bet.
      // A short all-in for less than currentBet must not lower it.
      if (raiseTotal > bet.currentBet) {
        bet.minRaise = raiseTotal - bet.currentBet;
        bet.currentBet = raiseTotal;
        bet.lastAggressorId = seatId;
        bet.actedThisRound = [seatId];
      }
      if (seat.chips === 0) seat.status = "all-in";
      break;
    }

    case "all-in": {
      const allInAmt = seat.chips;
      if (allInAmt <= 0) return state;
      const newBet = seat.bet + allInAmt;
      seat.chips = 0;
      seat.bet = newBet;
      seat.totalBet += allInAmt;
      bet.pot += allInAmt;
      seat.status = "all-in";
      if (newBet > bet.currentBet) {
        bet.minRaise = newBet - bet.currentBet;
        bet.currentBet = newBet;
        bet.lastAggressorId = seatId;
        bet.actedThisRound = [seatId];
      }
      break;
    }
  }

  if (!bet.actedThisRound.includes(seatId)) {
    bet.actedThisRound = [...bet.actedThisRound, seatId];
  }

  if (seat.turnDeadline && Date.now() > seat.turnDeadline) {
    const overflow = Date.now() - seat.turnDeadline;
    seat.timeBank = Math.max(0, seat.timeBank - overflow);
  }
  seat.turnDeadline = null;

  const nextState: NormalGameState = { ...state, seats, betting: bet, lastAction: { seatId, action, amount, ts: Date.now() } };
  return advanceAction(nextState);
}

function advanceAction(state: NormalGameState): NormalGameState {
  const { seats, betting } = state;
  const active = actionablePlayers(seats);
  const allIn = seats.filter((s) => s.status === "all-in");

  // Check round completion: all active players have acted and matched bet
  const roundDone = isRoundComplete(seats, betting);

  // If the round is complete and 1 or fewer players can still act, betting is permanently closed
  if (roundDone && active.length <= 1) {
    if (activePlayers(seats).length <= 1) {
      return { ...state, phase: "showdown" };
    }
    // All players all-in or only one active with chips: close action for all-in runout
    return {
      ...state,
      betting: { ...betting, toActId: null, actedThisRound: active.map((x) => x.id) },
    };
  }

  if (roundDone) {
    return advanceStreet(state);
  }

  // Find next active player to act
  const currentIdx = idxOf(seats, betting.toActId ?? seats[0].id);
  const nextIdx = nextActive(seats, currentIdx);
  if (nextIdx < 0) return advanceStreet(state);

  void allIn;
  return {
    ...state,
    seats,
    betting: { ...betting, toActId: seats[nextIdx].id },
  };
}

function isRoundComplete(
  seats: NormalSeat[],
  betting: BettingRound,
): boolean {
  const active = actionablePlayers(seats);
  if (active.length === 0) return true;

  // Everyone has matched the current bet (or is all-in)
  const allMatched = active.every(
    (s) => s.bet >= betting.currentBet,
  );

  // Everyone has had a chance to act (acted this round includes all active who can act)
  const allActed = active.every(
    (s) => betting.actedThisRound.includes(s.id),
  );

  return allMatched && allActed;
}

function advanceStreet(state: NormalGameState): NormalGameState {
  const { street, seats, deck, burns, community, betting } = state;

  // Reset bets for new street
  const newSeats = seats.map((s) => ({
    ...s,
    bet: 0,
  }));

  const newDeck = deck.slice();
  const newBurns = burns.slice();
  const newCommunity = community.slice();

  let newStreet = street;
  let newPhase = state.phase;

  if (street === "preflop") {
    newBurns.push(newDeck.shift()!);
    newCommunity.push(newDeck.shift()!, newDeck.shift()!, newDeck.shift()!);
    newStreet = "flop";
    newPhase = "flop";
  } else if (street === "flop") {
    newBurns.push(newDeck.shift()!);
    newCommunity.push(newDeck.shift()!);
    newStreet = "turn";
    newPhase = "turn";
  } else if (street === "turn") {
    newBurns.push(newDeck.shift()!);
    newCommunity.push(newDeck.shift()!);
    newStreet = "river";
    newPhase = "river";
  } else {
    // River done → showdown
    return { ...state, seats: newSeats, phase: "showdown" };
  }

  const activeSeatIndices = newSeats
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.status === "active" || s.status === "all-in");

  // First to act post-flop: first active seat left of dealer
  let firstActIdx = -1;
  for (let i = 1; i <= newSeats.length; i++) {
    const idx = (betting.dealerIdx + i) % newSeats.length;
    if (newSeats[idx].status === "active") {
      firstActIdx = idx;
      break;
    }
  }

  void activeSeatIndices;

  const toActId =
    firstActIdx >= 0 ? newSeats[firstActIdx].id : null;

  const newBetting: BettingRound = {
    ...betting,
    currentBet: 0,
    minRaise: betting.bigBlind || betting.minRaise,
    toActId,
    actedThisRound: [],
    sidePots: computeSidePots(newSeats, betting.pot),
  };

  return {
    ...state,
    seats: newSeats,
    community: newCommunity,
    deck: newDeck,
    burns: newBurns,
    street: newStreet,
    phase: newPhase,
    betting: newBetting,
  };
}



export function computeSidePots(
  seats: NormalSeat[],
  totalPot: number,
): SidePot[] {
  const contributors = seats.filter((s) => s.totalBet > 0);
  if (contributors.length === 0) return [{ amount: totalPot, eligibleIds: seats.filter(s => s.status !== "folded").map(s => s.id) }];

  const sortedAmounts = [
    ...new Set(contributors.map((s) => s.totalBet)),
  ].sort((a, b) => a - b);

  const pots: SidePot[] = [];
  let prev = 0;

  for (const cap of sortedAmounts) {
    const tier = cap - prev;
    let potAmt = 0;

    for (const s of seats) {
      const contribution = Math.min(Math.max(0, s.totalBet - prev), tier);
      potAmt += contribution;
    }

    const eligible = seats
      .filter(
        (s) =>
          s.totalBet >= cap &&
          s.status !== "folded",
      )
      .map((s) => s.id);

    if (potAmt > 0) {
      pots.push({ amount: potAmt, eligibleIds: eligible });
    }
    prev = cap;
  }

  return pots;
}

export function getValidActions(
  seat: NormalSeat,
  betting: BettingRound,
): { action: BettingAction; min?: number; max?: number }[] {
  if (seat.chips === 0) return [];
  const toCall = betting.currentBet - seat.bet;
  const actions: { action: BettingAction; min?: number; max?: number }[] = [];

  // Fold always available when there's a bet to face
  if (toCall > 0) {
    actions.push({ action: "fold" });
  }

  // Check
  if (toCall === 0) {
    actions.push({ action: "check" });
  }

  // Call
  if (toCall > 0 && seat.chips > toCall) {
    actions.push({ action: "call", min: toCall, max: toCall });
  }

  // All-in
  actions.push({ action: "all-in", min: seat.chips, max: seat.chips });

  // Bet (no current bet)
  if (betting.currentBet === 0) {
    const minBet = betting.minRaise;
    if (seat.chips > minBet) {
      actions.push({ action: "bet", min: minBet, max: seat.chips });
    }
  }

  // Raise
  if (betting.currentBet > 0 && seat.chips > toCall) {
    const minRaiseTotal = betting.currentBet + betting.minRaise;
    if (seat.chips + seat.bet > minRaiseTotal) {
      actions.push({
        action: "raise",
        min: minRaiseTotal,
        max: seat.chips + seat.bet,
      });
    }
  }

  return actions;
}

export function formatChips(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

// Split a pot across N board run-outs with zero chip leakage.
// Per-run pots sum to exactly totalPot (the last run absorbs the remainder),
// and within each run the leftover from an uneven split goes to the first
// winner — mirroring the single-showdown distribution in resolveShowdown.
export function distributeRunPot(
  totalPot: number,
  runs: { winners: string[] }[],
): { winningsByPlayer: Record<string, number>; perRunPot: number[] } {
  const winningsByPlayer: Record<string, number> = {};
  const perRunPot: number[] = [];
  const n = runs.length;
  if (n === 0) return { winningsByPlayer, perRunPot };

  const runShare = Math.floor(totalPot / n);
  for (let r = 0; r < n; r++) {
    const runPot = r === n - 1 ? totalPot - runShare * (n - 1) : runShare;
    perRunPot.push(runPot);
    const winners = runs[r].winners;
    if (winners.length === 0) continue;
    const share = Math.floor(runPot / winners.length);
    const remainder = runPot - share * winners.length;
    winners.forEach((w, i) => {
      winningsByPlayer[w] =
        (winningsByPlayer[w] ?? 0) + share + (i === 0 ? remainder : 0);
    });
  }
  return { winningsByPlayer, perRunPot };
}
