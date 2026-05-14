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

export function subscribeHandHistory(
  code: string,
  cb: (recs: HandRecord[]) => void,
): () => void {
  const db = getDb();
  const q = query(
    collection(db, "normalRooms", code, "hands"),
    orderBy("ts", "desc"),
    limit(30),
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
        });
      });
      cb(out);
    },
    () => cb([]),
  );
}
