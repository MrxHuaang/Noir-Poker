// Authoritative engine of the online mode. Pure and serializable: the whole
// table (deck and hole cards included) is a plain JSON object that the API
// route loads from Firestore, mutates inside a transaction, and writes back.
// Nothing here touches the network, so it runs identically in tests.
//
// Ported from the former Go game server (server/internal/game): betting rules
// (min-raise, short all-in), street advance, fold-to-one, all-in run-out,
// run-it-N, side pots and showdown. Differences from the Go version are bug
// fixes: a "bet" facing a bet is treated as a raise instead of lowering the
// current bet, a side pot whose contributors all folded goes to the players
// still in instead of vanishing, the button rotates by seat order even when
// players leave, and a blind that is all-in from posting no longer freezes the
// turn.
//
// Economy is not decided here either: the engine only reports stacks leaving
// the table (`payouts`); the server layer settles them against the wallet.
import { bestHand, compareScore, type Score } from "../handEval";
import { cardFromId, makeDeck, shuffle, type Card } from "../poker";
import {
  MAX_SEATED,
  TURN_MS,
  type GameWinner,
  type LastAction,
  type OnlineConfigInput,
  type OnlineHandDoc,
  type PublicSeat,
  type PublicState,
  type RunResult,
} from "./protocol";

export class OnlineError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type Phase = "idle" | "preflop" | "flop" | "turn" | "river" | "showdown";
export type BetStatus = "active" | "folded" | "all-in" | "out";

export type BetSeat = {
  id: string;
  chips: number; // behind (not yet committed)
  bet: number; // committed this street
  totalBet: number; // committed this hand
  status: BetStatus;
};

export type Betting = {
  seats: BetSeat[]; // seating order
  pot: number;
  currentBet: number;
  minRaise: number;
  bigBlind: number;
  toAct: string; // "" when the round is closed
  acted: string[];
};

export type TablePlayer = {
  id: string;
  name: string;
  seed: string;
  joinSeq: number; // arrival order = seat order
  buyIn: number; // total bought in this session (coins or free)
  coins: boolean; // true when the buy-in was escrowed from the wallet
};

// A stack leaving the table. The server layer credits `amount` to the wallet
// (coin players) and closes their escrow.
export type Payout = {
  uid: string;
  amount: number;
  buyIn: number;
  coins: boolean;
};

export type EngineState = {
  v: 1;
  code: string;
  creator: string;
  createdAt: number;
  players: Record<string, TablePlayer>;
  nextSeq: number;
  seatIds: string[];
  waiting: string[];
  chips: Record<string, number>;
  names: Record<string, string>;
  seeds: Record<string, string>;
  dealerId: string;
  dealerSeq: number;
  handNum: number;
  sb: number;
  bb: number;
  baseSb: number;
  baseBb: number;
  startStack: number;
  runItN: number;
  blindLevelSecs: number;
  blindsSince: number;
  casual: boolean;
  paused: boolean;
  phase: Phase;
  betting: Betting | null;
  deck: string[];
  board: string[];
  holes: Record<string, string[]>;
  winners: GameWinner[];
  reveals: Record<string, string[]>;
  runs: RunResult[];
  handCategories: Record<string, number>;
  lastAction: LastAction | null;
  deadline: number;
  bustedOrder: string[];
  // Players who stood up while all-in: their stack settles at showdown.
  leaving: Record<string, { buyIn: number; coins: boolean }>;
  payouts: Payout[]; // consumed (and cleared) by the server layer
};

export const DEFAULT_SB = 5;
export const DEFAULT_BB = 10;
export const DEFAULT_STACK = 1000;
const MAX_STACK = 1_000_000;
const MAX_BLIND = 100_000;
const BLIND_CAP_SB = 800; // escalation stops doubling past 800/1600

