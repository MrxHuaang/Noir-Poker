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
  DEFAULT_AMBIENCE,
  DEFAULT_RULES,
  FELTS,
  PLACES,
  RAILS,
  type Ambience,
  MAX_SEATED,
  REACTIONS,
  REACTION_GAP_MS,
  RUN_VOTE_MS,
  type BlindLevel,
  type Reaction,
  type ReactionKind,
  type GameWinner,
  type LedgerLine,
  type TableRules,
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
  shown?: Record<string, string[]>; // one card at a time after the hand ("" = down)
  runs: RunResult[];
  handCategories: Record<string, number>;
  lastAction: LastAction | null;
  deadline: number;
  bustedOrder: string[];
  // Players who stood up while all-in: their stack settles at showdown.
  leaving: Record<string, { buyIn: number; coins: boolean }>;
  payouts: Payout[]; // consumed (and cleared) by the server layer
  // Once the owner deals the first hand the table keeps dealing on its own:
  // each showdown arms a short deadline and the next tick deals again.
  autoDeal?: boolean;
  nextBlindsAt?: number;
  tournament?: boolean;
  tStarted?: boolean;
  tFinished?: boolean;
  tRanking?: string[];
  // Board length when betting closed with everyone all-in (-1: no runout).
  runoutFrom?: number;
  // House rules (PokerNow-style room settings). Missing on old rooms: defaults.
  rules?: TableRules;
  level?: number; // current blind level, 1-based, when there is a schedule
  ante?: number; // ante posted this hand
  bank?: Record<string, number>; // time bank left per player (seconds)
  bankCount?: Record<string, number>; // hands since the bank was refilled
  usingBank?: string; // player on the clock running on their time bank
  away?: Record<string, boolean>; // stepped away from the table
  requests?: Record<string, { name: string; seed: string; coins: boolean; ts: number; amount?: number }>;
  runVote?: { voters: string[]; votes: Record<string, number>; needed: number };
  rabbit?: string[];
  ledger?: { id: string; name: string; buyIn: number; out: number }[]; // players who left
  // Lost connection (heartbeat stale): kept seated but skipped, never dealt in.
  gone?: Record<string, boolean>;
  straddler?: string; // posted the straddle this hand
  bomb?: boolean; // this hand is a bomb pot
  // Per-hand stats inputs, copied into the hand record.
  hs?: { vpip: string[]; pfr: string[]; sawFlop: string[] };
  reaction?: Reaction;
  reactAt?: Record<string, number>;
  ambience?: Ambience;
};

/** Effective rules of a room (old rooms predate them). */
export function rulesOf(st: EngineState): TableRules {
  // Rooms older than a rule get its default.
  return st.rules ? { ...DEFAULT_RULES, ...st.rules } : DEFAULT_RULES;
}

