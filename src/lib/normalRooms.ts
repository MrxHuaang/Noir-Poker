"use client";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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
import { generateCode } from "./rooms";
import { encryptCardsTo } from "./holeCrypto";

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

// Compact projection of a live room for the lobby list.
export type OpenRoomSummary = {
  code: string;
  roomName: string;
  mode: "normal" | "torneo";
  economy: "coins" | "casual";
  isPublic: boolean;
  locked: boolean;
  playerCount: number;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  status: "waiting" | "playing" | "full";
  hostHeartbeat: number;
};

// A room is considered live this long after its last heartbeat.
export const ROOM_LIVE_WINDOW_MS = 35_000;

export async function setNormalRoomCardBack(
  code: string,
  cardBack: string,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code), { cardBack });
}

export async function setNormalRoomCardFace(
  code: string,
  cardFace: string,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code), { cardFace });
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

// Lobby: public rooms. The `allow read` rule covers collection `list` for any
// signed-in user. Projects to a compact summary and keeps `hostHeartbeat` so the
// consumer can gate liveness on a timer (rooms are only "live" while the host
// tab is open). Rooms with no heartbeat field are dropped here.
export function subscribeOpenRooms(
  cb: (rooms: OpenRoomSummary[]) => void,
): () => void {
  const db = getDb();
  const q = query(collection(db, "normalRooms"), where("isPublic", "==", true));
  return onSnapshot(
    q,
    (snap) => {
      const rooms = snap.docs
        .map((d) => d.data() as NormalRoomDoc)
        .filter((r) => typeof r.hostHeartbeat === "number")
        .map((r) => {
          const maxPlayers = r.maxPlayers ?? 9;
          const playerCount = r.playerCount ?? r.state?.seats?.length ?? 0;
          const phase = r.state?.phase;
          const inHand =
            !!r.state && phase !== "lobby" && phase !== "between-hands";
          const status: OpenRoomSummary["status"] =
            playerCount >= maxPlayers ? "full" : inHand ? "playing" : "waiting";
          return {
            code: r.code,
            roomName: r.roomName ?? `Mesa ${r.code}`,
            mode: r.mode,
            economy: r.economy ?? "coins",
            isPublic: r.isPublic ?? true,
            locked: r.locked ?? false,
            playerCount,
            maxPlayers,
            smallBlind: r.config?.smallBlind ?? 0,
            bigBlind: r.config?.bigBlind ?? 0,
            status,
            hostHeartbeat: r.hostHeartbeat as number,
          };
        })
        .sort((a, b) => b.hostHeartbeat - a.hostHeartbeat);
      cb(rooms);
    },
    () => cb([]),
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

export function subscribeSpectators(
  code: string,
  cb: (specs: SpectatorEntry[]) => void,
): () => void {
  const db = getDb();
  return onSnapshot(
    collection(db, "normalRooms", code, "spectators"),
    (snap) => cb(snap.docs.map((d) => d.data() as SpectatorEntry)),
    () => cb([]),
  );
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

// Legacy — kept for presencial mode compatibility
export async function joinNormalLobby(
  code: string,
  uid: string,
  name: string,
  seed: string,
): Promise<void> {
  await approveJoin(code, uid, name, seed, 0);
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

export async function writeNormalDealt(
  code: string,
  gs: NormalGameState,
  holeCards: Record<string, [Card, Card]>,
  ownerByPlayerId: Record<string, string | null>,
  pubKeyByOwner: Record<string, string | undefined> = {},
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
    state: toPublicState(gs),
    result: null,
    runResults: null,
    pendingAction: null,
    revealedHoles: null,
  });
  for (const { seatId, data } of docs) {
    batch.set(doc(db, "normalRooms", code, "holes", seatId), data);
  }
  await batch.commit();
}

export async function patchNormalRoom(
  code: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code), patch);
}

export async function postPlayerAction(
  code: string,
  seatId: string,
  action: BettingAction,
  amount?: number,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code), {
    pendingAction: { seatId, action, amount: amount ?? null, ts: Date.now() },
  });
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

export async function setNormalRoomName(
  code: string,
  roomName: string,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code), {
    roomName: roomName.trim().slice(0, 32) || `Mesa ${code}`,
  });
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
