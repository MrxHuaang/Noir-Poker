// Server side of the online mode (Admin SDK, Node runtime). Every request runs
// ONE Firestore transaction: load the engine state, apply the move with the
// pure engine, settle the wallet for any stack that left the table, and write
// the new public state + private holes. There is no long-lived game server:
// the room lives in Firestore and each API call is a stateless function.
//
// Documents:
//   onlineRooms/{code}                 public state (every signed-in client)
//   onlineRooms/{code}/private/engine  full engine state incl. deck (server only)
//   onlineRooms/{code}/holes/{uid}     that player's hole cards (owner only)
//   onlineRooms/{code}/presence/{uid}  heartbeats written by the clients
//   onlineRooms/{code}/hands/{n}       authoritative hand records (XP source)
//   roomLedgers/online-{code}          zero-sum ledger of the room's coins
//
// The coin economy is settled inside the same transaction as the game move:
// sitting down escrows the buy-in, standing up (or being pruned for a stale
// heartbeat) credits the final stack. The credit is capped by the room ledger
// so the table can never mint coins.
import "server-only";
import { CAST, castFromSeed } from "@/lib/noirCast";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../firebaseAdmin";
import { cappedCredit } from "../economy";
import * as E from "./engine";
import { OnlineError, type EngineState, type Payout } from "./engine";
import {
  PRESENCE_STALE_MS,
  type OnlineConfigInput,
  type OnlineRoomDoc,
} from "./protocol";

const ROOMS = "onlineRooms";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[A-Z0-9]{4,8}$/;

// Key of the online escrow in users/{uid}.escrows and of the room ledger.
// Prefixed so an online room can never collide with a normal-mode room code.
export function onlineEscrowKey(code: string): string {
  return `online-${code}`;
}

export function normalizeCode(raw: unknown): string {
  const code = String(raw ?? "").trim().toUpperCase();
  if (!CODE_RE.test(code)) throw new OnlineError("Codigo de sala invalido");
  return code;
}

function refs(code: string) {
  const db = adminDb();
  const room = db.collection(ROOMS).doc(code);
  return {
    room,
    engine: room.collection("private").doc("engine"),
    holes: room.collection("holes"),
    presence: room.collection("presence"),
    hands: room.collection("hands"),
    ledger: db.collection("roomLedgers").doc(onlineEscrowKey(code)),
  };
}

function userRef(uid: string) {
  return adminDb().collection("users").doc(uid);
}

type Wallet = {
  coins: number;
  escrows: Record<string, number>;
  escrowModes: Record<string, string>;
  nickname?: string;
  displayName?: string;
  avatarSeed?: string;
};

function readWallet(data: FirebaseFirestore.DocumentData | undefined): Wallet | null {
  if (!data) return null;
  return {
    coins: Math.max(0, Math.floor(Number(data.coins ?? 0))),
    escrows: { ...((data.escrows as Record<string, number>) ?? {}) },
    escrowModes: { ...((data.escrowModes as Record<string, string>) ?? {}) },
    nickname: data.nickname as string | undefined,
    displayName: data.displayName as string | undefined,
    avatarSeed: data.avatarSeed as string | undefined,
  };
}

function plain<T>(v: T): T {
  // Firestore rejects `undefined`; JSON round-trip drops it.
  return JSON.parse(JSON.stringify(v)) as T;
}

function roomDoc(st: EngineState, now: number): OnlineRoomDoc {
  const players = Object.keys(st.players).length;
  return plain({
    code: st.code,
    state: E.publicView(st),
    updatedAt: now,
    open: players > 0,
    players,
    casual: st.casual,
  });
}

