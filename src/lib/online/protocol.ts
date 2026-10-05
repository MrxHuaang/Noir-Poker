// Wire contract of the server-backed online mode. The authoritative engine
// (src/lib/online/engine.ts) runs inside the Next.js API route /api/online and
// publishes a PublicState to Firestore onlineRooms/{code}; every client
// subscribes to it. Private hole cards go to onlineRooms/{code}/holes/{uid},
// readable only by their owner (firestore.rules). The deck and opponents'
// holes never leave the server (they live in onlineRooms/{code}/private/engine,
// closed to clients).

// House rules of an online table, configurable like a PokerNow room. The
// engine normalizes whatever arrives (clamps, defaults) before using it.
export type BlindLevel = { sb: number; bb: number; ante: number; mins: number }; // mins 0 = forever

export type TableRules = {
  ante: number; // fixed ante when there are no levels
  levels: BlindLevel[]; // empty = fixed blinds; otherwise the schedule, from the first deal
  turnSecs: number; // decision time; 0 = no limit
  bankSecs: number; // time bank per player; 0 = none
  bankHands: number; // hands played to refill the time bank
  autoStart: boolean; // deal the next hand automatically
  showdownSecs: number; // 3 | 6 | 9: how long a finished hand stays on the table
  revealAllIn: boolean; // show the hands as soon as nobody can act any more
  runItMode: "once" | "ask" | "twice"; // all-in runout: always once, ask the players, always twice
  rabbit: boolean; // show the cards that would have come after a fold
  maxSeats: number; // 2..9
  approveSeats: boolean; // the owner lets people in
  dealAway: boolean; // deal cards to players who stepped away
  straddle: boolean; // the player after the big blind posts a blind straddle (2 BB), 3+ players
  bombEvery: number; // every N hands everyone antes and the hand starts on the flop; 0 = never
  bombBB: number; // what each player puts in a bomb pot, in big blinds
  // Cash tables: each player brings any amount in this range (chips, 0 = the
  // table stack). min = max = 0 keeps the old fixed buy-in.
  buyInMin: number;
  buyInMax: number;
};

// Engine defaults keep the behaviour of rooms created before the rules existed;
// the club panel sends its own (ask on all-in, 30 s time bank).
export const DEFAULT_RULES: TableRules = {
  ante: 0,
  levels: [],
  turnSecs: 30,
  bankSecs: 0,
  bankHands: 10,
  autoStart: true,
  showdownSecs: 6,
  revealAllIn: true,
  runItMode: "once",
  rabbit: false,
  maxSeats: 9,
  approveSeats: false,
  dealAway: false,
  straddle: false,
  bombEvery: 0,
  bombBB: 2,
  buyInMin: 0,
  buyInMax: 0,
};

// Where the table is and how it looks (the owner picks it, everyone sees the
// same room). Cosmetic only: ids match the scene's options.
export const PLACES = ["trastienda", "jazz", "muelle"] as const;
export const FELTS = ["verde", "vino", "noche", "carbon"] as const;
export const RAILS = ["cuero", "nogal", "negro"] as const;
// The house dealer (stable ids, the scene dresses and voices each one).
export const DEALERS = ["horacio", "celestina", "conde", "lucha", "tito"] as const;
export type Ambience = {
  place: (typeof PLACES)[number];
  felt: (typeof FELTS)[number];
  rail: (typeof RAILS)[number];
  dealer: (typeof DEALERS)[number];
};
export const DEFAULT_AMBIENCE: Ambience = { place: "trastienda", felt: "verde", rail: "cuero", dealer: "horacio" };

export type RunVote = { voters: string[]; votes: Record<string, number>; deadline: number };

export type LedgerLine = { id: string; name: string; buyIn: number; stack: number; left?: boolean };

export type PublicSeat = {
  id: string;
  name: string;
  seed?: string; // avatar seed (from the player's profile)
  chips: number;
  bet: number;
  totalBet?: number; // committed across the whole hand
  status: string; // "active" | "folded" | "all-in" | "out"
  hasCards: boolean;
  away?: boolean; // stepped away from the table (not dealt in unless dealAway)
  bank?: number; // seconds left in the time bank
  gone?: boolean; // lost connection: skipped (checked or folded) until they come back
  straddle?: boolean; // posted the straddle this hand
};

export type GameWinner = { id: string; amount: number };

export type LastAction = {
  seatId: string;
  action: string;
  amount?: number;
  ts: number; // Unix ms
};

export type RunResult = {
  board: string[];
  pot: number;
  winners: GameWinner[];
};

