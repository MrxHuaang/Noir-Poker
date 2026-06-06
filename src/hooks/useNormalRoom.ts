"use client";
import { useEffect, useRef, useState } from "react";
import {
  subscribeNormalRoom,
  subscribeNormalLobby,
  subscribeNormalHole,
  subscribeOpenRooms,
  subscribeQueue,
  ROOM_LIVE_WINDOW_MS,
  type NormalRoomDoc,
  type NormalLobbyPlayer,
  type OpenRoomSummary,
  type QueueEntry,
} from "@/lib/normalRooms";
import {
  subscribeStackRequests,
  type StackRequest,
} from "@/lib/stackRequests";
import { decryptMyCards } from "@/lib/holeCrypto";
import type { Card } from "@/lib/poker";

// Decrypted hole as consumed by the UI. Always plaintext cards once resolved.
type DecryptedHole = { ownerUid: string | null; cards: [Card, Card] };

// Retry delays on subscription error (ms). Grows exponentially up to ~30s.
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];

export function useNormalRoom(code: string | null) {
  const [room, setRoom] = useState<NormalRoomDoc | null | undefined>(undefined);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!code) return;
    retryRef.current = 0;

    let unsub: (() => void) | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      unsub = subscribeNormalRoom(
        code!,
        (doc) => {
          if (!cancelled) {
            retryRef.current = 0; // reset retry counter on successful data
            setRoom(doc);
          }
        },
        () => {
          // Error: subscription terminated. Retry with backoff so the player
          // doesn't get permanently stuck if the connection is momentarily lost.
          if (cancelled) return;
          const delay = RETRY_DELAYS[Math.min(retryRef.current, RETRY_DELAYS.length - 1)];
          retryRef.current++;
          timerRef.current = setTimeout(() => {
            unsub?.();
            connect();
          }, delay);
        },
      );
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
      unsub?.();
    };
  }, [code]);

  return code ? room : null;
}

export function useNormalLobby(code: string | null): NormalLobbyPlayer[] {
  const [list, setList] = useState<NormalLobbyPlayer[]>([]);
  useEffect(() => {
    if (!code) return;
    return subscribeNormalLobby(code, setList);
  }, [code]);
  return code ? list : [];
}

// Lobby: live public rooms. `ready` is false until the first snapshot arrives
// so the UI can distinguish "loading" from a genuinely empty lobby. Liveness is
// gated here on a timer so a host that closed its tab drops off within the live
// window even though Firestore fires no new snapshot for it.
export function useOpenRooms(
  enabled = true,
): { rooms: OpenRoomSummary[]; ready: boolean } {
  const [all, setAll] = useState<OpenRoomSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // The collection query requires a signed-in user; wait until enabled so the
    // listener doesn't attach before anonymous auth resolves (permission error).
    if (!enabled) return;
    const unsub = subscribeOpenRooms((r) => {
      setAll(r);
      setReady(true);
    });
    const tick = setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      unsub();
      clearInterval(tick);
    };
  }, [enabled]);
  const rooms = all.filter((r) => now - r.hostHeartbeat < ROOM_LIVE_WINDOW_MS);
  return { rooms, ready };
}

// Wait queue for a room. `position` is the caller's 1-based spot, or 0 if not
// queued. The host uses `queue` to auto-seat the head when a seat frees.
export function useQueue(
  code: string | null,
  uid: string | null,
): { queue: QueueEntry[]; position: number } {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  useEffect(() => {
    if (!code) return;
    return subscribeQueue(code, setQueue);
  }, [code]);
  const safeQueue = code ? queue : [];
  const idx = uid ? safeQueue.findIndex((q) => q.uid === uid) : -1;
  return { queue: safeQueue, position: idx < 0 ? 0 : idx + 1 };
}

export function useStackRequests(code: string | null): StackRequest[] {
  const [reqs, setReqs] = useState<StackRequest[]>([]);
  useEffect(() => {
    if (!code) return;
    return subscribeStackRequests(code, setReqs);
  }, [code]);
  return code ? reqs : [];
}

// Subscribes to this device's own hole doc and resolves it to plaintext cards.
// `seatId` is always the caller's own uid, so the private key needed to decrypt
// lives in this device's localStorage. Encrypted docs are decrypted async;
// legacy/fallback plaintext docs pass through unchanged.
export function useNormalHole(
  code: string | null,
  seatId: string | null,
  privateKeyUid?: string | null,
) {
  const [hole, setHole] = useState<DecryptedHole | null | undefined>(undefined);
  useEffect(() => {
    if (!code || !seatId) return;
    let cancelled = false;
    const unsub = subscribeNormalHole(code, seatId, (doc) => {
      if (!doc) { if (!cancelled) setHole(null); return; }
      if (doc.cards) {
        if (!cancelled) setHole({ ownerUid: doc.ownerUid, cards: doc.cards });
        return;
      }
      if (doc.enc) {
        decryptMyCards(doc.ownerUid ?? privateKeyUid ?? seatId, doc.enc).then((cards) => {
          if (!cancelled) {
            setHole(cards ? { ownerUid: doc.ownerUid, cards } : null);
          }
        });
        return;
      }
      if (!cancelled) setHole(null);
    });
    return () => { cancelled = true; unsub(); };
  }, [code, seatId, privateKeyUid]);
  return code && seatId ? hole : null;
}