// Clamps whatever the client sent into sane rules, starting from the current ones.
export function normalizeRules(input: Partial<TableRules> | undefined, prev: TableRules = DEFAULT_RULES): TableRules {
  const r: TableRules = { ...DEFAULT_RULES, ...prev, levels: prev.levels.map((l) => ({ ...l })) };
  if (!input || typeof input !== "object") return r;
  const num = (v: unknown, lo: number, hi: number, fb: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb;
  };
  if (input.ante !== undefined) r.ante = num(input.ante, 0, MAX_BLIND, r.ante);
  if (Array.isArray(input.levels)) {
    r.levels = input.levels.slice(0, 30).map((l: Partial<BlindLevel>) => {
      const sb = num(l?.sb, 1, MAX_BLIND, 5);
      const bb = Math.max(sb, num(l?.bb, 1, MAX_BLIND, sb * 2));
      return { sb, bb, ante: num(l?.ante, 0, MAX_BLIND, 0), mins: num(l?.mins, 0, 240, 0) };
    });
  }
  if (input.turnSecs !== undefined) { const t = num(input.turnSecs, 0, 300, r.turnSecs); r.turnSecs = t === 0 ? 0 : Math.max(5, t); }
  if (input.bankSecs !== undefined) r.bankSecs = num(input.bankSecs, 0, 300, r.bankSecs);
  if (input.bankHands !== undefined) r.bankHands = num(input.bankHands, 1, 100, r.bankHands);
  if (input.autoStart !== undefined) r.autoStart = input.autoStart === true;
  if (input.showdownSecs !== undefined) { const v = num(input.showdownSecs, 3, 9, 6); r.showdownSecs = v <= 4 ? 3 : v >= 8 ? 9 : 6; }
  if (input.revealAllIn !== undefined) r.revealAllIn = input.revealAllIn === true;
  if (input.runItMode === "once" || input.runItMode === "ask" || input.runItMode === "twice") r.runItMode = input.runItMode;
  if (input.rabbit !== undefined) r.rabbit = input.rabbit === true;
  if (input.maxSeats !== undefined) r.maxSeats = num(input.maxSeats, 2, MAX_SEATED, r.maxSeats);
  if (input.approveSeats !== undefined) r.approveSeats = input.approveSeats === true;
  if (input.dealAway !== undefined) r.dealAway = input.dealAway === true;
  if (input.straddle !== undefined) r.straddle = input.straddle === true;
  if (input.bombEvery !== undefined) r.bombEvery = num(input.bombEvery, 0, 50, r.bombEvery ?? 0);
  if (input.bombBB !== undefined) r.bombBB = num(input.bombBB, 1, 20, r.bombBB ?? 2);
  if (input.buyInMin !== undefined) r.buyInMin = num(input.buyInMin, 0, MAX_STACK, r.buyInMin ?? 0);
  if (input.buyInMax !== undefined) r.buyInMax = num(input.buyInMax, 0, MAX_STACK, r.buyInMax ?? 0);
  if (r.buyInMin && r.buyInMax && r.buyInMax < r.buyInMin) r.buyInMax = r.buyInMin;
  return r;
}

export const DEFAULT_SB = 5;
export const DEFAULT_BB = 10;
export const DEFAULT_STACK = 1000;
const MAX_STACK = 1_000_000;
const MAX_BLIND = 100_000;
const BLIND_CAP_SB = 800; // escalation stops doubling past 800/1600
const GONE_TURN_MS = 3_000;

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
    tournament: !!cfg.tournament,
    rules: normalizeRules(cfg.rules, { ...DEFAULT_RULES, runItMode: (cfg.runItN ?? 1) > 1 ? "twice" : DEFAULT_RULES.runItMode }),
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
  if (cfg.rules) {
    const next = normalizeRules(cfg.rules, rulesOf(st));
    if (JSON.stringify(next.levels) !== JSON.stringify(rulesOf(st).levels) && next.levels.length) {
      st.blindsSince = now;
      st.baseSb = next.levels[0].sb;
      st.baseBb = next.levels[0].bb;
      st.sb = st.baseSb;
      st.bb = st.baseBb;
    }
    st.rules = next;
  }
  if (cfg.ambience && typeof cfg.ambience === "object") {
    const a = cfg.ambience;
    const prev = st.ambience ?? DEFAULT_AMBIENCE;
    const pick = <T extends string>(v: unknown, list: readonly T[], fb: T): T =>
      (list as readonly unknown[]).includes(v) ? (v as T) : fb;
    st.ambience = {
      place: pick(a.place, PLACES, prev.place),
      felt: pick(a.felt, FELTS, prev.felt),
      rail: pick(a.rail, RAILS, prev.rail),
    };
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
  if (st.tournament && st.tStarted) throw new OnlineError("El torneo ya empezó: la mesa no se configura");
  applyConfig(st, { ...cfg, casual: undefined, tournament: undefined }, now);
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
    if (st.seatIds.length < rulesOf(st).maxSeats) st.seatIds.push(p.id);
    else st.waiting.push(p.id);
  }
}

// ---------------------------------------------------------------------------
// Seating
// ---------------------------------------------------------------------------

export type SitResult = "seated" | "queued" | "joining" | "already" | "requested";

/**
 * What a player may bring to the table. Tournaments and tables without a
 * range keep the fixed stack; otherwise [min, max] around the table stack.
 */
