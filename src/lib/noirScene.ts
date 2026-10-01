// Pure adapter: online PublicState -> snapshot for the 3D scene in remote
// mode (public/noir/scene.html?mode=remote). The scene is a dumb renderer: it
// diffs consecutive snapshots and animates (deal, chips, board, all-in,
// winners). NO game rules here or there; everything is read from the
// authoritative public state plus the viewer's own hole cards.
//
// Seating: the scene has 9 fixed chairs. The viewer always sits in chair 0
// (front, closest to the camera); the others are spread evenly around the
// table in engine order, so a 4-handed table does not bunch up on one side.
import { cardFromId } from "./poker";
import { describeHand } from "./handLabel";
import { cachedEquity } from "./equity";
import { castFromSeed, type CastId } from "./noirCast";
import type { PublicState } from "./online/protocol";

export const SCENE_CHAIRS = 9;

export type SceneSeat = {
  id: string;
  name: string;
  cast: CastId;
  stack: number;
  bet: number;
  status: "active" | "folded" | "all-in" | "out";
  /** Card ids when known (own hand, showdown), "backs" when dealt face down. */
  cards: string[] | "backs" | null;
  pos: string;
  me: boolean;
  away: boolean;
  /** Spanish hand description, only for cards that are face up at showdown. */
  hand?: string;
  /**
   * All-in runout with every hand face up: win chance (0..100) keyed by how
   * many board cards are out (0, 3, 4), so the scene can show the number
   * that matches the card it just turned.
   */
  eq?: Record<number, number>;
};

export type SceneAction = { chair: number; text: string; kind: string; ts: number };

export type SceneReaction = { chair: number; kind: string; ts: number };

export type SceneSnapshot = {
  hand: number;
  phase: string;
  board: string[];
  /** Chips already in the middle (the pot minus the bets still in front of players). */
  pot: number;
  seats: (SceneSeat | null)[];
  dealer: number;
  turn: number;
  deadline: number;
  winners: { chair: number; amount: number }[];
  last: SceneAction | null;
  /** Everyone left is all-in: the runout is dealt slowly with the hands face up. */
  allin: boolean;
  paused: boolean;
  /** Bomb pot: everyone antes and the hand starts on the flop. */
  bomb: boolean;
  /** The last table gesture (the scene plays each ts once). */
  reaction: SceneReaction | null;
};

const POS_AFTER_BB = ["UTG", "UTG+1", "MP", "LJ", "HJ", "CO"];

/** Chair for the seat at engine index k, with the viewer's seat at chair 0. */
export function chairFor(k: number, n: number, mine: number): number {
  if (n <= 0) return 0;
  const rel = (k - Math.max(0, mine) + n) % n;
  return Math.round((rel * SCENE_CHAIRS) / n) % SCENE_CHAIRS;
}

/** Position names from the button, for n players in engine order. */
export function positionNames(n: number, dealerIdx: number): string[] {
  const out = new Array<string>(n).fill("");
  if (n < 2 || dealerIdx < 0) return out;
  const names = n === 2 ? ["BTN", "BB"] : ["BTN", "SB", "BB", ...POS_AFTER_BB.slice(POS_AFTER_BB.length - (n - 3))];
  for (let j = 0; j < n; j++) out[(dealerIdx + j) % n] = names[j] ?? "";
  return out;
}

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export function actionText(action: string, amount?: number): { text: string; kind: string } {
  const a = amount ? ` ${fmt(amount)}` : "";
  switch (action) {
    case "fold":
      return { text: "Se retira", kind: "fold" };
    case "check":
      return { text: "Pasa", kind: "check" };
    case "call":
      return { text: "Iguala", kind: "call" };
    case "bet":
      return { text: `Apuesta${a}`, kind: "bet" };
    case "raise":
      return { text: `Sube a${a}`, kind: "raise" };
    case "all-in":
      return { text: "All-in", kind: "allin" };
    default:
      return { text: "", kind: "" };
  }
}

function describe(ids: string[], board: string[]): string | undefined {
  const cards = [...ids, ...board].map(cardFromId).filter((c): c is NonNullable<typeof c> => !!c);
  return cards.length >= 5 ? describeHand(cards) : undefined;
}

