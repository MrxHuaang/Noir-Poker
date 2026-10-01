"use client";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "./firebase";
import type { Card } from "./poker";
import type {
  NormalGameState,
  NormalSeat,
  BettingAction,
  RoomConfig,
} from "./betting";
import type { TournamentState } from "./tournament";
import type { Showdown } from "./handEval";
import type { RunItRun } from "./runIt";
import { encryptCardsTo } from "./holeCrypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(len = 5): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return out;
}

export type PendingAction = {
  seatId: string;
  action: BettingAction;
  amount?: number;
  ts: number;
};

export type PublicNormalState = Omit<NormalGameState, "deck"> & {
  deckCount: number;
};

export type NormalHoleDoc = {
  ownerUid: string | null;
  // Encrypted to the owner's published public key (base64). Present in the
  // normal flow. `cards` is only used as a fallback when the owner has no
  // published key yet (just joined) so the game never breaks.
  enc?: string;
  cards?: [Card, Card];
};

export type NormalLobbyPlayer = {
  uid: string;
  name: string;
  seed: string;
  joinedAt: number;
  chips: number;
  sittingOut: boolean;
  useTimeBank?: boolean;
  // Public RSA-OAEP key (JWK string) used to encrypt this player's hole cards.
  pubKey?: string;
  // Physical slot preference (0-8). Set when clicking a specific SIT button.
  preferredSlot?: number;
};

export type NormalRoomDoc = {
  code: string;
  hostUid: string;
  adminUid: string;
  createdAt: number;
  mode: "normal" | "torneo";
  // Modelo economico de la sala:
  //  - "coins":  buy-in del wallet, escrow, XP/rangos (cuenta). Por defecto.
  //  - "casual": stacks libres definidos por el host, sin monedas ni XP.
  economy?: "coins" | "casual";
  config: RoomConfig;
  state: PublicNormalState | null;
  pendingAction: PendingAction | null;
  result: (Showdown & { chips: Record<string, number> }) | null;
  runResults?: RunItRun[] | null;
  revealedHoles?: Record<string, [Card, Card]> | null;
  theme: string;
  cardBack?: string;
  cardFace?: string;
  roomBg?: string;
  tournament: TournamentState | null;
  locked: boolean;
  pendingRebuys: Record<string, number>;
  // ── Lobby / multi-table platform ──────────────────────────────────────
  // Display name shown in the lobby list.
  roomName?: string;
  // Public rooms appear in the lobby; private rooms are joinable by code only.
  isPublic?: boolean;
  // Seat cap (2-9). The lobby shows playerCount/maxPlayers and marks "full".
  maxPlayers?: number;
  // Client-ms timestamp the host refreshes on an interval. The lobby only lists
  // rooms with a fresh heartbeat — rooms exist only while the host tab is open.
  hostHeartbeat?: number;
  // Mirror of the lobby subcollection size, kept fresh by the host so the lobby
  // list can show occupancy without reading every room's lobby subcollection.
  playerCount?: number;
};

export async function setNormalRoomCardBack(
  code: string,
  cardBack: string,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code), { cardBack });
}

export async function setNormalRoomBg(
  code: string,
  roomBg: string,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code), { roomBg });
}

