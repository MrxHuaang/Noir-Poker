"use client";
import { collection, onSnapshot, type Timestamp } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { getDb } from "@/lib/firebase";

type RawPresence = {
  uid: string;
  lastSeen: Timestamp | null;
  online: boolean;
};

const STALE_MS = 90_000;

function isAlive(doc: RawPresence): boolean {
  if (!doc.online) return false;
  if (!doc.lastSeen) return false;
  const ms =
    typeof doc.lastSeen.toMillis === "function" ? doc.lastSeen.toMillis() : 0;
  return Date.now() - ms < STALE_MS;
}

export function usePresenceMap(code: string | null): Record<string, boolean> {
  const [rawDocs, setRawDocs] = useState<RawPresence[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!code) return;
    const db = getDb();
    return onSnapshot(
      collection(db, "normalRooms", code, "presence"),
      (snap) => setRawDocs(snap.docs.map((d) => d.data() as RawPresence)),
      () => setRawDocs([]),
    );
  }, [code]);

  // Re-evaluate staleness every 30s to catch crashed clients
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const presenceMap = useMemo(
    () => {
      const map: Record<string, boolean> = {};
      for (const d of rawDocs) map[d.uid] = isAlive(d);
      return map;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawDocs, tick],
  );

  return code ? presenceMap : {};
}
