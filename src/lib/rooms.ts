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
  writeBatch,
} from "firebase/firestore";
import { getDb } from "./firebase";
import type { Card, GameState, Street } from "./poker";
import type { Category, Showdown } from "./handEval";

export type PublicSeat = {
  id: string;
  name: string;
  seed: string;
  ownerUid: string | null;
  folded: boolean;
  revealedCards: [boolean, boolean];
};

export type RoomState = {
  seats: PublicSeat[];
  community: Card[];
  burns: Card[];
  deckCount: number;
  street: Street;
  dealId: string;
};

export type RoomDoc = {
  code: string;
  hostUid: string;
  createdAt: number;
  state: RoomState | null;
  result: Showdown | null;
  playback: { idx: number; total: number; community: Card[] } | null;
  runHighlight: string[];
  theme?: string;
  mode?: "presencial" | "normal" | "torneo";
};

export type HoleDoc = {
  ownerUid: string | null;
  cards: [Card, Card];
};

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(len = 5): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}

export async function createRoom(
  hostUid: string,
  opts?: { theme?: string; mode?: "presencial" | "normal" | "torneo" },
): Promise<string> {
  const db = getDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const ref = doc(db, "rooms", code);
    const snap = await getDoc(ref);
    if (snap.exists()) continue;
    const room: Omit<RoomDoc, "createdAt"> & { createdAt: unknown } = {
      code,
      hostUid,
      createdAt: serverTimestamp(),
      state: null,
      result: null,
      playback: null,
      runHighlight: [],
      theme: opts?.theme ?? "emerald",
      mode: opts?.mode ?? "presencial",
    };
    await setDoc(ref, room);
    return code;
  }
  throw new Error("could not generate unique code");
}

export async function setRoomTheme(code: string, theme: string): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "rooms", code), { theme });
}

export function subscribeRoom(
  code: string,
  cb: (room: RoomDoc | null) => void,
): () => void {
  const db = getDb();
  return onSnapshot(
    doc(db, "rooms", code),
    (snap) => cb(snap.exists() ? (snap.data() as RoomDoc) : null),
    () => cb(null),
  );
}

export function subscribeHole(
  code: string,
  seatId: string,
  cb: (hole: HoleDoc | null) => void,
): () => void {
  const db = getDb();
  return onSnapshot(
    doc(db, "rooms", code, "holes", seatId),
    (snap) => cb(snap.exists() ? (snap.data() as HoleDoc) : null),
    () => cb(null),
  );
}

export function gameToPublic(
  gs: GameState,
  ownerByPlayerId: Record<string, string | null>,
): RoomState {
  return {
    seats: gs.seats.map((s) => ({
      id: s.player.id,
      name: s.player.name,
      seed: s.player.seed,
      ownerUid: ownerByPlayerId[s.player.id] ?? null,
      folded: s.folded,
      revealedCards: s.revealedCards,
    })),
    community: gs.community,
    burns: gs.burns,
    deckCount: gs.deck.length,
    street: gs.street,
    dealId: gs.dealId,
  };
}

export async function writeDealedRoom(
  code: string,
  gs: GameState,
  ownerByPlayerId: Record<string, string | null>,
): Promise<void> {
  const db = getDb();
  const batch = writeBatch(db);
  batch.update(doc(db, "rooms", code), {
    state: gameToPublic(gs, ownerByPlayerId),
    result: null,
    playback: null,
    runHighlight: [],
  });
  for (const seat of gs.seats) {
    const ref = doc(db, "rooms", code, "holes", seat.player.id);
    batch.set(ref, {
      ownerUid: ownerByPlayerId[seat.player.id] ?? null,
      cards: seat.hole,
    });
  }
  await batch.commit();
}

export async function patchRoom(
  code: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "rooms", code), patch);
}

export async function phoneSetSeatFlag(
  code: string,
  seatId: string,
  key: "folded",
  value: boolean,
): Promise<void> {
  const db = getDb();
  const ref = doc(db, "rooms", code);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const room = snap.data() as RoomDoc;
  if (!room.state) return;
  const seats = room.state.seats.map((s) =>
    s.id === seatId ? { ...s, [key]: value } : s,
  );
  await updateDoc(ref, { "state.seats": seats });
}

export async function phoneSetCardReveal(
  code: string,
  seatId: string,
  cardIndex: 0 | 1,
  value: boolean,
): Promise<void> {
  const db = getDb();
  const ref = doc(db, "rooms", code);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const room = snap.data() as RoomDoc;
  if (!room.state) return;
  const seats = room.state.seats.map((s) => {
    if (s.id !== seatId) return s;
    const revealedCards: [boolean, boolean] = [s.revealedCards[0], s.revealedCards[1]];
    revealedCards[cardIndex] = value;
    return { ...s, revealedCards };
  });
  await updateDoc(ref, { "state.seats": seats });
}

export async function claimSeat(
  code: string,
  seatId: string,
  uid: string,
): Promise<void> {
  const db = getDb();
  const ref = doc(db, "rooms", code);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("room not found");
  const room = snap.data() as RoomDoc;
  if (!room.state) throw new Error("no game");
  const seats = room.state.seats.map((s) =>
    s.id === seatId && !s.ownerUid ? { ...s, ownerUid: uid } : s,
  );
  const batch = writeBatch(db);
  batch.update(ref, { "state.seats": seats });
  batch.update(doc(db, "rooms", code, "holes", seatId), { ownerUid: uid });
  await batch.commit();
}

export type LobbyPlayer = {
  uid: string;
  name: string;
  seed: string;
  joinedAt: number;
};

export async function joinLobby(
  code: string,
  uid: string,
  name: string,
  seed: string,
): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "rooms", code, "lobby", uid), {
    uid,
    name,
    seed,
    joinedAt: Date.now(),
  });
}

export async function leaveLobby(code: string, uid: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, "rooms", code, "lobby", uid));
}

export function subscribeLobby(
  code: string,
  cb: (players: LobbyPlayer[]) => void,
): () => void {
  const db = getDb();
  const q = query(
    collection(db, "rooms", code, "lobby"),
    orderBy("joinedAt", "asc"),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as LobbyPlayer)),
    () => cb([]),
  );
}

export type HistoryEntry = {
  ts: number;
  community: Card[];
  winners: string[];
  category: Category;
  runIndex?: number;
  runTotal?: number;
};
