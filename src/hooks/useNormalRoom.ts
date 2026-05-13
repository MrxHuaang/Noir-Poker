"use client";
import { useEffect, useState } from "react";
import {
  subscribeNormalRoom,
  subscribeNormalLobby,
  subscribeNormalHole,
  type NormalRoomDoc,
  type NormalHoleDoc,
} from "@/lib/normalRooms";
import type { LobbyPlayer } from "@/lib/rooms";

export function useNormalRoom(code: string | null) {
  const [room, setRoom] = useState<NormalRoomDoc | null | undefined>(undefined);
  useEffect(() => {
    if (!code) { setRoom(null); return; }
    return subscribeNormalRoom(code, setRoom);
  }, [code]);
  return room;
}

export function useNormalLobby(code: string | null): LobbyPlayer[] {
  const [list, setList] = useState<LobbyPlayer[]>([]);
  useEffect(() => {
    if (!code) { setList([]); return; }
    return subscribeNormalLobby(code, setList);
  }, [code]);
  return list;
}

export function useNormalHole(code: string | null, seatId: string | null) {
  const [hole, setHole] = useState<NormalHoleDoc | null | undefined>(undefined);
  useEffect(() => {
    if (!code || !seatId) { setHole(null); return; }
    return subscribeNormalHole(code, seatId, setHole);
  }, [code, seatId]);
  return hole;
}
