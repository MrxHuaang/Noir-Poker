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
import type { LobbyPlayer } from "./rooms";
import { generateCode } from "./rooms";

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
  cards: [Card, Card];
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
  theme: string;
  tournament: TournamentState | null;
};

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
): () => void {
  const db = getDb();
  return onSnapshot(
    doc(db, "normalRooms", code),
    (snap) => cb(snap.exists() ? (snap.data() as NormalRoomDoc) : null),
    () => cb(null),
  );
}

export function subscribeNormalLobby(
  code: string,
  cb: (players: LobbyPlayer[]) => void,
): () => void {
  const db = getDb();
  const q = query(
    collection(db, "normalRooms", code, "lobby"),
    orderBy("joinedAt", "asc"),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as LobbyPlayer)),
    () => cb([]),
  );
}

export async function joinNormalLobby(
  code: string,
  uid: string,
  name: string,
  seed: string,
): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "normalRooms", code, "lobby", uid), {
    uid,
    name,
    seed,
    joinedAt: Date.now(),
  });
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
): Promise<void> {
  const db = getDb();
  const batch = writeBatch(db);
  batch.update(doc(db, "normalRooms", code), {
    state: toPublicState(gs),
    result: null,
    pendingAction: null,
  });
  for (const [seatId, cards] of Object.entries(holeCards)) {
    const ref = doc(db, "normalRooms", code, "holes", seatId);
    batch.set(ref, {
      ownerUid: ownerByPlayerId[seatId] ?? null,
      cards,
    });
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

export async function setNormalRoomTheme(
  code: string,
  theme: string,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code), { theme });
}

export function lobbyToSeats(
  lobby: LobbyPlayer[],
  config: RoomConfig,
  ownerMap: Record<string, string | null>,
): NormalSeat[] {
  return lobby.map((p) => ({
    id: p.uid,
    name: p.name,
    seed: p.seed,
    ownerUid: ownerMap[p.uid] ?? null,
    chips: config.startingStack,
    bet: 0,
    totalBet: 0,
    revealed: false,
    status: "active" as const,
    timeBank: config.timeBankInit,
    turnDeadline: null,
  }));
}
