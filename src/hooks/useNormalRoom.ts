"use client";
import { useEffect, useState } from "react";
import {
  subscribeNormalRoom,
  subscribeNormalLobby,
  subscribeNormalHole,
  type NormalRoomDoc,
  type NormalLobbyPlayer,
} from "@/lib/normalRooms";
import {
  subscribeStackRequests,
  type StackRequest,
} from "@/lib/stackRequests";
import { decryptMyCards } from "@/lib/holeCrypto";
import type { Card } from "@/lib/poker";

// Decrypted hole as consumed by the UI. Always plaintext cards once resolved.
type DecryptedHole = { ownerUid: string | null; cards: [Card, Card] };

export function useNormalRoom(code: string | null) {
  const [room, setRoom] = useState<NormalRoomDoc | null | undefined>(undefined);
  useEffect(() => {
    if (!code) { setRoom(null); return; }
    return subscribeNormalRoom(code, setRoom);
  }, [code]);
  return room;
}

export function useNormalLobby(code: string | null): NormalLobbyPlayer[] {
  const [list, setList] = useState<NormalLobbyPlayer[]>([]);
  useEffect(() => {
    if (!code) { setList([]); return; }
    return subscribeNormalLobby(code, setList);
  }, [code]);
  return list;
}

export function useStackRequests(code: string | null): StackRequest[] {
  const [reqs, setReqs] = useState<StackRequest[]>([]);
  useEffect(() => {
    if (!code) { setReqs([]); return; }
    return subscribeStackRequests(code, setReqs);
  }, [code]);
  return reqs;
}

// Subscribes to this device's own hole doc and resolves it to plaintext cards.
// `seatId` is always the caller's own uid, so the private key needed to decrypt
// lives in this device's localStorage. Encrypted docs are decrypted async;
// legacy/fallback plaintext docs pass through unchanged.
export function useNormalHole(code: string | null, seatId: string | null) {
  const [hole, setHole] = useState<DecryptedHole | null | undefined>(undefined);
  useEffect(() => {
    if (!code || !seatId) { setHole(null); return; }
    let cancelled = false;
    const unsub = subscribeNormalHole(code, seatId, (doc) => {
      if (!doc) { if (!cancelled) setHole(null); return; }
      if (doc.cards) {
        if (!cancelled) setHole({ ownerUid: doc.ownerUid, cards: doc.cards });
        return;
      }
      if (doc.enc) {
        decryptMyCards(seatId, doc.enc).then((cards) => {
          if (!cancelled) {
            setHole(cards ? { ownerUid: doc.ownerUid, cards } : null);
          }
        });
        return;
      }
      if (!cancelled) setHole(null);
    });
    return () => { cancelled = true; unsub(); };
  }, [code, seatId]);
  return hole;
}
