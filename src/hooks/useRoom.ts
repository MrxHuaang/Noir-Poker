"use client";
import { useEffect, useState } from "react";
import {
  subscribeRoom,
  subscribeHole,
  subscribeLobby,
  type RoomDoc,
  type HoleDoc,
  type LobbyPlayer,
} from "@/lib/rooms";

export function useRoom(code: string | null) {
  const [room, setRoom] = useState<RoomDoc | null | undefined>(undefined);
  useEffect(() => {
    if (!code) return;
    const unsub = subscribeRoom(code, (r) => setRoom(r));
    return () => unsub();
  }, [code]);
  return code ? room : null;
}

export function useLobby(code: string | null): LobbyPlayer[] {
  const [list, setList] = useState<LobbyPlayer[]>([]);
  useEffect(() => {
    if (!code) return;
    const unsub = subscribeLobby(code, (p) => setList(p));
    return () => unsub();
  }, [code]);
  return code ? list : [];
}

export function useHole(code: string | null, seatId: string | null) {
  const [hole, setHole] = useState<HoleDoc | null | undefined>(undefined);
  useEffect(() => {
    if (!code || !seatId) return;
    const unsub = subscribeHole(code, seatId, (h) => setHole(h));
    return () => unsub();
  }, [code, seatId]);
  return code && seatId ? hole : null;
}
