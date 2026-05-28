"use client";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDb } from "./firebase";

export async function heartbeat(code: string, uid: string): Promise<void> {
  const db = getDb();
  await setDoc(
    doc(db, "normalRooms", code, "presence", uid),
    { uid, lastSeen: serverTimestamp(), online: true },
    { merge: true },
  );
}

export async function markOffline(code: string, uid: string): Promise<void> {
  const db = getDb();
  try {
    await updateDoc(doc(db, "normalRooms", code, "presence", uid), { online: false });
  } catch {
    // best effort — ignore if doc doesn't exist
  }
}
