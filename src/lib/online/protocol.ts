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
};

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
  runs?: RunResult[]; // run-it-N all-in outcomes (N > 1)
  sb: number;
  bb: number;
  startStack: number; // stack (and coin buy-in) granted to new players
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
};

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
  | "kick";

// Presence heartbeat cadence. A seated player whose heartbeat is older than
// PRESENCE_STALE_MS is considered gone: the server stands them up (cashing out
// their stack) at the next deal or when their turn times out.
export const PRESENCE_HEARTBEAT_MS = 25_000;
export const PRESENCE_STALE_MS = 75_000;
export const TURN_MS = 30_000;
// How long the players in an all-in have to choose how many boards to run.
export const RUN_VOTE_MS = 12_000;
// Pause after a hand before the next one is dealt automatically (longer when
// the hands were shown or the board ran out all-in; see engine nextHandDelay).
export const NEXT_HAND_MS = 4_500;
export const MAX_SEATED = 9;
