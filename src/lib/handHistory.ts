"use client";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { getDb } from "./firebase";
import type { Category } from "./handEval";

export type HandRecord = {
  id: string;
  handNum: number;
  winners: { id: string; name: string; amount: number }[];
  category: Category;
  pot: number;
  community: string[];
  ts: number;
  runIndex?: number;
  runTotal?: number;
  // Ids dealt into the hand (participated) and ids that reached a contested
  // showdown. Optional: rows written before HUD support omit them. Used by
  // aggregateHud (lib/handStats.ts). Stored as seat ids (= player uid).
  dealtIds?: string[];
  showdownIds?: string[];
};

export async function writeHandRecord(
  code: string,
  rec: Omit<HandRecord, "id" | "ts">,
): Promise<void> {
  const db = getDb();
  await addDoc(collection(db, "normalRooms", code, "hands"), {
    ...rec,
    ts: serverTimestamp(),
  });
}

// NOTE: online-mode (server-backed) hand history does NOT live here. The Go
// server persists it to Supabase (online_hand_records); see useOnlineHistory.
// A previous client-side write to onlineRooms/{code}/hands was dead code:
// firestore.rules never matched that collection, so every write was denied.

export function subscribeHandHistory(
  code: string,
  cb: (recs: HandRecord[]) => void,
): () => void {
  const db = getDb();
  const q = query(
    collection(db, "normalRooms", code, "hands"),
    orderBy("ts", "desc"),
    limit(200),
  );
  return onSnapshot(
    q,
    (snap) => {
      const out: HandRecord[] = [];
      snap.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        const tsRaw = data.ts as { toMillis?: () => number } | number | null;
        const ts =
          tsRaw && typeof tsRaw === "object" && typeof tsRaw.toMillis === "function"
            ? tsRaw.toMillis()
            : typeof tsRaw === "number"
              ? tsRaw
              : Date.now();
        out.push({
          id: d.id,
          handNum: Number(data.handNum ?? 0),
          winners: (data.winners as HandRecord["winners"]) ?? [],
          category: data.category as Category,
          pot: Number(data.pot ?? 0),
          community: (data.community as string[]) ?? [],
          ts,
          dealtIds: (data.dealtIds as string[]) ?? [],
          showdownIds: (data.showdownIds as string[]) ?? [],
        });
      });
      cb(out);
    },
    () => cb([]),
  );
}
