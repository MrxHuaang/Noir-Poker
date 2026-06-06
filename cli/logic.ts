// Client-side derivation of the legal action set.
// The Go server is authoritative and sends NO legal-action list and NO error
// frame for illegal moves (it silently drops them). To give a good TUI we mirror
// the server's rules (server/internal/game/betting.go) from the public snapshot.
//
// PublicState omits currentBet / minRaise / bigBlind, so we DERIVE them:
//   currentBet = max(seat.bet)      toCall = currentBet - mySeat.bet
//   bigBlind   = 10 (server default, session/manager.go) -> min bet / min raise step
// This can occasionally under-estimate the true min-raise (which grows with the
// last raise size); such a raise is silently rejected, which the UI surfaces as
// "sin cambios" — acceptable for the MVP per the recon plan.

import type { PublicState, PublicSeat } from "./types";

export const BIG_BLIND = 10; // server defaultBB (session/manager.go)

export const BETTING_PHASES = new Set(["preflop", "flop", "turn", "river"]);

export function mySeat(state: PublicState | null, id: string): PublicSeat | null {
  return state?.seats.find((s) => s.id === id) ?? null;
}

export function currentBet(state: PublicState): number {
  return state.seats.reduce((m, s) => Math.max(m, s.bet), 0);
}

export function isMyTurn(state: PublicState | null, id: string): boolean {
  return !!state && state.toAct === id && BETTING_PHASES.has(state.phase);
}

export type Legal = {
  fold: boolean;
  check: boolean;
  call: boolean;
  callAmount: number; // chips needed to call (capped to stack)
  raise: boolean; // covers bet (no outstanding bet) and raise
  raiseVerb: "bet" | "raise"; // server verb to send
  raiseMin: number; // minimum total bet-to
  raiseMax: number; // your stack + your current bet = max total bet-to
  allIn: boolean;
  allInAmount: number;
};

export function legalActions(state: PublicState, id: string): Legal | null {
  const me = mySeat(state, id);
  if (!me || !isMyTurn(state, id)) return null;
  const cur = currentBet(state);
  const toCall = Math.max(0, cur - me.bet);
  const canCheck = toCall === 0;
  const canCall = toCall > 0 && me.chips > 0;
  // You can bet/raise only if you have chips beyond what a call costs.
  const canRaise = me.chips > toCall;
  const verb: "bet" | "raise" = cur > 0 ? "raise" : "bet";
  const raiseMin = cur > 0 ? cur + BIG_BLIND : BIG_BLIND;
  const raiseMax = me.bet + me.chips; // total bet-to if shoving
  return {
    fold: true,
    check: canCheck,
    call: canCall,
    callAmount: Math.min(toCall, me.chips),
    raise: canRaise,
    raiseVerb: verb,
    raiseMin: Math.min(raiseMin, raiseMax),
    raiseMax,
    allIn: me.chips > 0,
    allInAmount: me.chips,
  };
}

const PHASE_ES: Record<string, string> = {
  idle: "ESPERANDO",
  preflop: "PREFLOP",
  flop: "FLOP",
  turn: "TURN",
  river: "RIVER",
  showdown: "SHOWDOWN",
};

export function phaseLabel(phase: string): string {
  return PHASE_ES[phase] ?? phase.toUpperCase();
}

export function isIdle(state: PublicState | null): boolean {
  return !state || state.phase === "idle" || state.phase === "showdown";
}
