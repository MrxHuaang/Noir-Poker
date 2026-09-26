"use client";
// Live hand history of an online room. The authoritative records are written
// by the /api/online transaction at every showdown (onlineRooms/{code}/hands);
// clients can read but never write them (firestore.rules).
import { useEffect, useState } from "react";
import { subscribeOnlineHands } from "@/lib/online/client";
import type { OnlineHandDoc } from "@/lib/online/protocol";

export type OnlineHandRecord = OnlineHandDoc;

const HAND_CATEGORY_LABEL = [
  "Carta alta",
  "Par",
  "Doble par",
  "Trío",
  "Escalera",
  "Color",
  "Full house",
  "Póker",
  "Escalera de color",
] as const;

export function categoryLabel(cat: number): string {
  return HAND_CATEGORY_LABEL[cat] ?? "—";
}

export function useOnlineHistory(
  room: string | null,
  enabled = true,
): { records: OnlineHandRecord[] } {
  const [records, setRecords] = useState<OnlineHandRecord[]>([]);
  useEffect(() => {
    if (!room || !enabled) return;
    return subscribeOnlineHands(room, setRecords);
  }, [room, enabled]);
  return { records };
}