export function toSceneSnapshot(
  state: PublicState | null,
  hole: string[] | null,
  uid: string | null,
  presence: Record<string, boolean> = {},
): SceneSnapshot {
  const empty: SceneSnapshot = {
    hand: 0,
    phase: "idle",
    board: [],
    pot: 0,
    seats: new Array(SCENE_CHAIRS).fill(null),
    dealer: -1,
    turn: -1,
    deadline: 0,
    winners: [],
    last: null,
    allin: false,
    paused: false,
    bomb: false,
    reaction: null,
  };
  if (!state) return empty;

  const seats = state.seats.slice(0, SCENE_CHAIRS);
  const n = seats.length;
  const mine = uid ? seats.findIndex((s) => s.id === uid) : -1;
  const chairOf = new Map<string, number>();
  seats.forEach((s, k) => chairOf.set(s.id, chairFor(k, n, mine)));

  const live = state.phase !== "idle";
  const showdown = state.phase === "showdown";
  const dealerIdx = state.dealer ? seats.findIndex((s) => s.id === state.dealer) : -1;
  const pos = live ? positionNames(n, dealerIdx) : new Array<string>(n).fill("");

  const out: (SceneSeat | null)[] = new Array(SCENE_CHAIRS).fill(null);
  let bets = 0;
  seats.forEach((s, k) => {
    const me = s.id === uid;
    const reveal = state.reveals?.[s.id];
    let cards: SceneSeat["cards"] = null;
    if (live && s.hasCards) {
      if (me && hole && hole.length === 2) cards = hole.slice();
      else if (reveal && reveal.length === 2) cards = reveal.slice();
      else cards = "backs";
    }
    const status = (["active", "folded", "all-in", "out"].includes(s.status) ? s.status : "active") as SceneSeat["status"];
    bets += s.bet;
    out[chairOf.get(s.id)!] = {
      id: s.id,
      name: s.name,
      cast: castFromSeed(s.seed ?? s.id),
      stack: s.chips,
      bet: s.bet,
      status,
      cards,
      pos: s.straddle ? "STR" : pos[k],
      me,
      away: presence[s.id] === false || !!s.away || !!s.gone,
      hand: showdown && Array.isArray(cards) && reveal ? describe(cards, state.board) : undefined,
    };
  });

  // All-in runout: two or more players still hold cards and at most one of
  // them can still bet.
  const holding = seats.filter((s) => s.hasCards && s.status !== "folded");
  const canBet = holding.filter((s) => s.status === "active");
  const allin = live && holding.length >= 2 && canBet.length <= 1 && (showdown ? state.board.length > 0 : true);

  // Win chances, only once every hand still in is public: the whole table
  // sees the same number, so it reveals nothing the cards do not.
  if (allin) {
    const hands: Record<string, string[]> = {};
    for (const s of holding) {
      const r = state.reveals?.[s.id];
      if (r && r.length === 2) hands[s.id] = r;
    }
    if (Object.keys(hands).length === holding.length) {
      const stages = [0, 3, 4].filter((k) => k <= state.board.length);
      for (const k of stages) {
        const eq = cachedEquity(hands, state.board.slice(0, k));
        for (const id of Object.keys(eq)) {
          const seat = out[chairOf.get(id)!];
          if (seat) seat.eq = { ...seat.eq, [k]: eq[id] };
        }
      }
    }
  }

  const la = state.lastAction;
  const last =
    live && la && chairOf.has(la.seatId)
      ? { chair: chairOf.get(la.seatId)!, ts: la.ts, ...actionText(la.action, la.amount) }
      : null;

  return {
    hand: state.handNum,
    phase: state.phase,
    board: live ? state.board.slice() : [],
    pot: Math.max(0, (state.pot ?? 0) - bets),
    seats: out,
    dealer: dealerIdx >= 0 ? chairOf.get(seats[dealerIdx].id)! : -1,
    turn: live && state.toAct && chairOf.has(state.toAct) && !state.paused ? chairOf.get(state.toAct)! : -1,
    deadline: state.deadline ?? 0,
    winners: showdown
      ? (state.winners ?? []).filter((w) => chairOf.has(w.id)).map((w) => ({ chair: chairOf.get(w.id)!, amount: w.amount }))
      : [],
    last,
    allin,
    paused: !!state.paused,
    bomb: live && !!state.bomb,
    reaction:
      state.reaction && chairOf.has(state.reaction.seatId)
        ? { chair: chairOf.get(state.reaction.seatId)!, kind: state.reaction.kind, ts: state.reaction.ts }
        : null,
  };
}
