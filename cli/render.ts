// Composes the full terminal frame from the current view model.
// Pure: takes state in, returns the string to print. The main loop owns state.

import { cardFromId } from "../src/lib/poker";
import { describeHand } from "../src/lib/handLabel";
import type { Card } from "../src/lib/poker";
import type { PublicState, ConnStatus } from "./types";
import { bigCardsRow, backsRow, smallCards } from "./cards";
import { color, accent, padEndVisible } from "./ansi";
import {
  legalActions,
  isMyTurn,
  isIdle,
  phaseLabel,
  mySeat,
  currentBet,
} from "./logic";

export type View = {
  state: PublicState | null;
  hole: string[] | null;
  myId: string;
  myName: string;
  conn: ConnStatus;
  message: string;
};

function toCards(ids: string[]): Card[] {
  return ids.map(cardFromId).filter((c): c is Card => c !== null);
}

function nameOf(state: PublicState, id: string): string {
  const s = state.seats.find((x) => x.id === id);
  return s?.name || id.slice(0, 6);
}

function connBadge(conn: ConnStatus): string {
  switch (conn) {
    case "connected":
      return color.green("● conectado");
    case "connecting":
      return color.yellow("◌ conectando…");
    case "reconnecting":
      return color.yellow("◌ reconectando…");
    case "error":
      return color.red("● sin conexión");
  }
}

function statusTag(status: string): string {
  switch (status) {
    case "folded":
      return color.gray("retirado");
    case "all-in":
      return accent("ALL-IN");
    case "out":
      return color.gray("fuera");
    default:
      return "";
  }
}

export function renderFrame(v: View): string {
  const { state, hole, myId, conn } = v;
  const L: string[] = [];
  const pad = "  ";

  // Header
  const title = accent("♠♥ POKER") + color.gray(" · TERMINAL");
  L.push("");
  L.push(pad + padEndVisible(title, 48) + connBadge(conn));
  if (state) {
    L.push(
      pad +
        color.gray(
          `Mano #${state.handNum}  ·  ${phaseLabel(state.phase)}  ·  Bote ${state.pot}`,
        ),
    );
  } else {
    L.push(pad + color.gray("Conectando a la mesa…"));
  }
  L.push("");

  if (!state) {
    L.push(pad + color.dim("Esperando estado del servidor."));
    L.push("");
    L.push(divider());
    L.push(pad + color.gray("[Q] salir"));
    return L.join("\n");
  }

  // Board / felt
  L.push(pad + color.bold("Mesa"));
  if (state.board.length > 0) {
    L.push(bigCardsRow(state.board, pad));
  } else if (isIdle(state)) {
    L.push(pad + color.dim("sin mano en juego"));
  } else {
    L.push(backsRow(3, pad));
    L.push(pad + color.dim("esperando flop"));
  }
  L.push("");

  // Winners banner (showdown)
  if (state.winners && state.winners.length > 0) {
    const parts = state.winners.map((w) => {
      let label = `${nameOf(state, w.id)} +${w.amount}`;
      const rev = state.reveals?.[w.id];
      if (rev) label += color.gray(` (${describeHand(toCards([...rev, ...state.board]))})`);
      return label;
    });
    L.push(pad + color.bgGreen(color.bold(" GANA ")) + " " + color.green(parts.join("  ·  ")));
    L.push("");
  }

  // Seats
  L.push(pad + color.bold("Jugadores"));
  const cur = currentBet(state);
  for (const s of state.seats) {
    const isTurn = state.toAct === s.id;
    const isMe = s.id === myId;
    const arrow = isTurn ? accent("→ ") : "  ";
    let name = s.name || s.id.slice(0, 6);
    if (isMe) name += " (tú)";
    name = isMe ? color.bold(name) : name;
    if (s.status === "folded") name = color.gray(name);

    const chips = color.yellow(`$${s.chips}`);
    const segs: string[] = [];
    if (s.bet > 0) segs.push(color.cyan(`apuesta ${s.bet}`));
    const tag = statusTag(s.status);
    if (tag) segs.push(tag);
    if (isTurn) segs.push(accent("‹ su turno"));
    const rev = state.reveals?.[s.id];
    if (rev) segs.push(smallCards(rev));

    L.push(
      pad +
        arrow +
        padEndVisible(name, 18) +
        padEndVisible(chips, 8) +
        segs.join("  "),
    );
  }
  L.push("");

  // Your hole
  L.push(pad + color.bold("Tu mano"));
  if (hole && hole.length > 0) {
    L.push(bigCardsRow(hole, pad));
    const cards = toCards([...hole, ...(state.board ?? [])]);
    if (cards.length >= 2) {
      L.push(pad + accent("» " + describeHand(cards)));
    }
  } else {
    L.push(pad + color.dim("— sin cartas (espera a que se reparta una mano)"));
  }
  L.push("");

  // Action bar
  L.push(divider());
  L.push(pad + actionBar(v));
  if (v.message) L.push(pad + v.message);
  L.push(pad + color.gray(footerHint(v)));
  return L.join("\n");
}

function divider(): string {
  return "  " + color.gray("─".repeat(54));
}

function actionBar(v: View): string {
  const { state, myId } = v;
  if (!state) return "";
  const me = mySeat(state, myId);

  if (isIdle(state)) {
    const n = state.seats.length;
    const hint =
      n >= 2
        ? color.dim("(2+ jugadores conectados — listo)")
        : color.yellow("(se necesitan 2+ jugadores conectados)");
    return key("D") + " repartir mano   " + hint;
  }

  if (!isMyTurn(state, myId)) {
    const who = state.toAct ? nameOf(state, state.toAct) : "—";
    if (me && me.status === "folded") return color.gray(`te retiraste · esperando a ${who}…`);
    return color.dim(`esperando a ${who}…`);
  }

  const legal = legalActions(state, myId);
  if (!legal) return color.dim("…");
  const items: string[] = [];
  items.push(key("F") + " retirar");
  if (legal.check) items.push(key("K") + " pasar");
  if (legal.call) items.push(key("C") + ` igualar ${legal.callAmount}`);
  if (legal.raise) {
    const verb = legal.raiseVerb === "bet" ? "apostar" : "subir";
    items.push(key("R") + ` ${verb} (mín ${legal.raiseMin})`);
  }
  if (legal.allIn) items.push(key("A") + ` all-in ${legal.allInAmount}`);
  return color.bold(accent("TU TURNO  ")) + items.join("   ");
}

function footerHint(v: View): string {
  const parts = ["[D] repartir", "[Q] salir"];
  return parts.join("   ");
}

function key(k: string): string {
  return accent(`[${k}]`);
}
