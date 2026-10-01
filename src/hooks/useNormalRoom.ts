"use client";
import { useEffect, useRef, useState } from "react";
import {
  subscribeNormalRoom,
  subscribeNormalLobby,
  subscribeNormalLobbyState,
  subscribeNormalHole,
  subscribeQueue,
  type NormalRoomDoc,
  type NormalLobbyPlayer,
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

const NO_PLAYERS: NormalLobbyPlayer[] = [];

// Lobby with a readiness flag, for the host. `ready` is true only while the
// list reflects a successful snapshot: before the first one and after a
// listener error it is false (the last good list is kept) and the listener is
// retried with backoff. The host must not read "missing from the lobby" as
// "left the table" unless `ready` is true.
export function useNormalLobbyState(
  code: string | null,
): { players: NormalLobbyPlayer[]; ready: boolean } {
  const [state, setState] = useState<{
    code: string | null;
    players: NormalLobbyPlayer[];
    ready: boolean;
  }>({ code: null, players: [], ready: false });
  const retryRef = useRef(0);

  useEffect(() => {
    if (!code) return;
    retryRef.current = 0;
    let unsub: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      unsub = subscribeNormalLobbyState(
        code!,
        (players) => {
          if (cancelled) return;
          retryRef.current = 0;
          setState({ code, players, ready: true });
        },
        () => {
          if (cancelled) return;
          setState((prev) => ({ ...prev, ready: false }));
          const delay = RETRY_DELAYS[Math.min(retryRef.current, RETRY_DELAYS.length - 1)];
          retryRef.current++;
          timer = setTimeout(() => {
            unsub?.();
            connect();
          }, delay);
        },
      );
    }

    connect();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsub?.();
    };
  }, [code]);

  if (!code || state.code !== code) return { players: NO_PLAYERS, ready: false };
  return { players: state.players, ready: state.ready };
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