export async function createNormalRoom(
  hostUid: string,
  config: RoomConfig,
  meta: {
    theme?: string;
    roomName?: string;
    isPublic?: boolean;
    maxPlayers?: number;
    economy?: "coins" | "casual";
  } = {},
): Promise<string> {
  const db = getDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const ref = doc(db, "normalRooms", code);
    const snap = await getDoc(ref);
    if (snap.exists()) continue;
    const room: Omit<NormalRoomDoc, "createdAt"> & {
      createdAt: unknown;
    } = {
      code,
      hostUid,
      adminUid: hostUid,
      createdAt: serverTimestamp(),
      mode: config.mode,
      economy: meta.economy ?? "coins",
      config,
      state: null,
      pendingAction: null,
      result: null,
      theme: meta.theme ?? "noir",
      roomName: meta.roomName?.trim() || `Mesa ${code}`,
      isPublic: meta.isPublic ?? true,
      maxPlayers: Math.min(9, Math.max(2, meta.maxPlayers ?? 9)),
      hostHeartbeat: Date.now(),
      playerCount: 0,
      locked: false,
      pendingRebuys: {},
      tournament:
        config.mode === "torneo"
          ? {
              currentLevel: 0,
              levelStartedAt: Date.now(),
              paused: false,
              pausedAt: null,
              pausedRemaining: null,
              knockouts: [],
              finalRanking: [],
              started: false,
              startedAt: null,
              lateRegUntilLevel: 3,
              payouts: [50, 30, 20],
              reentries: {},
            }
          : null,
    };
    await setDoc(ref, room);
    return code;
  }
  throw new Error("could not generate unique code");
}

export function subscribeNormalRoom(
  code: string,
  cb: (room: NormalRoomDoc | null) => void,
  onError?: () => void,
): () => void {
  const db = getDb();
  return onSnapshot(
    doc(db, "normalRooms", code),
    (snap) => cb(snap.exists() ? (snap.data() as NormalRoomDoc) : null),
    // On error: call the optional error handler instead of silently nullifying.
    // The hook (useNormalRoom) handles retry logic; we do NOT call cb(null) so
    // the last known room state is preserved while reconnecting.
    () => { if (onError) onError(); else cb(null); },
  );
}

// Host-only: refresh the room's liveness marker so the lobby keeps listing it.
export async function setHostHeartbeat(code: string): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code), { hostHeartbeat: Date.now() });
}

// ── Wait queue ───────────────────────────────────────────────────────────
// FIFO queue for a full room. The host auto-seats the head when a seat frees.
export type QueueEntry = {
  uid: string;
  name: string;
  seed: string;
  joinedAt: number;
};

export async function joinQueue(
  code: string,
  uid: string,
  name: string,
  seed: string,
): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "normalRooms", code, "waitQueue", uid), {
    uid,
    name,
    seed,
    joinedAt: Date.now(),
  } satisfies QueueEntry);
}

export async function leaveQueue(code: string, uid: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, "normalRooms", code, "waitQueue", uid));
}

export function subscribeQueue(
  code: string,
  cb: (queue: QueueEntry[]) => void,
): () => void {
  const db = getDb();
  const q = query(
    collection(db, "normalRooms", code, "waitQueue"),
    orderBy("joinedAt", "asc"),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as QueueEntry)),
    () => cb([]),
  );
}

// ── Spectators ───────────────────────────────────────────────────────────
export type SpectatorEntry = { uid: string; name: string; seed: string };

export async function joinSpectators(
  code: string,
  uid: string,
  name: string,
  seed: string,
): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "normalRooms", code, "spectators", uid), {
    uid,
    name,
    seed,
  } satisfies SpectatorEntry);
}

export async function leaveSpectators(code: string, uid: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, "normalRooms", code, "spectators", uid));
}

export function subscribeNormalLobby(
  code: string,
  cb: (players: NormalLobbyPlayer[]) => void,
): () => void {
  const db = getDb();
  const q = query(
    collection(db, "normalRooms", code, "lobby"),
    orderBy("joinedAt", "asc"),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as NormalLobbyPlayer)),
    () => cb([]),
  );
}

// Same subscription, but a listener error is reported instead of being turned
// into an empty list: the host treats a missing lobby entry as "that player
// left the table", so a transient error must never look like everyone left.
export function subscribeNormalLobbyState(
  code: string,
  cb: (players: NormalLobbyPlayer[]) => void,
  onError: () => void,
): () => void {
  const db = getDb();
  const q = query(
    collection(db, "normalRooms", code, "lobby"),
    orderBy("joinedAt", "asc"),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as NormalLobbyPlayer)),
    () => onError(),
  );
}

