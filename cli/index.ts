// Poker Terminal — joins the SAME live online game as web users at /play/online.
//
// Talks the authoritative Go server's WebSocket protocol directly (see net.ts).
// A terminal seat and a browser seat at the same room code share one server-side
// table, so they see and play against each other. No Firebase, no betting engine
// runs locally — the server is authoritative; we render its snapshots and act.
//
// Run:  npm run play -- <SALA> [nombre]
//   or  npm run play            (prompts for the room code)

import process from "node:process";
import * as readline from "node:readline";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { GameConnection } from "./net";
import { renderFrame, type View } from "./render";
import { screen, color, accent } from "./ansi";
import { legalActions, isMyTurn } from "./logic";
import type { PublicState, ConnStatus } from "./types";

const DEFAULT_WS = "https://poker-sim-server.onrender.com";
const dim = color.dim;
const warn = color.yellow;

let view: View;
let conn: GameConnection;
let mode: "keys" | "line" = "keys";
let lastHandNum = -1;
let rejectTimer: ReturnType<typeof setTimeout> | null = null;

// ---- identity (stable across runs so reconnects keep the same seat) ----------
function getId(override?: string): string {
  if (override) return override;
  const f = join(homedir(), ".poker-sim-cli-id");
  try {
    if (existsSync(f)) {
      const v = readFileSync(f, "utf8").trim();
      if (v) return v;
    }
  } catch {
    /* fall through to generate */
  }
  const id = randomUUID();
  try {
    writeFileSync(f, id, "utf8");
  } catch {
    /* non-fatal: use the ephemeral id */
  }
  return id;
}

// ---- args --------------------------------------------------------------------
function parseArgs(argv: string[]) {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[k] = next;
        i++;
      } else {
        flags[k] = "true";
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

// ---- rendering ---------------------------------------------------------------
function render(): void {
  process.stdout.write(screen.clear + renderFrame(view) + "\n");
}

function setMsg(s: string): void {
  view.message = s;
}

// ---- server frame handlers ---------------------------------------------------
function onState(s: PublicState): void {
  if (rejectTimer) {
    clearTimeout(rejectTimer);
    rejectTimer = null;
  }
  if (s.handNum !== lastHandNum) {
    lastHandNum = s.handNum;
    view.hole = null; // fresh hand: wait for our private "hole" frame
    if (s.phase !== "showdown") setMsg("");
  }
  view.state = s;
  render();
}

function onHole(cards: string[]): void {
  view.hole = cards;
  render();
}

function onStatus(status: ConnStatus): void {
  view.conn = status;
  render();
}

// ---- actions -----------------------------------------------------------------
function armRejectionCheck(): void {
  if (rejectTimer) clearTimeout(rejectTimer);
  rejectTimer = setTimeout(() => {
    rejectTimer = null;
    if (view.state && isMyTurn(view.state, view.myId)) {
      setMsg(warn("Sin cambios — la acción pudo ser ilegal. Prueba otra."));
      render();
    }
  }, 2500);
}

function sendAction(action: string, amount = 0): void {
  if (!conn.action(action, amount)) {
    setMsg(warn("Aún conectando…"));
    render();
    return;
  }
  setMsg(accent(`→ ${action}${amount ? ` ${amount}` : ""}`));
  armRejectionCheck();
  render();
}

function quickAction(kind: "fold" | "check" | "callOrCheck" | "allIn"): void {
  const st = view.state;
  if (!st || !isMyTurn(st, view.myId)) {
    setMsg(dim("No es tu turno."));
    render();
    return;
  }
  const legal = legalActions(st, view.myId);
  if (!legal) return;
  switch (kind) {
    case "fold":
      sendAction("fold");
      break;
    case "check":
      if (legal.check) sendAction("check");
      else setMsg(warn("Hay una apuesta: usa [C] igualar o [R] subir."));
      break;
    case "callOrCheck":
      if (legal.call) sendAction("call", legal.callAmount);
      else if (legal.check) sendAction("check");
      else setMsg(dim("Nada que igualar."));
      break;
    case "allIn":
      if (legal.allIn) sendAction("all-in");
      break;
  }
  if (view.message && !view.message.startsWith("→")) render();
}

function raiseFlow(): void {
  const st = view.state;
  if (!st || !isMyTurn(st, view.myId)) {
    setMsg(dim("No es tu turno."));
    render();
    return;
  }
  const legal = legalActions(st, view.myId);
  if (!legal || !legal.raise) {
    setMsg(dim("No puedes subir ahora."));
    render();
    return;
  }
  const verb = legal.raiseVerb === "bet" ? "apostar" : "subir";
  enterLineMode();
  process.stdout.write(
    "\n" +
      accent(`  ${verb}: monto total`) +
      dim(` (mín ${legal.raiseMin}, máx ${legal.raiseMax}, Enter = ${legal.raiseMin})`) +
      "\n",
  );
  askLine("  > ").then((ans) => {
    exitLineMode();
    const raw = ans.trim();
    const amt = raw === "" ? legal.raiseMin : Number(raw);
    if (!Number.isFinite(amt) || amt <= 0) {
      setMsg(warn("Monto inválido."));
      render();
      return;
    }
    const clamped = Math.max(legal.raiseMin, Math.min(Math.floor(amt), legal.raiseMax));
    conn.action(legal.raiseVerb, clamped);
    setMsg(accent(`→ ${legal.raiseVerb} ${clamped}`));
    armRejectionCheck();
    render();
  });
}

function startHand(): void {
  if (!conn.start()) {
    setMsg(warn("Aún conectando…"));
  } else {
    setMsg(dim("Repartiendo… (se necesitan 2+ jugadores conectados)"));
  }
  render();
}

// ---- input -------------------------------------------------------------------
function onKeypress(str: string, key: readline.Key): void {
  if (mode !== "keys") return;
  if (key && key.ctrl && key.name === "c") return quit();
  const name = (key?.name || str || "").toLowerCase();
  switch (name) {
    case "q":
      return quit();
    case "d":
    case "s":
      return startHand();
    case "f":
      return quickAction("fold");
    case "k":
      return quickAction("check");
    case "c":
      return quickAction("callOrCheck");
    case "r":
      return raiseFlow();
    case "a":
      return quickAction("allIn");
  }
}

function setupInput(): void {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("keypress", onKeypress);
}

function enterLineMode(): void {
  mode = "line";
  process.stdin.removeListener("keypress", onKeypress);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
}

function exitLineMode(): void {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on("keypress", onKeypress);
  mode = "keys";
}

function askLine(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    });
  });
}