export function buyInRange(st: EngineState): { min: number; max: number } {
  const fixed = { min: st.startStack, max: st.startStack };
  if (st.tournament) return fixed;
  const r = rulesOf(st);
  if (!r.buyInMin && !r.buyInMax) return fixed;
  const floor = st.bb * 2;
  const min = Math.min(MAX_STACK, Math.max(floor, r.buyInMin || Math.min(st.startStack, r.buyInMax || st.startStack)));
  const max = Math.min(MAX_STACK, Math.max(min, r.buyInMax || Math.max(st.startStack, min)));
  return { min, max };
}

/** The buy-in for a requested amount: clamped to the range, the table stack when absent. */
export function buyInFor(st: EngineState, amount?: number): number {
  const { min, max } = buyInRange(st);
  const want = amount !== undefined && Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : st.startStack;
  return Math.min(max, Math.max(min, want));
}

export function sit(
  st: EngineState,
  uid: string,
  name: string,
  seed: string,
  coins: boolean,
  amount?: number,
): SitResult {
  if (st.players[uid]) return "already";
  const buyIn = buyInFor(st, amount);
  if (st.tournament && st.tStarted) throw new OnlineError("El torneo ya empezó. Puedes mirar desde la barra.");
  if (st.betting && !betweenHands(st) && st.betting.seats.some((s) => s.id === uid)) {
    // Left mid-hand and came straight back: the old seat is still settling.
    throw new OnlineError("Espera a que termine la mano para volver a sentarte");
  }
  // The owner lets people in: everyone but the creator (or the first one at an
  // empty table) waits at the door.
  const owner = ownerOf(st);
  if (rulesOf(st).approveSeats && uid !== st.creator && owner && owner !== uid) {
    st.requests = st.requests ?? {};
    st.requests[uid] = { name: name.slice(0, 40) || "Jugador", seed: seed.slice(0, 80) || uid, coins, ts: st.nextSeq++, amount: buyIn };
    return "requested";
  }
  return seatPlayer(st, uid, name, seed, coins, buyIn);
}

