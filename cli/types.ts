// Wire types of the online mode, shared with the web client so the terminal
// and the browser read the exact same public state.
export type { PublicSeat, GameWinner, PublicState } from "../src/lib/online/protocol";

export type ConnStatus = "connecting" | "connected" | "reconnecting" | "error";