export type PublicState = {
  code: string;
  handNum: number;
  phase: string; // "idle" | "preflop" | "flop" | "turn" | "river" | "showdown"
  board: string[];
  pot: number;
  toAct: string;
  deadline?: number; // Unix ms when toAct's turn expires; absent/0 = no timer
  seats: PublicSeat[];
  winners?: GameWinner[];
  reveals?: Record<string, string[]>; // seatId -> 2 card ids, at showdown
  // Shown after the hand one at a time: seatId -> [left, right], "" = still down.
  // Moves to reveals once both are up.
  shown?: Record<string, string[]>;
  runs?: RunResult[]; // run-it-N all-in outcomes (N > 1)
  sb: number;
  bb: number;
  startStack: number; // suggested buy-in (and the fixed one when there is no range)
  buyIn?: { min: number; max: number }; // what a player may bring (cash tables)
  ambience?: Ambience;
  currentBet?: number;
  minRaise?: number;
  dealer?: string; // seat id holding the button this hand
  owner?: string; // uid with start/configure authority
  creator?: string; // uid that created the room (reclaims ownership on return)
  lastAction?: LastAction;
  paused?: boolean;
  bustedOrder?: string[];
  waiting?: string[]; // players queued for a seat (table full), arrival order
  joining?: string[]; // players who sat down mid-hand: dealt in next hand
  handCategories?: Record<string, number>; // seatId -> 0-8 at showdown
  casual?: boolean; // no-coin mode: free rebuys, guests can sit
  // Sit-and-go tournament: no rebuys, nobody sits after the first deal, the
  // busted stand up and the last one with chips wins them all.
  tournament?: boolean;
  tStarted?: boolean;
  tFinished?: boolean;
  ranking?: { id: string; name: string }[]; // best first, when finished
  nextBlindsAt?: number; // Unix ms of the next blind level (blinds that climb)
  runItN?: number;
  blindLevelSecs?: number;
  rules?: TableRules;
  ante?: number; // ante of the current hand
  level?: number; // current blind level (1-based) when the blinds climb
  runVote?: RunVote; // all-in: the players involved are choosing how many boards
  rabbit?: string[]; // cards that would have come (rabbit hunting)
  requests?: { id: string; name: string }[]; // waiting for the owner to let them sit
  timeBank?: boolean; // the player on the clock is using their time bank
  ledger?: LedgerLine[]; // session book: buy-ins and stacks
  bomb?: boolean; // this hand is a bomb pot (everyone in, starts on the flop)
  reaction?: Reaction; // the last table gesture
};

// A gesture a seated player makes at the table (the figure acts it out).
export const REACTIONS = ["hat", "tap", "puff", "laugh", "glare"] as const;
export type ReactionKind = (typeof REACTIONS)[number];
export type Reaction = { seatId: string; kind: ReactionKind; ts: number };
// One gesture per player every this many ms (each one is a room write).
export const REACTION_GAP_MS = 2_500;

// Document shapes in Firestore.
export type OnlineRoomDoc = {
  code: string;
  state: PublicState;
  updatedAt: number;
  // Lobby listing helpers (single-field queries, no composite index needed).
  open: boolean; // at least one player sitting or queued
  players: number;
  casual: boolean;
};

export type OnlineHoleDoc = {
  ownerUid: string;
  handNum: number;
  cards: string[];
};

export type OnlineHandDoc = {
  handNum: number;
  ts: number;
  pot: number;
  community: string[];
  winners: GameWinner[];
  reveals: Record<string, string[]>;
  categories: Record<string, number>;
  dealtIds: string[];
  seatNames: Record<string, string>;
  runs: RunResult[];
  // Stats inputs (server-side player stats): who put money in voluntarily
  // preflop, who raised preflop, who saw the flop. Missing on old records.
  vpip?: string[];
  pfr?: string[];
  sawFlop?: string[];
  bomb?: boolean;
};

// playerStats/{uid}: running totals across online hands (server writes only).
export type PlayerStatsDoc = {
  hands: number;
  vpip: number;
  pfr: number;
  sawFlop: number;
  showdowns: number;
  showdownsWon: number;
  potsWon: number;
  chipsWon: number;
  biggestPot: number;
  updatedAt: number;
};

export type OnlineConfigInput = {
  sb?: number;
  bb?: number;
  stack?: number;
  runItN?: number;
  blindLevelSecs?: number;
  casual?: boolean;
  tournament?: boolean;
  rules?: Partial<TableRules>;
  ambience?: Partial<Ambience>;
};

export type OnlineAction =
  | "create"
  | "sit"
  | "leave"
  | "start"
  | "act"
  | "tick"
  | "config"
  | "pause"
  | "resume"
  | "rebuy"
  | "vote"
  | "away"
  | "approve"
  | "deny"
  | "kick"
  | "show"
  | "react"
  | "back";

// Presence heartbeat cadence. A seated player whose heartbeat is older than
// PRESENCE_STALE_MS is considered gone: the server stands them up (cashing out
// their stack) at the next deal or when their turn times out.
export const PRESENCE_HEARTBEAT_MS = 25_000;
export const PRESENCE_STALE_MS = 75_000;
// A player who lost their connection keeps the seat (skipped, never dealt in)
// for this long before the table stands them up and cashes them out.
export const PRESENCE_GONE_MS = 5 * 60_000;
export const TURN_MS = 30_000;
// How long the players in an all-in have to choose how many boards to run.
export const RUN_VOTE_MS = 12_000;
// Pause after a hand before the next one is dealt automatically (longer when
// the hands were shown or the board ran out all-in; see engine nextHandDelay).
export const NEXT_HAND_MS = 4_500;
export const MAX_SEATED = 9;