function quit(): void {
  try {
    conn?.close();
  } catch {
    /* ignore */
  }
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  } catch {
    /* ignore */
  }
  process.stdout.write(screen.showCursor + "\n  " + dim("Hasta luego.") + "\n\n");
  process.exit(0);
}

// ---- startup -----------------------------------------------------------------
function intro(wsBase: string, room: string): void {
  process.stdout.write(screen.clear);
  process.stdout.write("\n  " + accent("♠ ♥ ♦ ♣  POKER TERMINAL") + "\n");
  process.stdout.write(
    "  " +
      dim(`Servidor: ${wsBase}`) +
      "\n  " +
      dim(`Comparte el código `) +
      color.bold(room) +
      dim(`: en la web abre `) +
      color.cyan(`/play/online/${room}`) +
      "\n\n",
  );
  process.stdout.write(
    "  " +
      dim("Teclas:  ") +
      "[D] repartir  [F] retirar  [K] pasar  [C] igualar  [R] subir  [A] all-in  [Q] salir\n\n",
  );
}

async function main(): Promise<void> {
  if (typeof WebSocket === "undefined") {
    console.error(
      "Este cliente necesita Node 21+ (WebSocket global). Tu versión: " + process.version,
    );
    process.exit(1);
  }

  const { flags, positional } = parseArgs(process.argv.slice(2));
  const wsBase =
    flags.server ||
    process.env.GAME_WS_URL ||
    process.env.NEXT_PUBLIC_GAME_WS_URL ||
    DEFAULT_WS;

  process.stdout.write(screen.clear);
  process.stdout.write("\n  " + accent("♠ ♥ ♦ ♣  POKER TERMINAL") + "\n\n");

  let room = (flags.room || positional[0] || "").toUpperCase();
  if (!room) {
    room = (await askLine("  Código de sala (ej. ABCDE): ")).trim().toUpperCase();
  }
  if (!room) {
    console.log("  Necesitas un código de sala. Saliendo.");
    process.exit(1);
  }

  let name = flags.name || positional[1] || "";
  if (!name) {
    name = ((await askLine("  Tu nombre [Terminal]: ")).trim()) || "Terminal";
  }

  const myId = getId(flags.id);
  view = { state: null, hole: null, myId, myName: name, conn: "connecting", message: "" };

  intro(wsBase, room);

  conn = new GameConnection(wsBase, room, myId, name, { onState, onHole, onStatus });
  setupInput();
  process.stdout.write(screen.hideCursor);
  conn.connect();
  render();
}

process.on("SIGINT", quit);
process.on("exit", () => {
  process.stdout.write(screen.showCursor);
});

main().catch((err) => {
  process.stdout.write(screen.showCursor + "\n");
  console.error(err);
  process.exit(1);
});