export async function approveJoin(
  code: string,
  uid: string,
  name: string,
  seed: string,
  chips: number,
  preferredSlot?: number,
): Promise<void> {
  const db = getDb();
  const player: NormalLobbyPlayer = {
    uid,
    name,
    seed,
    joinedAt: Date.now(),
    chips,
    sittingOut: false,
    ...(preferredSlot !== undefined ? { preferredSlot } : {}),
  };
  await setDoc(doc(db, "normalRooms", code, "lobby", uid), player);
}

export async function setPlayerPreferredSlot(
  code: string,
  uid: string,
  preferredSlot: number,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code, "lobby", uid), { preferredSlot });
}

export async function patchLobbyPlayer(
  code: string,
  uid: string,
  patch: Partial<NormalLobbyPlayer>,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code, "lobby", uid), patch as Record<string, unknown>);
}

// Host-only: mirror seat stacks into lobby/{uid}.chips, one write per player.
// Individual writes (not a batch) so a lobby doc deleted in the meantime (that
// player cashed out) cannot block the others.
export async function syncLobbyChips(
  code: string,
  chipsByUid: Record<string, number>,
): Promise<void> {
  const db = getDb();
  await Promise.allSettled(
    Object.entries(chipsByUid).map(([uid, chips]) =>
      updateDoc(doc(db, "normalRooms", code, "lobby", uid), { chips }),
    ),
  );
}

// Host-only: settle write. The room patch (state/result) and the lobby chips
// land in ONE batch so the economy server never sees a settled table with
// stale lobby chips. If the batch is rejected (typically a lobby doc vanished
// because that player cashed out in between) the room patch is retried alone
// and each lobby write is applied individually.
export async function commitNormalSettle(
  code: string,
  patch: Record<string, unknown>,
  chipsByUid: Record<string, number>,
): Promise<void> {
  const db = getDb();
  const batch = writeBatch(db);
  batch.update(doc(db, "normalRooms", code), stripUndefined(patch));
  for (const [uid, chips] of Object.entries(chipsByUid)) {
    batch.update(doc(db, "normalRooms", code, "lobby", uid), { chips });
  }
  try {
    await batch.commit();
  } catch {
    await updateDoc(doc(db, "normalRooms", code), stripUndefined(patch));
    await syncLobbyChips(code, chipsByUid);
  }
}

// Room patch that consumes exactly the applied rebuy amounts (a rebuy approved
// while the deal was being prepared survives for the next hand).
export function consumePendingRebuysPatch(
  applied: Record<string, number>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [uid, amount] of Object.entries(applied)) {
    if (amount > 0) patch[`pendingRebuys.${uid}`] = increment(-amount);
  }
  return patch;
}

export async function kickFromLobby(
  code: string,
  uid: string,
): Promise<void> {
  const db = getDb();
  const { deleteDoc: _del } = await import("firebase/firestore");
  await _del(doc(db, "normalRooms", code, "lobby", uid));
}

export async function setTableLocked(
  code: string,
  locked: boolean,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code), { locked });
}

export function subscribeNormalHole(
  code: string,
  seatId: string,
  cb: (hole: NormalHoleDoc | null) => void,
): () => void {
  const db = getDb();
  return onSnapshot(
    doc(db, "normalRooms", code, "holes", seatId),
    (snap) => cb(snap.exists() ? (snap.data() as NormalHoleDoc) : null),
    () => cb(null),
  );
}

function toPublicState(gs: NormalGameState): PublicNormalState {
  const { deck, ...rest } = gs;
  return { ...rest, deckCount: deck.length };
}

// Firestore rechaza `undefined` como valor de campo y el write COMPLETO falla
// (p. ej. el settle de run-it-N marca `allInNegotiation: undefined`). Limpiar
// recursivamente los `undefined` antes de escribir. Solo se reconstruyen
// objetos planos: sentinels de Firestore (serverTimestamp, Timestamp, etc.)
// pasan intactos.
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

