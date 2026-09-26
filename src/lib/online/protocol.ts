// Wire contract of the server-backed online mode. The authoritative engine
// (src/lib/online/engine.ts) runs inside the Next.js API route /api/online and
// publishes a PublicState to Firestore onlineRooms/{code}; every client
// subscribes to it. Private hole cards go to onlineRooms/{code}/holes/{uid},
// readable only by their owner (firestore.rules). The deck and opponents'
// holes never leave the server (they live in onlineRooms/{code}/private/engine,
// closed to clients).

export type PublicSeat = {
  id: string;
  name: string;
  seed?: string; // avatar seed (from the player's profile)
  chips: number;
  bet: number;
  totalBet?: number; // committed across the whole hand
  status: string; // "active" | "folded" | "all-in" | "out"
  hasCards: boolean;
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
  runItN?: number;
  blindLevelSecs?: number;
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
  | "rebuy";

// Presence heartbeat cadence. A seated player whose heartbeat is older than
// PRESENCE_STALE_MS is considered gone: the server stands them up (cashing out
// their stack) at the next deal or when their turn times out.
export const PRESENCE_HEARTBEAT_MS = 25_000;
export const PRESENCE_STALE_MS = 75_000;
export const TURN_MS = 30_000;
export const MAX_SEATED = 9;
