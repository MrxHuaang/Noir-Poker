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
    if (!code) {
      setRoom(null);
      return;
    }
    const unsub = subscribeRoom(code, (r) => setRoom(r));
    return () => unsub();
  }, [code]);
  return room;
}

export function useLobby(code: string | null): LobbyPlayer[] {
  const [list, setList] = useState<LobbyPlayer[]>([]);
  useEffect(() => {
    if (!code) {
      setList([]);
      return;
    }
    const unsub = subscribeLobby(code, (p) => setList(p));
    return () => unsub();
  }, [code]);
  return list;
}

export function useHole(code: string | null, seatId: string | null) {
  const [hole, setHole] = useState<HoleDoc | null | undefined>(undefined);
  useEffect(() => {
    if (!code || !seatId) {
      setHole(null);
      return;
    }
    const unsub = subscribeHole(code, seatId, (h) => setHole(h));
    return () => unsub();
  }, [code, seatId]);
  return hole;
}