function seatPlayer(st: EngineState, uid: string, name: string, seed: string, coins: boolean, buyIn: number): SitResult {
  if (st.requests) delete st.requests[uid];
  st.players[uid] = {
    id: uid,
    name: name.slice(0, 40) || "Jugador",
    seed: seed.slice(0, 80) || uid,
    joinSeq: st.nextSeq++,
    buyIn,
    coins,
  };
  st.names[uid] = st.players[uid].name;
  st.seeds[uid] = st.players[uid].seed;
  st.chips[uid] = buyIn;
  st.bank = st.bank ?? {};
  st.bank[uid] = rulesOf(st).bankSecs;
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
  (st.ledger = st.ledger ?? []).push({ id: uid, name: p.name, buyIn: p.buyIn, out: behind });
  if (st.away) delete st.away[uid];
  if (st.gone) delete st.gone[uid];
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

export function rebuy(st: EngineState, uid: string, amount?: number): number {
  const p = st.players[uid];
  if (!p) throw new OnlineError("No estas sentado");
  if (st.tournament) throw new OnlineError("En el torneo no hay recompras");
  if (!betweenHands(st)) throw new OnlineError("Espera a que termine la mano");
  if ((st.chips[uid] ?? 0) > 0) throw new OnlineError("Todavia tienes fichas");
  const add = buyInFor(st, amount);
  st.chips[uid] = add;
  p.buyIn += add;
  st.bustedOrder = st.bustedOrder.filter((id) => id !== uid);
  return add;
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

type Blinds = { sb: number; bb: number; ante: number; level: number; nextAt: number };

// The blinds of a hand dealt at `now`: the level schedule when there is one
// (each level lasts `mins`, 0 = forever, the last one holds), else the fixed
// blinds (or the legacy doubling every blindLevelSecs).
export function blindsAt(st: EngineState, now: number): Blinds {
  const levels = rulesOf(st).levels;
  if (levels.length) {
    let t = Math.max(0, now - st.blindsSince);
    let start = st.blindsSince;
    for (let i = 0; i < levels.length; i++) {
      const l = levels[i];
      const len = l.mins * 60_000;
      if (len <= 0 || i === levels.length - 1 || t < len) {
        const nextAt = len > 0 && i < levels.length - 1 ? start + len : 0;
        return { sb: l.sb, bb: l.bb, ante: l.ante, level: i + 1, nextAt };
      }
      t -= len;
      start += len;
    }
  }
  const { sb, bb } = currentBlinds(st, now);
  const step = st.blindLevelSecs * 1000;
  const nextAt = step > 0 ? st.blindsSince + (Math.floor((now - st.blindsSince) / step) + 1) * step : 0;
  return { sb, bb, ante: rulesOf(st).ante, level: 0, nextAt };
}

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
  dealHand(st, now, deck);
}

// Players a new hand would deal in: chips, not stepped away (unless the table
// deals to them) and not disconnected.
function dealable(st: EngineState): string[] {
  const rules = rulesOf(st);
  return st.seatIds.filter((id) => (st.chips[id] ?? 0) > 0 && (rules.dealAway || !st.away?.[id]) && !st.gone?.[id]);
}

// Deals a hand; the caller checked who may deal. From here on the table keeps
// dealing by itself (autoDeal) until it runs out of funded players or pauses.
function dealHand(st: EngineState, now: number, deck: string[]): void {
  if (st.tournament) {
    if (st.tFinished) throw new OnlineError("El torneo terminó");
    standUpBusted(st, now);
    if (!st.tStarted) {
      st.tStarted = true;
      st.blindsSince = now;
      st.baseSb = st.sb;
      st.baseBb = st.bb;
    }
  }

  syncSeats(st);
  const rules = rulesOf(st);
  // Players who stepped away sit this one out unless the table deals to them.
  const funded = dealable(st);
  if (funded.length < 2) throw new OnlineError("Se necesitan al menos 2 jugadores con fichas");

  const blinds = blindsAt(st, now);
  st.nextBlindsAt = blinds.nextAt;
  st.level = blinds.level;
  st.sb = blinds.sb;
  st.bb = blinds.bb;
  st.ante = blinds.ante;
  st.usingBank = "";
  st.runVote = undefined;
  st.rabbit = undefined;
  // Time bank: refilled after `bankHands` hands played.
  st.bank = st.bank ?? {};
  st.bankCount = st.bankCount ?? {};
  for (const id of funded) {
    if (st.bank[id] === undefined) st.bank[id] = rules.bankSecs;
    st.bankCount[id] = (st.bankCount[id] ?? 0) + 1;
    if (st.bankCount[id] >= rules.bankHands) {
      st.bank[id] = rules.bankSecs;
      st.bankCount[id] = 0;
    }
  }

  // Button: next funded player after the previous dealer, by arrival order.
  const seqOf = (id: string) => st.players[id]?.joinSeq ?? 0;
  let dealerIdx = funded.findIndex((id) => seqOf(id) > st.dealerSeq);
  if (dealerIdx < 0) dealerIdx = 0;
  st.dealerId = funded[dealerIdx];
  st.dealerSeq = seqOf(st.dealerId);

  st.autoDeal = true;
  st.runoutFrom = -1;
  st.handNum++;
  st.board = [];
  st.winners = [];
  st.reveals = {};
  st.shown = undefined;
  st.runs = [];
  st.handCategories = {};
  st.lastAction = null;
  st.holes = {};
  st.leaving = {};
  st.phase = "preflop";
  st.straddler = undefined;
  st.hs = { vpip: [], pfr: [], sawFlop: [] };
  // Bomb pot: every N-th hand everyone antes and the hand starts on the flop.
  st.bomb = (rules.bombEvery ?? 0) > 0 && st.handNum % rules.bombEvery === 0;

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
  // Antes are dead money: into the pot, not part of anyone's bet.
  const dead = (amt: number) => {
    for (const s of seats) {
      const put = Math.min(amt, s.chips);
      s.chips -= put;
      s.totalBet += put;
      b.pot += put;
      if (s.chips === 0) s.status = "all-in";
    }
  };
  if (st.bomb) {
    // Everyone puts the same in and nobody bets preflop: straight to the flop.
    dead(st.bb * (rules.bombBB ?? 2));
    st.betting = b;
    b.currentBet = 0;
    advanceStreet(st);
    if (roundComplete(b)) {
      b.toAct = "";
      maybeAdvance(st);
    }
    armDeadline(st, now);
    return;
  }
  if (st.ante > 0) dead(st.ante);
  post(sbPos, st.sb);
  post(bbPos, st.bb);
  st.betting = b;
  // Blind straddle: the seat after the big blind posts two big blinds, the
  // action starts after them and they keep the last word preflop.
  if (rules.straddle && n >= 3) {
    const stPos = (bbPos + 1) % n;
    if (seats[stPos].status === "active") {
      post(stPos, st.bb * 2);
      st.straddler = seats[stPos].id;
      b.currentBet = Math.max(st.bb, seats[stPos].bet);
      b.minRaise = st.bb * 2;
      utgPos = (stPos + 1) % n;
    }
  }

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
  const phase = st.phase;
  const seat = b.seats.find((x) => x.id === uid);
  const before = b.currentBet;
  const toCall = seat ? before - seat.bet : 0;
  applyBet(b, uid, action, Math.floor(amount));
  if (phase === "preflop" && !st.bomb && seat) {
    // VPIP: money in by choice (a call of something, a bet, a raise); PFR: a raise.
    const hs = (st.hs = st.hs ?? { vpip: [], pfr: [], sawFlop: [] });
    const raised = b.currentBet > before;
    if ((raised || (action === "call" && toCall > 0) || action === "all-in") && !hs.vpip.includes(uid)) hs.vpip.push(uid);
    if (raised && !hs.pfr.includes(uid)) hs.pfr.push(uid);
  }
  st.lastAction = { seatId: uid, action, ...(amount > 0 ? { amount: Math.floor(amount) } : {}), ts: now };
  st.usingBank = "";
  maybeAdvance(st);
  armDeadline(st, now);
}

// All-in: a player involved votes 1 or 2 boards. Twice only if all agree.
export function voteRun(st: EngineState, uid: string, n: number, now: number): void {
  const v = st.runVote;
  if (!v) throw new OnlineError("No hay nada que votar");
  if (!v.voters.includes(uid)) throw new OnlineError("Solo votan los que están en el all-in");
  v.votes[uid] = n === 2 ? 2 : 1;
  // A vote never restarts the vote clock (a player clicking again, or a
  // client retrying, must not keep the table waiting forever).
  if (v.voters.every((id) => v.votes[id] !== undefined)) {
    resolveRunVote(st);
    armDeadline(st, now);
  }
}

function resolveRunVote(st: EngineState): void {
  const v = st.runVote;
  if (!v) return;
  const n = v.voters.every((id) => v.votes[id] === 2) ? 2 : 1;
  st.runVote = undefined;
  if (rulesOf(st).revealAllIn && st.betting) {
    st.reveals = {};
    for (const x of contenders(st.betting)) if (st.holes[x.id]) st.reveals[x.id] = st.holes[x.id].slice();
  }
  runout(st, v.needed, n);
}

// Deals the rest of the board (once or n times) and settles the hand.
function runout(st: EngineState, needed: number, n: number): void {
  if (n > 1 && needed > 0 && st.deck.length >= needed * n) {
    settleRunItN(st, needed, n);
  } else {
    while (st.board.length < 5) dealNextStreet(st);
    settleShowdown(st);
  }
}

// Steps away from the table (or comes back). Away players are not dealt in
// unless the table deals to them.
export function setAway(st: EngineState, uid: string, away: boolean): void {
  if (!st.players[uid]) throw new OnlineError("No estas sentado");
  st.away = st.away ?? {};
  if (away) st.away[uid] = true;
  else delete st.away[uid];
}

// Connection check before a deal: whoever has been gone longer than
// `goneMs` stands up (stack cashed out), the recently gone are kept but
// skipped, and anyone whose heartbeat is fresh again is back.
export function markPresence(st: EngineState, ageOf: (uid: string) => number, staleMs: number, goneMs: number, now: number): boolean {
  let changed = false;
  for (const id of Object.keys(st.players)) {
    const age = ageOf(id);
    if (age > goneMs) {
      leave(st, id, now);
      changed = true;
    } else if (age > staleMs) {
      if (!st.gone?.[id]) {
        (st.gone = st.gone ?? {})[id] = true;
        changed = true;
      }
    } else if (st.gone?.[id]) {
      delete st.gone[id];
      changed = true;
    }
  }
  return changed;
}

// The player is back (their client says so right after reconnecting).
export function back(st: EngineState, uid: string): boolean {
  if (!st.gone?.[uid]) return false;
  delete st.gone[uid];
  return true;
}

// After a hand, a player still holding cards may turn them face up (the
// winner of a pot nobody called, or a hand that was not shown): one of them
// (0 = left, 1 = right) or both. Once both are up they count as revealed.
export function show(st: EngineState, uid: string, which?: number): void {
  if (st.phase !== "showdown") throw new OnlineError("Solo al terminar la mano");
  const h = st.holes[uid];
  const seat = st.betting?.seats.find((s) => s.id === uid);
  if (!h || h.length !== 2 || !seat || seat.status === "folded") throw new OnlineError("No tienes cartas en esta mano");
  if (st.reveals[uid]) return;
  const up = (st.shown?.[uid] ?? ["", ""]).slice();
  if (which === 0 || which === 1) up[which] = h[which];
  else up.splice(0, 2, h[0], h[1]);
  if (up[0] && up[1]) {
    st.reveals = { ...st.reveals, [uid]: h.slice() };
    if (st.shown) delete st.shown[uid];
  } else {
    st.shown = { ...st.shown, [uid]: up };
  }
}

// A gesture at the table: seated players only, one every REACTION_GAP_MS.
export function react(st: EngineState, uid: string, kind: string, now: number): void {
  if (!st.players[uid]) throw new OnlineError("Solo los sentados hacen gestos");
  if (!(REACTIONS as readonly string[]).includes(kind)) throw new OnlineError("Gesto desconocido");
  const last = st.reactAt?.[uid] ?? 0;
  if (now - last < REACTION_GAP_MS) throw new OnlineError("Con calma", 429);
  (st.reactAt = st.reactAt ?? {})[uid] = now;
  st.reaction = { seatId: uid, kind: kind as ReactionKind, ts: now };
}

function ownerOnly(st: EngineState, uid: string): void {
  if (ownerOf(st) !== uid) throw new OnlineError("Solo el anfitrion puede hacerlo", 403);
}

// The owner lets a waiting player in (the server escrows their buy-in).
export function approve(st: EngineState, owner: string, target: string): SitResult {
  ownerOnly(st, owner);
  const req = st.requests?.[target];
  if (!req) throw new OnlineError("Esa persona ya no está esperando");
  return seatPlayer(st, target, req.name, req.seed, req.coins, buyInFor(st, req.amount));
}

export function deny(st: EngineState, owner: string, target: string): void {
  ownerOnly(st, owner);
  if (st.requests) delete st.requests[target];
}

// The owner stands a player up (their stack is paid out as if they left).
export function kick(st: EngineState, owner: string, target: string, now: number): void {
  ownerOnly(st, owner);
  if (target === owner) throw new OnlineError("No puedes echarte a ti mismo");
  if (st.requests) delete st.requests[target];
  leave(st, target, now);
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
  if (st.runVote && !st.paused) {
    if (!st.deadline || now < st.deadline) return false;
    resolveRunVote(st);
    armDeadline(st, now);
    return true;
  }
  if (!b || betweenHands(st) || st.paused || !b.toAct || !st.deadline) return false;
  if (now < st.deadline) return false;
  const id = b.toAct;
  const stale = isStale(id);
  if (st.gone?.[id] && !stale) {
    // Back from a dropped connection: the normal clock again.
    delete st.gone[id];
    armDeadline(st, now);
    return true;
  }
  if (stale) {
    // Lost connection: keep the seat, act for them (check or fold) without
    // burning their time bank. They are skipped until they come back.
    (st.gone = st.gone ?? {})[id] = true;
    st.usingBank = "";
    const s = b.seats.find((x) => x.id === id);
    const check = !!s && s.bet >= b.currentBet;
    applyBet(b, id, check ? "check" : "fold", 0);
    st.lastAction = { seatId: id, action: check ? "check" : "fold", ts: now };
    maybeAdvance(st);
    armDeadline(st, now);
    return true;
  }
  // The clock ran out: light another cigarette if there is time in the bank.
  const bank = st.bank?.[id] ?? 0;
  if (bank > 0 && st.usingBank !== id) {
    st.usingBank = id;
    st.bank![id] = 0;
    st.deadline = now + bank * 1000;
    return true;
  }
  st.usingBank = "";
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
  if (st.phase === "showdown" && st.tournament && st.tStarted && !st.tFinished) finishIfWon(st);
  if (st.phase === "showdown" && st.autoDeal && !st.paused) {
    // Without auto-start the owner deals each hand by hand.
    st.deadline = rulesOf(st).autoStart ? now + nextHandDelay(st) : 0;
    return;
  }
  if (st.runVote && !st.paused) {
    st.deadline = now + RUN_VOTE_MS;
    return;
  }
  // A disconnected player is acted for after a short beat, not a full clock.
  if (b && !betweenHands(st) && b.toAct && !st.paused && st.gone?.[b.toAct]) {
    st.deadline = now + GONE_TURN_MS;
    return;
  }
  const turn = rulesOf(st).turnSecs * 1000;
  st.deadline = b && !betweenHands(st) && b.toAct && !st.paused && turn > 0 ? now + turn : 0;
}

// Time a finished hand stays on the table before the next deal: long enough
// for the 3D runout (an all-in board comes card by card in the dark).
export function nextHandDelay(st: EngineState): number {
  const base = rulesOf(st).showdownSecs * 1000;
  const shown = Object.keys(st.reveals ?? {}).length >= 2;
  if (!shown) return Math.max(3_000, base - 1_500);
  const from = st.runoutFrom ?? -1;
  // The table runs an all-in out slowly (flop turned card by card, a pause,
  // the turn, the river squeezed open): give the scene time to finish it.
  if (from >= 0 && from < 5) {
    const flop = from < 3 ? 5_500 : 0;
    const turn = from < 4 ? 4_800 : 0;
    const once = flop + turn + 6_800;
    // Run twice: the second board is dealt the same way, under the first.
    return base + 3_000 + once + (st.runs.length > 1 ? 2_500 + once : 0);
  }
  return base + 1_000;
}

// Deals the next hand once the showdown deadline passed. Any client may
// trigger it (there is no background server): the time check makes it safe
// and idempotent. With fewer than two funded players the table stops and
// waits for the owner to deal again. Returns false when nothing was due.
// Tournament: whoever has no chips left stands up before the next deal (their
// place is their position in bustedOrder).
function standUpBusted(st: EngineState, now: number): void {
  for (const id of Object.keys(st.players)) {
    if ((st.chips[id] ?? 0) === 0) {
      if (!st.bustedOrder.includes(id)) st.bustedOrder.push(id);
      leave(st, id, now);
    }
  }
}

// Tournament over when a single player holds chips: they win them all.
function finishIfWon(st: EngineState): void {
  const alive = Object.keys(st.players).filter((id) => (st.chips[id] ?? 0) > 0);
  if (alive.length !== 1) return;
  st.tFinished = true;
  st.autoDeal = false;
  const out = st.bustedOrder.filter((id) => id !== alive[0]).slice().reverse();
  st.tRanking = [alive[0], ...out];
}

export function autoNext(
  st: EngineState,
  now: number,
  deck: string[] = shuffle(makeDeck()).map((c) => c.id),
): boolean {
  if (st.phase !== "showdown" || !st.autoDeal || st.paused || !st.deadline || now < st.deadline) return false;
  syncSeats(st);
  if (dealable(st).length < 2) {
    st.autoDeal = false;
    st.deadline = 0;
    return true;
  }
  dealHand(st, now, deck);
  return true;
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
    if (rulesOf(st).rabbit && st.board.length < 5) st.rabbit = st.deck.slice(0, 5 - st.board.length);
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
    st.runoutFrom = st.board.length;
    b.toAct = "";
    const rules = rulesOf(st);
    if (rules.runItMode === "ask" && needed > 0 && st.deck.length >= needed * 2 && live.length >= 2) {
      // Everyone left is all-in: they choose how many boards to run. The
      // hands stay hidden until the vote closes: a player who could see the
      // other hand would only say "twice" when behind.
      st.runVote = { voters: live.map((x) => x.id), votes: {}, needed };
      return;
    }
    runout(st, needed, rules.runItMode === "twice" ? 2 : st.runItN > 1 ? st.runItN : 1);
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
    if (st.betting) (st.hs = st.hs ?? { vpip: [], pfr: [], sawFlop: [] }).sawFlop = contenders(st.betting).map((x) => x.id);
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
function settleRunItN(st: EngineState, needed: number, n: number): void {
  const b = st.betting!;
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
      (st.ledger = st.ledger ?? []).push({ id: s.id, name: st.names[s.id] ?? "Jugador", buyIn: info.buyIn, out: final });
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
        ...(st.away?.[s.id] ? { away: true } : {}),
        ...(st.gone?.[s.id] ? { gone: true } : {}),
        ...(st.straddler === s.id ? { straddle: true } : {}),
        bank: st.bank?.[s.id] ?? 0,
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
      ...(st.away?.[id] ? { away: true } : {}),
      ...(st.gone?.[id] ? { gone: true } : {}),
      bank: st.bank?.[id] ?? 0,
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
  if (st.nextBlindsAt) out.nextBlindsAt = st.nextBlindsAt;
  out.rules = rulesOf(st);
  if (!st.tournament) out.buyIn = buyInRange(st);
  if (st.ambience) out.ambience = { ...st.ambience };
  if (st.ante) out.ante = st.ante;
  if (st.level) out.level = st.level;
  if (st.runVote) out.runVote = { voters: st.runVote.voters.slice(), votes: { ...st.runVote.votes }, deadline: st.deadline || 0 };
  if (st.rabbit?.length && showdown) out.rabbit = st.rabbit.slice();
  const reqs = Object.entries(st.requests ?? {}).sort((x, y) => x[1].ts - y[1].ts);
  if (reqs.length) out.requests = reqs.map(([id, r]) => ({ id, name: r.name }));
  if (st.usingBank && live && !showdown && b!.toAct === st.usingBank) out.timeBank = true;
  const book: LedgerLine[] = orderedPlayers(st).map((p) => ({ id: p.id, name: p.name, buyIn: p.buyIn, stack: st.chips[p.id] ?? 0 }));
  for (const l of st.ledger ?? []) book.push({ id: l.id, name: l.name, buyIn: l.buyIn, stack: l.out, left: true });
  if (book.length) out.ledger = book;
  if (st.tournament) {
    out.tournament = true;
    if (st.tStarted) out.tStarted = true;
    if (st.tFinished) {
      out.tFinished = true;
      out.ranking = (st.tRanking ?? []).map((id) => ({ id, name: st.names[id] ?? "Jugador" }));
    }
  }
  if (st.winners.length) out.winners = st.winners.map((w) => ({ ...w }));
  if (Object.keys(st.reveals).length) out.reveals = { ...st.reveals };
  if (showdown && st.shown && Object.keys(st.shown).length) out.shown = { ...st.shown };
  if (st.runs.length) out.runs = st.runs.map((r) => ({ ...r }));
  if (st.lastAction) out.lastAction = { ...st.lastAction };
  if (st.bustedOrder.length) out.bustedOrder = st.bustedOrder.slice();
  if (st.waiting.length) out.waiting = st.waiting.slice();
  if (joining.length) out.joining = joining;
  if (Object.keys(st.handCategories).length) out.handCategories = { ...st.handCategories };
  if (st.bomb && live) out.bomb = true;
  if (st.reaction) out.reaction = { ...st.reaction };
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
    vpip: (st.hs?.vpip ?? []).slice(),
    pfr: (st.hs?.pfr ?? []).slice(),
    sawFlop: (st.hs?.sawFlop ?? []).slice(),
    ...(st.bomb ? { bomb: true } : {}),
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
