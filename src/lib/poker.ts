export type Suit = "S" | "H" | "D" | "C";
export type Rank =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "T" | "J" | "Q" | "K" | "A";

export type Card = { rank: Rank; suit: Suit; id: string };

export type Player = {
  id: string;
  name: string;
  seed: string;
  createdAt: number;
};

export type Street = "preflop" | "flop" | "turn" | "river";

export type Seat = {
  player: Player;
  hole: [Card, Card];
  revealedCards: [boolean, boolean];
  folded: boolean;
};

export type GameState = {
  seats: Seat[];
  community: Card[];
  burns: Card[];
  deck: Card[];
  street: Street;
  dealId: string;
};

const RANKS: Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9",
  "T", "J", "Q", "K", "A",
];
const SUITS: Suit[] = ["S", "H", "D", "C"];

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ rank: r, suit: s, id: `${r}${s}` });
    }
  }
  return deck;
}

// Parse a card id like "AS" / "TD" back into a Card. Returns null if malformed.
// Used to rebuild stored community cards (string ids) for the hand replayer.
export function cardFromId(id: string): Card | null {
  if (typeof id !== "string" || id.length < 2) return null;
  const suit = id.slice(-1) as Suit;
  const rank = id.slice(0, -1) as Rank;
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) return null;
  return { rank, suit, id };
}

export function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  const rand = new Uint32Array(1);
  for (let i = out.length - 1; i > 0; i--) {
    // Rejection sampling eliminates modulo bias: discard values in the
    // remainder region [max, 2^32) so each index in [0, range) is equally likely.
    const range = i + 1;
    const max = Math.floor(0x100000000 / range) * range;
    do { crypto.getRandomValues(rand); } while (rand[0] >= max);
    const j = rand[0] % range;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function deal(players: Player[]): GameState {
  if (players.length < 2 || players.length > 9) {
    throw new Error("players must be 2..9");
  }
  const deck = shuffle(makeDeck());
  const seats: Seat[] = players.map((p) => ({
    player: p,
    hole: [deck.shift()!, deck.shift()!],
    revealedCards: [false, false],
    folded: false,
  }));
  return {
    seats,
    community: [],
    burns: [],
    deck,
    street: "preflop",
    dealId: crypto.randomUUID(),
  };
}

export function advance(state: GameState): GameState {
  const deck = state.deck.slice();
  const burns = state.burns.slice();
  const community = state.community.slice();
  let street: Street = state.street;

  if (state.street === "preflop") {
    burns.push(deck.shift()!);
    community.push(deck.shift()!, deck.shift()!, deck.shift()!);
    street = "flop";
  } else if (state.street === "flop") {
    burns.push(deck.shift()!);
    community.push(deck.shift()!);
    street = "turn";
  } else if (state.street === "turn") {
    burns.push(deck.shift()!);
    community.push(deck.shift()!);
    street = "river";
  }
  return { ...state, deck, burns, community, street };
}

export function suitGlyph(s: Suit): string {
  return s === "S" ? "♠" : s === "H" ? "♥" : s === "D" ? "♦" : "♣";
}

export function suitColor(s: Suit): "red" | "black" {
  return s === "H" || s === "D" ? "red" : "black";
}

export function rankLabel(r: Rank): string {
  return r === "T" ? "10" : r;
}