// `extra.roomPatch` / `extra.lobbyChips` ride in the same batch as the deal
// (consumed rebuys + the stacks the hand starts with), so the economy server
// never sees a rebuy both pending and already on the seat. The whole batch
// fails if one of those lobby docs vanished; the caller then retries the deal.
export async function writeNormalDealt(
  code: string,
  gs: NormalGameState,
  holeCards: Record<string, [Card, Card]>,
  ownerByPlayerId: Record<string, string | null>,
  pubKeyByOwner: Record<string, string | undefined> = {},
  extra: {
    roomPatch?: Record<string, unknown>;
    lobbyChips?: Record<string, number>;
  } = {},
): Promise<void> {
  const db = getDb();
  // Encrypt each hole to the owner's published public key. If a key is missing
  // (a player joined this instant and hasn't published yet, or an AI seat with
  // no device) fall back to plaintext for that single seat so the game never
  // breaks. The fallback is logged for visibility.
  const docs = await Promise.all(
    Object.entries(holeCards).map(async ([seatId, cards]) => {
      const ownerUid = ownerByPlayerId[seatId] ?? null;
      const pub = ownerUid ? pubKeyByOwner[ownerUid] : undefined;
      if (pub) {
        const enc = await encryptCardsTo(pub, cards);
        if (enc) return { seatId, data: { ownerUid, enc } as NormalHoleDoc };
      }
      if (typeof console !== "undefined") {
        console.warn(
          `[holes] sin clave publica para ${seatId}; guardando en texto plano (fallback)`,
        );
      }
      return { seatId, data: { ownerUid, cards } as NormalHoleDoc };
    }),
  );

  const batch = writeBatch(db);
  batch.update(doc(db, "normalRooms", code), {
    ...stripUndefined(extra.roomPatch ?? {}),
    state: stripUndefined(toPublicState(gs)),
    result: null,
    runResults: null,
    pendingAction: null,
    revealedHoles: null,
  });
  for (const { seatId, data } of docs) {
    batch.set(doc(db, "normalRooms", code, "holes", seatId), data);
  }
  for (const [uid, chips] of Object.entries(extra.lobbyChips ?? {})) {
    batch.update(doc(db, "normalRooms", code, "lobby", uid), { chips });
  }
  await batch.commit();
}

export async function patchNormalRoom(
  code: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code), stripUndefined(patch));
}

export async function postPlayerAction(
  code: string,
  seatId: string,
  action: BettingAction,
  amount?: number,
): Promise<void> {
  const db = getDb();
  const pendingAction: Record<string, unknown> = { seatId, action, ts: Date.now() };
  if (amount != null) pendingAction.amount = Math.round(amount);
  await updateDoc(doc(db, "normalRooms", code), { pendingAction });
}

export async function postPlayerVote(
  code: string,
  uid: string,
  vote: number,
): Promise<void> {
  const db = getDb();
  const ref = doc(db, "normalRooms", code);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, {
    [`state.allInNegotiation.votes.${uid}`]: vote,
  });
}

export async function setNormalRoomTheme(
  code: string,
  theme: string,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code), { theme });
}

export async function setNormalRoomMaxPlayers(
  code: string,
  maxPlayers: number,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code), {
    maxPlayers: Math.min(9, Math.max(2, Math.round(maxPlayers))),
  });
}

export function lobbyToSeats(
  lobby: NormalLobbyPlayer[],
  config: RoomConfig,
  ownerMap: Record<string, string | null>,
): NormalSeat[] {
  return lobby.map((p) => ({
    id: p.uid,
    name: p.name,
    seed: p.seed,
    ownerUid: ownerMap[p.uid] ?? null,
    chips: p.chips > 0 ? p.chips : config.startingStack,
    bet: 0,
    totalBet: 0,
    revealed: false,
    status: p.sittingOut ? ("sitting-out" as const) : ("active" as const),
    timeBank: config.timeBankInit,
    turnDeadline: null,
    ...(p.preferredSlot !== undefined ? { preferredSlot: p.preferredSlot } : {}),
  }));
}