async function isRealAccount(uid: string): Promise<boolean> {
  const rec = await adminAuth().getUser(uid);
  return (rec.providerData?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Transaction runner
// ---------------------------------------------------------------------------

type Debit = { uid: string; amount: number };

type StepResult<R> = {
  result: R;
  changed: boolean;
  debit?: Debit;
  presenceFor?: string; // write a fresh heartbeat for this uid
};

type Step<R> = (
  st: EngineState,
  ctx: { tx: Transaction; now: number; wallets: Map<string, Wallet | null> },
) => Promise<StepResult<R>>;

async function readWallets(
  tx: Transaction,
  uids: string[],
  cache: Map<string, Wallet | null>,
): Promise<void> {
  const missing = uids.filter((u) => !cache.has(u));
  if (missing.length === 0) return;
  const snaps = await Promise.all(missing.map((u) => tx.get(userRef(u))));
  snaps.forEach((s, i) => cache.set(missing[i], readWallet(s.exists ? s.data() : undefined)));
}

async function runRoom<R>(
  code: string,
  step: Step<R>,
): Promise<{ result: R; payouts: Payout[]; state: EngineState }> {
  const r = refs(code);
  const now = Date.now();
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(r.engine);
    if (!snap.exists) throw new OnlineError("La sala no existe", 404);
    const st = JSON.parse(String(snap.data()!.json)) as EngineState;
    const before = { phase: st.phase, handNum: st.handNum };
    const wallets = new Map<string, Wallet | null>();

    const out = await step(st, { tx, now, wallets });
    const payouts = st.payouts;
    st.payouts = [];
    if (!out.changed && payouts.length === 0) {
      return { result: out.result, payouts: [], state: st };
    }

    // Wallet reads (all reads must precede the first write).
    const coinPayouts = payouts.filter((p) => p.coins);
    const walletUids = [
      ...coinPayouts.map((p) => p.uid),
      ...(out.debit ? [out.debit.uid] : []),
    ];
    await readWallets(tx, walletUids, wallets);
    const needLedger = coinPayouts.length > 0 || !!out.debit;
    const ledgerSnap = needLedger ? await tx.get(r.ledger) : null;
    const ledger = {
      totalIn: Math.max(0, Math.floor(Number(ledgerSnap?.data()?.totalIn ?? 0))),
      totalOut: Math.max(0, Math.floor(Number(ledgerSnap?.data()?.totalOut ?? 0))),
    };
    const key = onlineEscrowKey(code);
    const touched = new Set<string>();

    if (out.debit) {
      const w = wallets.get(out.debit.uid);
      if (!w) throw new OnlineError("Perfil inexistente");
      if (w.coins < out.debit.amount) throw new OnlineError("Saldo insuficiente");
      w.coins -= out.debit.amount;
      w.escrows[key] = (w.escrows[key] ?? 0) + out.debit.amount;
      w.escrowModes[key] = "online";
      ledger.totalIn += out.debit.amount;
      touched.add(out.debit.uid);
    }
    for (const p of coinPayouts) {
      const w = wallets.get(p.uid);
      if (!w) continue;
      const credit = cappedCredit(p.amount, ledger.totalIn, ledger.totalOut);
      ledger.totalOut += credit;
      w.coins += credit;
      delete w.escrows[key];
      delete w.escrowModes[key];
      touched.add(p.uid);
    }

    // Writes.
    tx.set(r.engine, { json: JSON.stringify(st), updatedAt: now });
    tx.set(r.room, roomDoc(st, now));
    if (st.handNum !== before.handNum) {
      for (const [id, cards] of Object.entries(st.holes)) {
        tx.set(r.holes.doc(id), { ownerUid: id, handNum: st.handNum, cards });
      }
    }
    const settled =
      st.phase === "showdown" &&
      (before.phase !== "showdown" || before.handNum !== st.handNum);
    if (settled) {
      const rec = E.handRecord(st, now);
      if (rec) tx.set(r.hands.doc(String(st.handNum)), plain(rec));
    }
    if (needLedger) {
      tx.set(
        r.ledger,
        out.debit
          ? { ...ledger, contributors: FieldValue.arrayUnion(out.debit.uid) }
          : ledger,
        { merge: true },
      );
    }
    for (const uid of touched) {
      const w = wallets.get(uid)!;
      tx.update(userRef(uid), {
        coins: w.coins,
        escrows: w.escrows,
        escrowModes: w.escrowModes,
      });
    }
    if (out.presenceFor) {
      tx.set(r.presence.doc(out.presenceFor), {
        uid: out.presenceFor,
        at: new Date(now),
      });
    }
    return { result: out.result, payouts, state: st };
  });
}

