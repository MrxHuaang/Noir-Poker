"use client";
// Client side of the online mode: Firestore subscriptions (public state, own
// hole cards, presence) and the POST /api/online wrapper. No game rules here.
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { getDb } from "../firebase";
import type {
  OnlineAction,
  OnlineHandDoc,
  OnlineHoleDoc,
  OnlineRoomDoc,
} from "./protocol";

export class OnlineApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function callOnline<T = Record<string, unknown>>(
  token: string,
  action: OnlineAction,
  params: Record<string, unknown> = {},
  opts: { keepalive?: boolean } = {},
): Promise<T> {
  const res = await fetch("/api/online", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...params }),
    keepalive: opts.keepalive,
  });
  const data = (await res.json().catch(() => ({ error: "Error de red" }))) as T & {
    error?: string;
  };
  if (!res.ok) throw new OnlineApiError(data.error ?? "Error desconocido", res.status);
  return data;
}

export function subscribeOnlineRoom(
  code: string,
  cb: (room: OnlineRoomDoc | null) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    doc(getDb(), "onlineRooms", code),
    (snap) => cb(snap.exists() ? (snap.data() as OnlineRoomDoc) : null),
    (err) => onError(err),
  );
}

export function subscribeOnlineHole(
  code: string,
  uid: string,
  cb: (hole: OnlineHoleDoc | null) => void,
): () => void {
  return onSnapshot(
    doc(getDb(), "onlineRooms", code, "holes", uid),
    (snap) => cb(snap.exists() ? (snap.data() as OnlineHoleDoc) : null),
    () => cb(null),
  );
}

export async function writeOnlinePresence(code: string, uid: string): Promise<void> {
  await setDoc(doc(getDb(), "onlineRooms", code, "presence", uid), {
    uid,
    at: serverTimestamp(),
  });
}

// Heartbeat timestamps of everyone in the room (ms since epoch; 0 if pending).
export function subscribeOnlinePresence(
  code: string,
  cb: (at: Record<string, number>) => void,
): () => void {
  return onSnapshot(
    collection(getDb(), "onlineRooms", code, "presence"),
    (snap) => {
      const out: Record<string, number> = {};
      snap.forEach((d) => {
        const at = d.data().at as { toMillis?: () => number } | null;
        out[d.id] = at && typeof at.toMillis === "function" ? at.toMillis() : Date.now();
      });
      cb(out);
    },
    () => cb({}),
  );
}

export function subscribeOnlineHands(
  code: string,
  cb: (hands: OnlineHandDoc[]) => void,
): () => void {
  return onSnapshot(
    query(collection(getDb(), "onlineRooms", code, "hands"), orderBy("handNum", "desc"), limit(50)),
    (snap) => cb(snap.docs.map((d) => d.data() as OnlineHandDoc)),
    () => cb([]),
  );
}

export type OnlineRoomSummary = {
  code: string;
  players: number;
  casual: boolean;
  sb: number;
  bb: number;
  updatedAt: number;
};

// Open rooms for the lobby (single-field equality: no composite index needed).
// Rooms idle for over 30 minutes are hidden (abandoned tabs keep them "open"
// until someone deals again and the stale seats are pruned).
export function subscribeOpenOnlineRooms(cb: (rooms: OnlineRoomSummary[]) => void): () => void {
  return onSnapshot(
    query(collection(getDb(), "onlineRooms"), where("open", "==", true), limit(50)),
    (snap) => {
      const cutoff = Date.now() - 30 * 60_000;
      const rooms = snap.docs
        .map((d) => d.data() as OnlineRoomDoc)
        .filter((r) => r.updatedAt > cutoff)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((r) => ({
          code: r.code,
          players: r.players,
          casual: r.casual,
          sb: r.state?.sb ?? 0,
          bb: r.state?.bb ?? 0,
          updatedAt: r.updatedAt,
        }));
      cb(rooms);
    },
    () => cb([]),
  );
}
