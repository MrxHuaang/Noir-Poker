"use client";
import {
  collection,
  doc,
  getDoc,
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
  config: RoomConfig;
  state: PublicNormalState | null;
  pendingAction: PendingAction | null;
  result: (Showdown & { chips: Record<string, number> }) | null;
  revealedHoles?: Record<string, [Card, Card]> | null;
  theme: string;
  cardBack?: string;
  cardFace?: string;
  roomBg?: string;
  tournament: TournamentState | null;
  locked: boolean;
  pendingRebuys: Record<string, number>;
};

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
  theme = "emerald",
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
      config,
      state: null,
      pendingAction: null,
      result: null,
      theme,
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
  const room = snap.data() as NormalRoomDoc;
  const currentVotes = room.state?.allInNegotiation?.votes ?? {};
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
