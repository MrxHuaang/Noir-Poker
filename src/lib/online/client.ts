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
  PlayerStatsDoc,
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

// `live` is false while the snapshot comes from the local cache only (the
// connection dropped): the table shows it is reconnecting.
export function subscribeOnlineRoom(
  code: string,
  cb: (room: OnlineRoomDoc | null, live: boolean) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    doc(getDb(), "onlineRooms", code),
    { includeMetadataChanges: true },
    (snap) => cb(snap.exists() ? (snap.data() as OnlineRoomDoc) : null, !snap.metadata.fromCache),
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

// `watch` marks an observer (not seated): counted as an onlooker, never dealt in.
export async function writeOnlinePresence(code: string, uid: string, watch = false): Promise<void> {
  await setDoc(doc(getDb(), "onlineRooms", code, "presence", uid), {
    uid,
    at: serverTimestamp(),
    ...(watch ? { watch: true } : {}),
  });
}

// Heartbeat timestamps of everyone in the room (ms since epoch; 0 if pending),
// and which of them are only watching.
export function subscribeOnlinePresence(
  code: string,
  cb: (at: Record<string, number>, watchers: Set<string>) => void,
): () => void {
  return onSnapshot(
    collection(getDb(), "onlineRooms", code, "presence"),
    (snap) => {
      const out: Record<string, number> = {};
      const watchers = new Set<string>();
      snap.forEach((d) => {
        const data = d.data();
        const at = data.at as { toMillis?: () => number } | null;
        out[d.id] = at && typeof at.toMillis === "function" ? at.toMillis() : Date.now();
        if (data.watch === true) watchers.add(d.id);
      });
      cb(out, watchers);
    },
    () => cb({}, new Set()),
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

// Running stats of a player across online hands (written by the server).
export function subscribePlayerStats(uid: string, cb: (stats: PlayerStatsDoc | null) => void): () => void {
  return onSnapshot(
    doc(getDb(), "playerStats", uid),
    (snap) => cb(snap.exists() ? (snap.data() as PlayerStatsDoc) : null),
    () => cb(null),
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