// Uids whose heartbeat is missing or older than PRESENCE_STALE_MS.
async function stalePlayers(
  tx: Transaction,
  code: string,
  st: EngineState,
  now: number,
  only?: string[],
): Promise<Set<string>> {
  const ids = only ?? Object.keys(st.players);
  const r = refs(code);
  const snaps = await Promise.all(ids.map((id) => tx.get(r.presence.doc(id))));
  const stale = new Set<string>();
  snaps.forEach((s, i) => {
    const at = s.exists ? (s.data()!.at as { toMillis?: () => number } | undefined) : undefined;
    const ms = at && typeof at.toMillis === "function" ? at.toMillis() : 0;
    if (now - ms > PRESENCE_STALE_MS) stale.add(ids[i]);
  });
  return stale;
}

// XP + history for players whose coin stack just left a table. Best-effort,
// outside the transaction (hands are counted server-side from hand records).
async function recordPayoutSessions(code: string, payouts: Payout[]): Promise<void> {
  const coin = payouts.filter((p) => p.coins);
  if (coin.length === 0) return;
  const { recordSession } = await import("../economyServer");
  await Promise.all(
    coin.map((p) =>
      recordSession(p.uid, {
        code,
        roomName: `Online ${code}`,
        handsPlayed: 0,
        handsWon: 0,
        net: p.amount - p.buyIn,
        biggestPot: 0,
        mode: "online",
      }).catch(() => {}),
    ),
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function genCode(): string {
  const a = new Uint32Array(5);
  crypto.getRandomValues(a);
  let c = "";
  for (let i = 0; i < 5; i++) c += CODE_ALPHABET[a[i] % CODE_ALPHABET.length];
  return c;
}

export async function createRoom(uid: string, cfg: OnlineConfigInput): Promise<string> {
  const db = adminDb();
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = genCode();
    const r = refs(code);
    const created = await db.runTransaction(async (tx) => {
      const snap = await tx.get(r.engine);
      if (snap.exists) return false;
      const now = Date.now();
      const st = E.createRoom(code, uid, cfg, now);
      tx.set(r.engine, { json: JSON.stringify(st), updatedAt: now });
      tx.set(r.room, roomDoc(st, now));
      return true;
    });
    if (created) return code;
  }
  throw new OnlineError("No se pudo crear la sala", 500);
}

export async function sit(uid: string, code: string): Promise<E.SitResult> {
  // Guest check outside the transaction (Auth lookup, not a Firestore read).
  const real = await isRealAccount(uid);
  const { result } = await runRoom(code, async (st, { tx, wallets }) => {
    if (st.players[uid]) return { result: "already" as const, changed: false };
    await readWallets(tx, [uid], wallets);
    const w = wallets.get(uid) ?? null;
    let debit: Debit | undefined;
    if (!st.casual) {
      if (!real) throw new OnlineError("Cuenta de invitado");
      if (!w) throw new OnlineError("Perfil inexistente");
      if (w.coins < st.startStack) throw new OnlineError("Saldo insuficiente");
      debit = { uid, amount: st.startStack };
    }
    const seed = w?.avatarSeed || uid;
    // Nameless guests sit under their character's name, so "Jugador" never
    // appears twice at the same table.
    const name = (w?.nickname || w?.displayName || CAST[castFromSeed(seed)].tag).slice(0, 40);
    const res = E.sit(st, uid, name, seed, !st.casual);
    if (res === "requested") debit = undefined;
    return { result: res, changed: true, debit, presenceFor: uid };
  });
  return result;
}

export async function leave(uid: string, code: string): Promise<void> {
  const { payouts } = await runRoom(code, async (st) => {
    if (!st.players[uid]) return { result: null, changed: false };
    E.leave(st, uid, Date.now());
    return { result: null, changed: true };
  });
  await recordPayoutSessions(code, payouts);
}

export async function start(uid: string, code: string): Promise<void> {
  const { payouts } = await runRoom(code, async (st, { tx, now }) => {
    // Stand up everyone whose heartbeat went stale (closed tab, crash) before
    // dealing. The caller is obviously here.
    const stale = await stalePlayers(tx, code, st, now);
    stale.delete(uid);
    for (const id of stale) E.leave(st, id, now);
    E.startHand(st, uid, now);
    return { result: null, changed: true };
  });
  await recordPayoutSessions(code, payouts);
}

export async function act(
  uid: string,
  code: string,
  action: string,
  amount: number,
): Promise<void> {
  const { payouts } = await runRoom(code, async (st, { now }) => {
    E.act(st, uid, action, amount, now);
    return { result: null, changed: true };
  });
  await recordPayoutSessions(code, payouts);
}

// Turn-timer expiry, triggered by any client once the public deadline passes.
export async function tick(code: string): Promise<{ applied: boolean; retryInMs: number }> {
  const { result, payouts } = await runRoom(code, async (st, { tx, now }) => {
    const b = st.betting;
    // A finished hand: deal the next one when its pause is over, standing up
    // anyone whose heartbeat went stale first (same as a manual deal).
    if (st.phase === "showdown" && st.autoDeal) {
      if (!st.deadline || now < st.deadline) {
        return { result: { applied: false, retryInMs: st.deadline ? Math.max(0, st.deadline - now) : 0 }, changed: false };
      }
      const stale = await stalePlayers(tx, code, st, now);
      for (const id of stale) E.leave(st, id, now);
      const applied = E.autoNext(st, now);
      return { result: { applied, retryInMs: 0 }, changed: applied || stale.size > 0 };
    }
    // All-in vote: when its clock runs out the missing votes count as "once".
    if (st.runVote) {
      if (!st.deadline || now < st.deadline) {
        return { result: { applied: false, retryInMs: st.deadline ? Math.max(0, st.deadline - now) : 0 }, changed: false };
      }
      const applied = E.timeout(st, now, () => false);
      return { result: { applied, retryInMs: 0 }, changed: applied };
    }
    if (!b || !b.toAct || !st.deadline || now < st.deadline) {
      return {
        result: { applied: false, retryInMs: st.deadline ? Math.max(0, st.deadline - now) : 0 },
        changed: false,
      };
    }
    const stale = await stalePlayers(tx, code, st, now, [b.toAct]);
    const applied = E.timeout(st, now, (id) => stale.has(id));
    return { result: { applied, retryInMs: 0 }, changed: applied };
  });
  await recordPayoutSessions(code, payouts);
  return result;
}

// All-in: a player involved picks one or two boards.
export async function vote(uid: string, code: string, n: number): Promise<void> {
  const { payouts } = await runRoom(code, async (st, { now }) => {
    E.voteRun(st, uid, n, now);
    return { result: null, changed: true };
  });
  await recordPayoutSessions(code, payouts);
}

// Steps away from the table (or comes back).
export async function setAway(uid: string, code: string, away: boolean): Promise<void> {
  await runRoom(code, async (st) => {
    E.setAway(st, uid, away);
    return { result: null, changed: true };
  });
}

// The owner lets someone in: their buy-in is escrowed now, in the same
// transaction that seats them.
export async function approve(uid: string, code: string, target: string): Promise<E.SitResult> {
  const { result } = await runRoom(code, async (st, { tx, wallets }) => {
    const req = st.requests?.[target];
    if (!req) throw new OnlineError("Esa persona ya no está esperando");
    let debit: Debit | undefined;
    if (req.coins) {
      await readWallets(tx, [target], wallets);
      const w = wallets.get(target) ?? null;
      if (!w || w.coins < st.startStack) {
        E.deny(st, uid, target);
        throw new OnlineError("No le alcanzan las fichas para sentarse");
      }
      debit = { uid: target, amount: st.startStack };
    }
    const res = E.approve(st, uid, target);
    return { result: res, changed: true, debit, presenceFor: target };
  });
  return result;
}

export async function deny(uid: string, code: string, target: string): Promise<void> {
  await runRoom(code, async (st) => {
    E.deny(st, uid, target);
    return { result: null, changed: true };
  });
}

// The owner stands a player up; their stack is paid out like a normal leave.
export async function kick(uid: string, code: string, target: string): Promise<void> {
  const { payouts } = await runRoom(code, async (st, { now }) => {
    E.kick(st, uid, target, now);
    return { result: null, changed: true };
  });
  await recordPayoutSessions(code, payouts);
}

export async function configure(uid: string, code: string, cfg: OnlineConfigInput): Promise<void> {
  await runRoom(code, async (st, { now }) => {
    E.configure(st, uid, cfg, now);
    return { result: null, changed: true };
  });
}

export async function setPaused(uid: string, code: string, paused: boolean): Promise<void> {
  await runRoom(code, async (st, { now }) => {
    E.setPaused(st, uid, paused, now);
    return { result: null, changed: true };
  });
}

export async function rebuy(uid: string, code: string): Promise<void> {
  await runRoom(code, async (st, { tx, wallets }) => {
    const p = st.players[uid];
    if (!p) throw new OnlineError("No estas sentado");
    const amount = E.rebuy(st, uid);
    let debit: Debit | undefined;
    if (p.coins) {
      await readWallets(tx, [uid], wallets);
      debit = { uid, amount };
    }
    return { result: null, changed: true, debit };
  });
}

// Settles an online escrow that may have been left behind (tab closed and
// never came back). Called from reconcile-escrows on every app load:
//   - room gone or player no longer at the table: return the escrow, capped
//     by the room ledger (conservative, never mints);
//   - still seated but the heartbeat is stale: stand them up (cash-out);
//   - otherwise they are still playing: leave it alone.
export async function reconcileOnlineEscrow(uid: string, code: string): Promise<void> {
  const r = refs(code);
  const key = onlineEscrowKey(code);
  const engineSnap = await r.engine.get();
  const st = engineSnap.exists ? (JSON.parse(String(engineSnap.data()!.json)) as EngineState) : null;
  const seated = !!st && (!!st.players[uid] || !!st.leaving[uid]);

  if (seated) {
    const { payouts } = await runRoom(code, async (s, { tx, now }) => {
      if (!s.players[uid]) return { result: null, changed: false };
      const stale = await stalePlayers(tx, code, s, now, [uid]);
      if (!stale.has(uid)) return { result: null, changed: false };
      E.leave(s, uid, now);
      return { result: null, changed: true };
    });
    await recordPayoutSessions(code, payouts);
    return;
  }

  await adminDb().runTransaction(async (tx) => {
    const [us, ls] = await Promise.all([tx.get(userRef(uid)), tx.get(r.ledger)]);
    const w = readWallet(us.exists ? us.data() : undefined);
    if (!w || !(key in w.escrows)) return;
    const own = Math.max(0, Math.floor(w.escrows[key] ?? 0));
    const totalIn = Math.max(0, Math.floor(Number(ls.data()?.totalIn ?? 0)));
    const totalOut = Math.max(0, Math.floor(Number(ls.data()?.totalOut ?? 0)));
    // Without a ledger (should not happen for online rooms) fall back to the
    // player's own contribution, like the normal-mode cash-out does.
    const credit = ls.exists ? cappedCredit(own, totalIn, totalOut) : own;
    delete w.escrows[key];
    delete w.escrowModes[key];
    if (ls.exists) tx.set(r.ledger, { totalOut: totalOut + credit }, { merge: true });
    tx.update(userRef(uid), {
      coins: w.coins + credit,
      escrows: w.escrows,
      escrowModes: w.escrowModes,
    });
  });
}

// Server-side hand count for XP: distinct hands in which `uid` was dealt in,
// read from the records the engine writes at every showdown.
export async function countOnlineHands(
  code: string,
  uid: string,
  max: number,
): Promise<{ played: number; won: number; biggestPot: number }> {
  const snap = await refs(code)
    .hands.where("dealtIds", "array-contains", uid)
    .limit(max)
    .get();
  let played = 0;
  let won = 0;
  let biggestPot = 0;
  snap.forEach((d) => {
    const h = d.data() as { winners?: { id: string }[]; pot?: number };
    played++;
    biggestPot = Math.max(biggestPot, Math.floor(Number(h.pot ?? 0)) || 0);
    if (Array.isArray(h.winners) && h.winners.some((w) => w.id === uid)) won++;
  });
  return { played, won, biggestPot };
}

