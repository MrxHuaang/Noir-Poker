"use client";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { getDb } from "./firebase";

export type Reaction = {
  id: string;
  uid: string;
  emoji: string;
  ts: number;
};

export const REACTIONS = ["👍", "🔥", "👏", "😂", "😱", "💀", "🤡", "🍀"] as const;

export async function sendReaction(
  code: string,
  uid: string,
  emoji: string,
): Promise<void> {
  if (!REACTIONS.includes(emoji as (typeof REACTIONS)[number])) return;
  const db = getDb();
  await addDoc(collection(db, "normalRooms", code, "reactions"), {
    uid,
    emoji,
    // Use client timestamp so it's immediately available (serverTimestamp is null until write completes)
    ts: Date.now(),
  });
}

export function subscribeReactions(
  code: string,
  cb: (rs: Reaction[]) => void,
): () => void {
  const db = getDb();
  const q = query(
    collection(db, "normalRooms", code, "reactions"),
    orderBy("ts", "desc"),
    limit(20),
  );
  return onSnapshot(
    q,
    (snap) => {
      const out: Reaction[] = [];
      const now = Date.now();
      snap.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        const tsRaw = data.ts as { toMillis?: () => number } | number | null;
        const ts =
          tsRaw && typeof tsRaw === "object" && typeof tsRaw.toMillis === "function"
            ? tsRaw.toMillis()
            : typeof tsRaw === "number"
              ? tsRaw
              : now;
        if (now - ts > 4000) return;
        out.push({
          id: d.id,
          uid: String(data.uid ?? ""),
          emoji: String(data.emoji ?? ""),
          ts,
        });
      });
      cb(out);
    },
    () => cb([]),
  );
}
