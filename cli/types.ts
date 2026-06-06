// Wire protocol types for the authoritative Go game server.
// Mirrors src/hooks/useGameSocket.ts exactly so the terminal client and the
// web client (/play/online) speak the identical protocol against one server.

export type PublicSeat = {
  id: string;
  name: string;
  chips: number;
  bet: number;
  status: string; // "active" | "folded" | "all-in" | "out"
  hasCards: boolean;
};

export type GameWinner = { id: string; amount: number };

export type PublicState = {
  handNum: number;
  phase: string; // "idle" | "preflop" | "flop" | "turn" | "river" | "showdown"
  board: string[];
  pot: number;
  toAct: string; // seat id to act; "" when no active betting
  seats: PublicSeat[];
  winners?: GameWinner[];
  reveals?: Record<string, string[]>; // seatId -> 2 card ids, only at contested showdown
};

// Inbound frames: { type: "state", payload: PublicState } | { type: "hole", payload: { cards } }
// Outbound frames: { type: "start" } | { type: "action", payload: { action, amount } }
export type ServerFrame =
  | { type: "state"; payload: PublicState }
  | { type: "hole"; payload: { cards: string[] } }
  | { type: string; payload?: unknown };

export type ConnStatus = "connecting" | "connected" | "reconnecting" | "error";