function int(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Room lifecycle
// ---------------------------------------------------------------------------

export function createRoom(
  code: string,
  creator: string,
  cfg: OnlineConfigInput,
  now: number,
): EngineState {
  const st: EngineState = {
    v: 1,
    code,
    creator,
    createdAt: now,
    players: {},
    nextSeq: 1,
    seatIds: [],
    waiting: [],
    chips: {},
    names: {},
    seeds: {},
    dealerId: "",
    dealerSeq: 0,
    handNum: 0,
    sb: DEFAULT_SB,
    bb: DEFAULT_BB,
    baseSb: DEFAULT_SB,
    baseBb: DEFAULT_BB,
    startStack: DEFAULT_STACK,
    runItN: 1,
    blindLevelSecs: 0,
    blindsSince: now,
    casual: !!cfg.casual,
    paused: false,
    phase: "idle",
    betting: null,
    deck: [],
    board: [],
    holes: {},
    winners: [],
    reveals: {},
    runs: [],
    handCategories: {},
    lastAction: null,
    deadline: 0,
    bustedOrder: [],
    leaving: {},
    payouts: [],
  };
  applyConfig(st, cfg, now);
  return st;
}

// Validates and applies table config. Blinds and stack are clamped to sane
// ranges; the economy mode (casual) is fixed at creation and never changes.
function applyConfig(st: EngineState, cfg: OnlineConfigInput, now: number): void {
  let sb = cfg.sb !== undefined ? int(cfg.sb) : st.baseSb;
  let bb = cfg.bb !== undefined ? int(cfg.bb) : st.baseBb;
  if (sb < 1) sb = st.baseSb;
  if (bb < 1) bb = st.baseBb;
  sb = Math.min(sb, MAX_BLIND);
  bb = Math.min(Math.max(bb, sb), MAX_BLIND);
  if (sb !== st.baseSb || bb !== st.baseBb) {
    st.baseSb = sb;
    st.baseBb = bb;
    st.sb = sb;
    st.bb = bb;
    st.blindsSince = now;
  }
  if (cfg.stack !== undefined && int(cfg.stack) > 0) {
    st.startStack = Math.min(MAX_STACK, Math.max(int(cfg.stack), st.bb * 2));
  } else if (st.startStack < st.bb * 2) {
    st.startStack = st.bb * 2;
  }
  if (cfg.runItN !== undefined) {
    const n = int(cfg.runItN);
    if (n >= 1 && n <= 3) st.runItN = n;
  }
  if (cfg.blindLevelSecs !== undefined) {
    const s = int(cfg.blindLevelSecs);
    const secs = s <= 0 ? 0 : Math.min(3600, Math.max(60, s));
    if (secs !== st.blindLevelSecs) {
      st.blindLevelSecs = secs;
      st.blindsSince = now;
      st.baseSb = st.sb;
      st.baseBb = st.bb;
    }
  }
}

export function configure(
  st: EngineState,
  uid: string,
  cfg: OnlineConfigInput,
  now: number,
): void {
  if (ownerOf(st) !== uid) throw new OnlineError("Solo el anfitrion configura la mesa", 403);
  // casual is part of the room's economy contract: never flipped afterwards.
  applyConfig(st, { ...cfg, casual: undefined }, now);
}

// Owner = the creator while present, otherwise the earliest arrival.
export function ownerOf(st: EngineState): string {
  if (st.players[st.creator]) return st.creator;
  let best: TablePlayer | null = null;
  for (const p of Object.values(st.players)) {
    if (!best || p.joinSeq < best.joinSeq) best = p;
  }
  return best?.id ?? "";
}

export function betweenHands(st: EngineState): boolean {
  return st.phase === "idle" || st.phase === "showdown";
}

function orderedPlayers(st: EngineState): TablePlayer[] {
  return Object.values(st.players).sort((a, b) => a.joinSeq - b.joinSeq);
}

// Seats the first MAX_SEATED players in arrival order; the rest wait. Only
// called between hands so nobody is dealt in (or out) mid-hand.
function syncSeats(st: EngineState): void {
  st.seatIds = [];
  st.waiting = [];
  for (const p of orderedPlayers(st)) {
    if (st.seatIds.length < MAX_SEATED) st.seatIds.push(p.id);
    else st.waiting.push(p.id);
  }
}

export function inLiveHand(st: EngineState, uid: string): boolean {
  if (betweenHands(st) || !st.betting) return false;
  const s = st.betting.seats.find((x) => x.id === uid);
  return !!s && (s.status === "active" || s.status === "all-in");
}

// ---------------------------------------------------------------------------
// Seating
// ---------------------------------------------------------------------------

export type SitResult = "seated" | "queued" | "joining" | "already";

export function sit(
  st: EngineState,
  uid: string,
  name: string,
  seed: string,
  coins: boolean,
): SitResult {
  if (st.players[uid]) return "already";
  if (st.betting && !betweenHands(st) && st.betting.seats.some((s) => s.id === uid)) {
    // Left mid-hand and came straight back: the old seat is still settling.
    throw new OnlineError("Espera a que termine la mano para volver a sentarte");
  }
  st.players[uid] = {
    id: uid,
    name: name.slice(0, 40) || "Jugador",
    seed: seed.slice(0, 80) || uid,
    joinSeq: st.nextSeq++,
    buyIn: st.startStack,
    coins,
  };
  st.names[uid] = st.players[uid].name;
  st.seeds[uid] = st.players[uid].seed;
  st.chips[uid] = st.startStack;
  st.bustedOrder = st.bustedOrder.filter((id) => id !== uid);
  if (betweenHands(st)) {
    syncSeats(st);
    return st.waiting.includes(uid) ? "queued" : "seated";
  }
  return "joining";
}

// Stands a player up. Their stack is final (and paid out right away) unless
// they are all-in in the live hand, in which case it settles at showdown.
export function leave(st: EngineState, uid: string, now: number): void {
  const p = st.players[uid];
  if (!p) return;
  delete st.players[uid];
  st.waiting = st.waiting.filter((id) => id !== uid);

  const b = st.betting;
  const seat = b && !betweenHands(st) ? b.seats.find((s) => s.id === uid) : undefined;
  if (b && seat && seat.status === "all-in") {
    // Still contesting the pot: the stack settles when the hand ends.
    st.leaving[uid] = { buyIn: p.buyIn, coins: p.coins };
    return;
  }
  // Mid-hand the live stack is the seat's chips behind (the persistent stack
  // still includes what was committed to the pot); between hands it is the
  // persistent stack.
  const behind = seat ? seat.chips : (st.chips[uid] ?? 0);
  delete st.chips[uid];
  st.payouts.push({ uid, amount: behind, buyIn: p.buyIn, coins: p.coins });
  if (b && seat && seat.status === "active") {
    seat.status = "folded";
    if (!b.acted.includes(uid)) b.acted.push(uid);
    st.lastAction = { seatId: uid, action: "fold", ts: now };
    if (b.toAct === uid) advanceTurn(b);
    maybeAdvance(st);
    armDeadline(st, now);
  }
  if (betweenHands(st)) syncSeats(st);
}

export function rebuy(st: EngineState, uid: string): number {
  const p = st.players[uid];
  if (!p) throw new OnlineError("No estas sentado");
  if (!betweenHands(st)) throw new OnlineError("Espera a que termine la mano");
  if ((st.chips[uid] ?? 0) > 0) throw new OnlineError("Todavia tienes fichas");
  st.chips[uid] = st.startStack;
  p.buyIn += st.startStack;
  st.bustedOrder = st.bustedOrder.filter((id) => id !== uid);
  return st.startStack;
}

export function setPaused(st: EngineState, uid: string, paused: boolean, now: number): void {
  if (ownerOf(st) !== uid) throw new OnlineError("Solo el anfitrion pausa la partida", 403);
  st.paused = paused;
  if (paused) st.deadline = 0;
  else armDeadline(st, now);
}

// ---------------------------------------------------------------------------
// Hand flow
// ---------------------------------------------------------------------------

function currentBlinds(st: EngineState, now: number): { sb: number; bb: number } {
  if (st.blindLevelSecs <= 0) return { sb: st.baseSb, bb: st.baseBb };
  const levels = Math.floor((now - st.blindsSince) / (st.blindLevelSecs * 1000));
  let sb = st.baseSb;
  let bb = st.baseBb;
  for (let i = 0; i < levels && sb * 2 <= BLIND_CAP_SB; i++) {
    sb *= 2;
    bb *= 2;
  }
  return { sb, bb };
}

export function startHand(
  st: EngineState,
  uid: string,
  now: number,
  deck: string[] = shuffle(makeDeck()).map((c) => c.id),
): void {
  if (!betweenHands(st)) throw new OnlineError("Ya hay una mano en curso");
  if (st.paused) throw new OnlineError("La partida esta en pausa");
  if (ownerOf(st) !== uid) throw new OnlineError("Solo el anfitrion reparte", 403);

  syncSeats(st);
  const funded = st.seatIds.filter((id) => (st.chips[id] ?? 0) > 0);
  if (funded.length < 2) throw new OnlineError("Se necesitan al menos 2 jugadores con fichas");

  const blinds = currentBlinds(st, now);
  st.sb = blinds.sb;
  st.bb = blinds.bb;

  // Button: next funded player after the previous dealer, by arrival order.
  const seqOf = (id: string) => st.players[id]?.joinSeq ?? 0;
  let dealerIdx = funded.findIndex((id) => seqOf(id) > st.dealerSeq);
  if (dealerIdx < 0) dealerIdx = 0;
  st.dealerId = funded[dealerIdx];
  st.dealerSeq = seqOf(st.dealerId);

  st.handNum++;
  st.board = [];
  st.winners = [];
  st.reveals = {};
  st.runs = [];
  st.handCategories = {};
  st.lastAction = null;
  st.holes = {};
  st.leaving = {};
  st.phase = "preflop";

  const seats: BetSeat[] = funded.map((id) => ({
    id,
    chips: st.chips[id],
    bet: 0,
    totalBet: 0,
    status: "active",
  }));
  let d = 0;
  for (const id of funded) {
    st.holes[id] = [deck[d], deck[d + 1]];
    d += 2;
  }
  st.deck = deck.slice(d);

  const n = funded.length;
  let sbPos: number;
  let bbPos: number;
  let utgPos: number;
  if (n === 2) {
    // Heads-up: the button posts the small blind and acts first preflop.
    sbPos = dealerIdx;
    bbPos = (dealerIdx + 1) % 2;
    utgPos = dealerIdx;
  } else {
    sbPos = (dealerIdx + 1) % n;
    bbPos = (dealerIdx + 2) % n;
    utgPos = (dealerIdx + 3) % n;
  }

  const b: Betting = {
    seats,
    pot: 0,
    currentBet: st.bb,
    minRaise: st.bb,
    bigBlind: st.bb,
    toAct: "",
    acted: [],
  };
  const post = (pos: number, amt: number) => {
    const s = seats[pos];
    const put = Math.min(amt, s.chips);
    s.chips -= put;
    s.bet += put;
    s.totalBet += put;
    b.pot += put;
    if (s.chips === 0) s.status = "all-in";
  };
  post(sbPos, st.sb);
  post(bbPos, st.bb);
  st.betting = b;

  // First to act: UTG, or the next seat that can still act (a blind may be
  // all-in from posting).
  b.toAct = seats[utgPos].status === "active" ? seats[utgPos].id : "";
  if (!b.toAct) {
    const next = nextActive(b, utgPos);
    b.toAct = next >= 0 ? seats[next].id : "";
  }
  if (roundComplete(b)) {
    // Nobody can act (every funded player is all-in from the blinds).
    b.toAct = "";
    maybeAdvance(st);
  }
  armDeadline(st, now);
}

export function act(
  st: EngineState,
  uid: string,
  action: string,
  amount: number,
  now: number,
): void {
  if (st.paused) throw new OnlineError("La partida esta en pausa");
  const b = st.betting;
  if (!b || betweenHands(st)) throw new OnlineError("No hay apuestas en curso");
  if (!Number.isFinite(amount) || amount < 0) throw new OnlineError("Monto invalido");
  applyBet(b, uid, action, Math.floor(amount));
  st.lastAction = { seatId: uid, action, ...(amount > 0 ? { amount: Math.floor(amount) } : {}), ts: now };
  maybeAdvance(st);
  armDeadline(st, now);
}

// Turn timer. Auto-checks when possible, otherwise auto-folds; a player whose
// presence heartbeat went stale is stood up instead (their stack is cashed
// out). Returns false when the deadline has not passed yet.
export function timeout(
  st: EngineState,
  now: number,
  isStale: (uid: string) => boolean,
): boolean {
  const b = st.betting;
  if (!b || betweenHands(st) || st.paused || !b.toAct || !st.deadline) return false;
  if (now < st.deadline) return false;
  const id = b.toAct;
  if (isStale(id)) {
    leave(st, id, now);
    return true;
  }
  const seat = b.seats.find((s) => s.id === id);
  const canCheck = !!seat && seat.bet >= b.currentBet;
  applyBet(b, id, canCheck ? "check" : "fold", 0);
  st.lastAction = { seatId: id, action: canCheck ? "check" : "fold", ts: now };
  maybeAdvance(st);
  armDeadline(st, now);
  return true;
}

function armDeadline(st: EngineState, now: number): void {
  const b = st.betting;
  st.deadline = b && !betweenHands(st) && b.toAct && !st.paused ? now + TURN_MS : 0;
}

// ---------------------------------------------------------------------------
// Betting round (faithful to src/lib/betting.ts handleAction)
// ---------------------------------------------------------------------------

function applyBet(b: Betting, id: string, action: string, amount: number): void {
  if (b.toAct !== id) throw new OnlineError("No es tu turno");
  const s = b.seats.find((x) => x.id === id);
  if (!s) throw new OnlineError("No estas en la mano");

  // A "bet" facing a bet is a raise of that size on top of the current bet.
  if (action === "bet" && b.currentBet > 0) {
    action = "raise";
    amount = b.currentBet + amount;
  }

  switch (action) {
    case "fold":
      s.status = "folded";
      break;
    case "check":
      if (s.bet < b.currentBet) throw new OnlineError("No puedes pasar: hay una apuesta");
      break;
    case "call": {
      const toCall = Math.max(0, Math.min(b.currentBet - s.bet, s.chips));
      s.chips -= toCall;
      s.bet += toCall;
      s.totalBet += toCall;
      b.pot += toCall;
      if (s.chips === 0) s.status = "all-in";
      break;
    }
    case "bet": {
      const betAmt = Math.min(amount, s.chips);
      if (betAmt <= 0) throw new OnlineError("Monto invalido");
      const isAllIn = betAmt === s.chips;
      if (!isAllIn && betAmt < b.minRaise) throw new OnlineError("Apuesta por debajo del minimo");
      s.chips -= betAmt;
      s.bet += betAmt;
      s.totalBet += betAmt;
      b.pot += betAmt;
      b.currentBet = s.bet;
      b.minRaise = betAmt;
      b.acted = [id];
      if (s.chips === 0) s.status = "all-in";
      break;
    }
    case "raise": {
      const maxTotal = s.chips + s.bet;
      const raiseTotal = Math.min(amount, maxTotal);
      const inc = raiseTotal - s.bet;
      if (inc <= 0) throw new OnlineError("Monto invalido");
      const isAllIn = raiseTotal === maxTotal;
      if (!isAllIn && raiseTotal < b.currentBet + b.minRaise) {
        throw new OnlineError("Subida por debajo del minimo");
      }
      s.chips -= inc;
      s.bet = raiseTotal;
      s.totalBet += inc;
      b.pot += inc;
      if (raiseTotal > b.currentBet) {
        b.minRaise = Math.max(b.minRaise, raiseTotal - b.currentBet);
        b.currentBet = raiseTotal;
        b.acted = [id];
      }
      if (s.chips === 0) s.status = "all-in";
      break;
    }
    case "all-in": {
      const allIn = s.chips;
      if (allIn <= 0) throw new OnlineError("No tienes fichas");
      const newBet = s.bet + allIn;
      s.chips = 0;
      s.bet = newBet;
      s.totalBet += allIn;
      b.pot += allIn;
      s.status = "all-in";
      if (newBet > b.currentBet) {
        b.minRaise = Math.max(b.minRaise, newBet - b.currentBet);
        b.currentBet = newBet;
        b.acted = [id];
      }
      break;
    }
    default:
      throw new OnlineError("Accion desconocida");
  }

  if (!b.acted.includes(id)) b.acted.push(id);
  advanceTurn(b);
}

function actionable(b: Betting): BetSeat[] {
  return b.seats.filter((s) => s.status === "active");
}

function contenders(b: Betting): BetSeat[] {
  return b.seats.filter((s) => s.status === "active" || s.status === "all-in");
}

export function roundComplete(b: Betting): boolean {
  for (const s of actionable(b)) {
    if (s.bet < b.currentBet) return false;
    if (!b.acted.includes(s.id)) return false;
  }
  return true;
}

function nextActive(b: Betting, fromIdx: number): number {
  const n = b.seats.length;
  for (let i = 1; i <= n; i++) {
    const idx = (((fromIdx + i) % n) + n) % n;
    if (b.seats[idx].status === "active") return idx;
  }
  return -1;
}

function advanceTurn(b: Betting): void {
  if (roundComplete(b)) {
    b.toAct = "";
    return;
  }
  let idx = b.seats.findIndex((s) => s.id === b.toAct);
  if (idx < 0) idx = 0;
  const next = nextActive(b, idx);
  b.toAct = next >= 0 ? b.seats[next].id : "";
}

function maybeAdvance(st: EngineState): void {
  const b = st.betting;
  if (!b) return;
  // Everyone else folded: the last player takes the pot, no showdown.
  const live = contenders(b);
  if (live.length === 1) {
    st.winners = [{ id: live[0].id, amount: b.pot }];
    st.deadline = 0;
    b.toAct = "";
    applyWinnings(st);
    st.phase = "showdown";
    return;
  }
  if (!roundComplete(b)) return;

  // Betting is closed for the rest of the hand: run the board out.
  if (actionable(b).length <= 1) {
    const needed = 5 - st.board.length;
    b.toAct = "";
    if (st.runItN > 1 && needed > 0 && st.deck.length >= needed * st.runItN) {
      settleRunItN(st, needed);
    } else {
      while (st.board.length < 5) dealNextStreet(st);
      settleShowdown(st);
    }
    return;
  }

  if (st.phase === "river") {
    settleShowdown(st);
    return;
  }
  advanceStreet(st);
}

function dealNextStreet(st: EngineState): void {
  if (st.board.length === 0) {
    st.board.push(...st.deck.slice(0, 3));
    st.deck = st.deck.slice(3);
  } else if (st.board.length < 5) {
    st.board.push(st.deck[0]);
    st.deck = st.deck.slice(1);
  }
}

function advanceStreet(st: EngineState): void {
  const b = st.betting!;
  dealNextStreet(st);
  st.phase = st.board.length === 3 ? "flop" : st.board.length === 4 ? "turn" : "river";
  for (const s of b.seats) s.bet = 0;
  b.currentBet = 0;
  b.minRaise = b.bigBlind;
  b.acted = [];
  // Postflop the first active seat left of the button acts first.
  const dealerIdx = b.seats.findIndex((s) => s.id === st.dealerId);
  const next = nextActive(b, dealerIdx < 0 ? -1 : dealerIdx);
  b.toAct = next >= 0 ? b.seats[next].id : "";
}

// ---------------------------------------------------------------------------
// Showdown
// ---------------------------------------------------------------------------

type Pot = { amount: number; eligible: string[] };

// Splits the pot by all-in tiers (port of computeSidePots). A tier whose
// contributors all folded is awarded among the players still in the hand, so
// no chips are ever lost.
export function sidePots(b: Betting): Pot[] {
  const live = contenders(b).map((s) => s.id);
  const caps = [...new Set(b.seats.map((s) => s.totalBet).filter((t) => t > 0))].sort(
    (x, y) => x - y,
  );
  if (caps.length === 0) return [{ amount: b.pot, eligible: live }];
  const pots: Pot[] = [];
  let prev = 0;
  for (const cap of caps) {
    const tier = cap - prev;
    let amount = 0;
    for (const s of b.seats) amount += Math.max(0, Math.min(s.totalBet - prev, tier));
    let eligible = b.seats
      .filter((s) => s.totalBet >= cap && (s.status === "active" || s.status === "all-in"))
      .map((s) => s.id);
    if (eligible.length === 0) eligible = live;
    if (amount > 0) {
      const last = pots[pots.length - 1];
      // Merge tiers with the same eligible set (purely cosmetic).
      if (last && last.eligible.join(",") === eligible.join(",")) last.amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = cap;
  }
  return pots;
}

function parseCards(ids: string[]): Card[] {
  return ids.map((id) => cardFromId(id)).filter((c): c is Card => !!c);
}

function awardPot(
  b: Betting,
  holes: Record<string, string[]>,
  board: Card[],
  pot: Pot,
  amount: number,
): GameWinner[] {
  let best: Score | null = null;
  let winners: string[] = [];
  for (const id of pot.eligible) {
    const h = holes[id];
    if (!h) continue;
    const score = bestHand([...parseCards(h), ...board]);
    const cmp = best ? compareScore(score, best) : 1;
    if (cmp > 0) {
      best = score;
      winners = [id];
    } else if (cmp === 0) {
      winners.push(id);
    }
  }
  if (winners.length === 0) return [];
  const share = Math.floor(amount / winners.length);
  const rem = amount - share * winners.length;
  // Odd chip to the first winner in seat order (deterministic).
  const first = b.seats.find((s) => winners.includes(s.id))?.id ?? winners[0];
  return winners.map((id) => ({ id, amount: share + (id === first ? rem : 0) }));
}

function sumBySeat(b: Betting, lists: GameWinner[][]): GameWinner[] {
  const totals = new Map<string, number>();
  for (const list of lists) {
    for (const w of list) totals.set(w.id, (totals.get(w.id) ?? 0) + w.amount);
  }
  return b.seats
    .filter((s) => (totals.get(s.id) ?? 0) > 0)
    .map((s) => ({ id: s.id, amount: totals.get(s.id)! }));
}

function revealContenders(st: EngineState): void {
  const b = st.betting!;
  st.reveals = {};
  for (const s of contenders(b)) {
    const h = st.holes[s.id];
    if (h) st.reveals[s.id] = h.slice();
  }
  const board = parseCards(st.board);
  st.handCategories = {};
  if (board.length === 5) {
    for (const [id, h] of Object.entries(st.reveals)) {
      st.handCategories[id] = bestHand([...parseCards(h), ...board])[0];
    }
  }
}

function settleShowdown(st: EngineState): void {
  const b = st.betting!;
  const board = parseCards(st.board);
  const lists = sidePots(b).map((p) => awardPot(b, st.holes, board, p, p.amount));
  st.winners = sumBySeat(b, lists);
  revealContenders(st);
  applyWinnings(st);
  st.phase = "showdown";
  st.deadline = 0;
}

// Runs the rest of the board `runItN` times from disjoint deck slices and
// splits every side pot evenly across the runs (odd chips to the first run).
function settleRunItN(st: EngineState, needed: number): void {
  const b = st.betting!;
  const n = st.runItN;
  const pots = sidePots(b);
  const all: GameWinner[][] = [];
  st.runs = [];
  for (let r = 0; r < n; r++) {
    const boardIds = [...st.board, ...st.deck.slice(r * needed, (r + 1) * needed)];
    const board = parseCards(boardIds);
    const runLists: GameWinner[][] = [];
    for (const p of pots) {
      const per = Math.floor(p.amount / n);
      const share = per + (r === 0 ? p.amount - per * n : 0);
      if (share > 0) runLists.push(awardPot(b, st.holes, board, p, share));
    }
    const runWinners = sumBySeat(b, runLists);
    all.push(runWinners);
    st.runs.push({ board: boardIds, pot: runWinners.reduce((t, w) => t + w.amount, 0), winners: runWinners });
  }
  // The table shows the first run's board; each run's board is in `runs`.
  st.board = st.runs[0].board.slice();
  st.deck = st.deck.slice(n * needed);
  st.winners = sumBySeat(b, all);
  revealContenders(st);
  applyWinnings(st);
  st.phase = "showdown";
  st.deadline = 0;
}

// Credits winnings back into persistent stacks. Players who stood up while
// all-in are paid out now (stack behind + winnings).
function applyWinnings(st: EngineState): void {
  const b = st.betting!;
  const won = new Map(st.winners.map((w) => [w.id, w.amount]));
  for (const s of b.seats) {
    const final = s.chips + (won.get(s.id) ?? 0);
    if (st.players[s.id]) {
      st.chips[s.id] = final;
    } else if (st.leaving[s.id]) {
      const info = st.leaving[s.id];
      st.payouts.push({ uid: s.id, amount: final, buyIn: info.buyIn, coins: info.coins });
      delete st.chips[s.id];
    }
  }
  st.leaving = {};
  for (const s of b.seats) {
    if (st.players[s.id] && (st.chips[s.id] ?? 0) === 0 && !st.bustedOrder.includes(s.id)) {
      st.bustedOrder.push(s.id);
    }
  }
  // The hand is over: whoever sat down meanwhile takes a seat (or queues).
  syncSeats(st);
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

export function publicView(st: EngineState): PublicState {
  const b = st.betting;
  const showdown = st.phase === "showdown";
  let seats: PublicSeat[];
  const nameOf = (id: string) => st.players[id]?.name ?? st.names[id] ?? "Jugador";
  const seedOf = (id: string) => st.players[id]?.seed ?? st.seeds[id] ?? id;
  if (b && st.phase !== "idle") {
    const inHand = new Set<string>();
    seats = b.seats.map((s) => {
      inHand.add(s.id);
      let chips = s.chips;
      // At showdown the persistent stack already includes the winnings.
      if (showdown && st.chips[s.id] !== undefined) chips = st.chips[s.id];
      return {
        id: s.id,
        name: nameOf(s.id),
        seed: seedOf(s.id),
        chips,
        bet: s.bet,
        totalBet: s.totalBet,
        status: s.status,
        hasCards: s.status !== "folded" && s.status !== "out",
      };
    });
    if (showdown) {
      // Players who sat down during the hand appear seated (dealt in next).
      for (const id of st.seatIds) {
        if (seats.length >= MAX_SEATED) break;
        if (!inHand.has(id) && st.players[id]) {
          seats.push({
            id,
            name: nameOf(id),
            seed: seedOf(id),
            chips: st.chips[id] ?? 0,
            bet: 0,
            status: "active",
            hasCards: false,
          });
        }
      }
    }
  } else {
    seats = st.seatIds.map((id) => ({
      id,
      name: nameOf(id),
      seed: seedOf(id),
      chips: st.chips[id] ?? 0,
      bet: 0,
      status: "active",
      hasCards: false,
    }));
  }

  const listed = new Set([...seats.map((s) => s.id), ...st.waiting]);
  const joining = orderedPlayers(st)
    .map((p) => p.id)
    .filter((id) => !listed.has(id));

  const live = !!b && st.phase !== "idle";
  const out: PublicState = {
    code: st.code,
    handNum: st.handNum,
    phase: st.phase,
    board: st.board.slice(),
    pot: live ? b!.pot : 0,
    toAct: live && !showdown ? b!.toAct : "",
    deadline: st.deadline || 0,
    seats,
    sb: st.sb,
    bb: st.bb,
    startStack: st.startStack,
    currentBet: live && !showdown ? b!.currentBet : 0,
    minRaise: live && !showdown ? b!.minRaise : 0,
    dealer: st.dealerId || undefined,
    owner: ownerOf(st) || undefined,
    creator: st.creator,
    paused: st.paused,
    casual: st.casual,
    runItN: st.runItN,
    blindLevelSecs: st.blindLevelSecs,
  };
  if (st.winners.length) out.winners = st.winners.map((w) => ({ ...w }));
  if (Object.keys(st.reveals).length) out.reveals = { ...st.reveals };
  if (st.runs.length) out.runs = st.runs.map((r) => ({ ...r }));
  if (st.lastAction) out.lastAction = { ...st.lastAction };
  if (st.bustedOrder.length) out.bustedOrder = st.bustedOrder.slice();
  if (st.waiting.length) out.waiting = st.waiting.slice();
  if (joining.length) out.joining = joining;
  if (Object.keys(st.handCategories).length) out.handCategories = { ...st.handCategories };
  return out;
}

export function handRecord(st: EngineState, now: number): OnlineHandDoc | null {
  const b = st.betting;
  if (!b || st.phase !== "showdown") return null;
  const seatNames: Record<string, string> = {};
  for (const s of b.seats) seatNames[s.id] = st.players[s.id]?.name ?? st.names[s.id] ?? "Jugador";
  return {
    handNum: st.handNum,
    ts: now,
    pot: b.pot,
    community: st.board.slice(),
    winners: st.winners.map((w) => ({ ...w })),
    reveals: { ...st.reveals },
    categories: { ...st.handCategories },
    dealtIds: b.seats.map((s) => s.id),
    seatNames,
    runs: st.runs.map((r) => ({ ...r })),
  };
}

// Every uid that currently holds chips on this table (for audits/tests).
export function tableChips(st: EngineState): number {
  let total = 0;
  const b = st.betting;
  const live = b && !betweenHands(st);
  const counted = new Set<string>();
  if (live) {
    total += b!.pot;
    for (const s of b!.seats) {
      total += s.chips;
      counted.add(s.id);
    }
  }
  for (const [id, c] of Object.entries(st.chips)) if (!counted.has(id)) total += c;
  return total;
}
