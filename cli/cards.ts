// Card rendering: big ASCII naipes (the approved GUI style) + small inline cards.
// Card ids are RANK+SUIT (e.g. "AS", "TD", "9C") — identical on the Go server,
// the TS client, and src/lib/poker.ts, so we reuse that module's helpers.

import { cardFromId, suitGlyph, suitColor, rankLabel } from "../src/lib/poker";
import { color } from "./ansi";

const CARD_W = 5; // interior width of a card

function paint(suit: "red" | "black", s: string): string {
  return suit === "red" ? color.brightRed(s) : color.brightWhite(s);
}

// Returns the 5 text rows of one big card. Unknown ids render as a blank back.
function bigCardRows(id: string): string[] {
  const c = cardFromId(id);
  if (!c) {
    const fill = "░".repeat(CARD_W);
    return [
      color.gray("┌─────┐"),
      color.gray(`│${fill}│`),
      color.gray(`│${fill}│`),
      color.gray(`│${fill}│`),
      color.gray("└─────┘"),
    ];
  }
  const r = rankLabel(c.rank); // "A".."10"
  const g = suitGlyph(c.suit);
  const sc = suitColor(c.suit);
  const top = r.padEnd(CARD_W);
  const bot = r.padStart(CARD_W);
  const mid = `  ${g}  `; // glyph centered in width 5
  return [
    paint(sc, "┌─────┐"),
    paint(sc, `│${top}│`),
    paint(sc, `│${mid}│`),
    paint(sc, `│${bot}│`),
    paint(sc, "└─────┘"),
  ];
}

// A face-down card (used while waiting). Violet-tinted back.
function backRows(): string[] {
  const b = color.magenta;
  return [
    b("┌─────┐"),
    b("│▚▚▚▚▚│"),
    b("│▚▚▚▚▚│"),
    b("│▚▚▚▚▚│"),
    b("└─────┘"),
  ];
}

// Render a row of big cards as a single multi-line string, indented by `indent`.
export function bigCardsRow(ids: string[], indent = "  "): string {
  if (ids.length === 0) return "";
  const cards = ids.map(bigCardRows);
  const lines: string[] = [];
  for (let row = 0; row < 5; row++) {
    lines.push(indent + cards.map((c) => c[row]).join(" "));
  }
  return lines.join("\n");
}

// Render N face-down backs (e.g. board placeholders).
export function backsRow(n: number, indent = "  "): string {
  const cards = Array.from({ length: n }, backRows);
  const lines: string[] = [];
  for (let row = 0; row < 5; row++) {
    lines.push(indent + cards.map((c) => c[row]).join(" "));
  }
  return lines.join("\n");
}

// Small inline card like "A♠" (for showdown reveals beside a seat).
export function smallCard(id: string): string {
  const c = cardFromId(id);
  if (!c) return color.gray("??");
  const sc = suitColor(c.suit);
  return paint(sc, `${rankLabel(c.rank)}${suitGlyph(c.suit)}`);
}

export function smallCards(ids: string[]): string {
  return ids.map(smallCard).join(" ");
}
