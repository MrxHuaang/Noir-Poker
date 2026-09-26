"use client";
import {
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "./firebase";
import type { NormalLobbyPlayer } from "./normalRooms";

export type StackRequestType = "join" | "rebuy";
export type StackRequestStatus = "pending" | "approved" | "rejected";

export type StackRequest = {
  uid: string;
  name: string;
  seed: string;
  requestedStack: number;
  type: StackRequestType;
  status: StackRequestStatus;
  rejectionReason?: string;
  ts: number;
};

export async function submitStackRequest(
  code: string,
  req: Omit<StackRequest, "status">,
): Promise<void> {
  const db = getDb();
  await setDoc(doc(db, "normalRooms", code, "stackRequests", req.uid), {
    ...req,
    status: "pending",
  });
}

export function subscribeStackRequests(
  code: string,
  cb: (reqs: StackRequest[]) => void,
): () => void {
  const db = getDb();
  const q = query(
    collection(db, "normalRooms", code, "stackRequests"),
    orderBy("ts", "asc"),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as StackRequest)),
    () => cb([]),
  );
}

export function subscribeMyStackRequest(
  code: string,
  uid: string,
  cb: (req: StackRequest | null) => void,
): () => void {
  const db = getDb();
  return onSnapshot(
    doc(db, "normalRooms", code, "stackRequests", uid),
    (snap) => cb(snap.exists() ? (snap.data() as StackRequest) : null),
    () => cb(null),
  );
}

export async function rejectStackRequest(
  code: string,
  uid: string,
  reason?: string,
): Promise<void> {
  const db = getDb();
  await updateDoc(doc(db, "normalRooms", code, "stackRequests", uid), {
    status: "rejected",
    rejectionReason: reason ?? "",
  });
}

export async function dismissStackRequest(
  code: string,
  uid: string,
): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, "normalRooms", code, "stackRequests", uid));
}

// Host approval, atomic with the request doc: the request must still exist and
// be pending when the seat / rebuy is granted. A player who cancelled (the
// economy server refunds the escrow and deletes the request) can therefore
// never be seated with chips they no longer paid for; the transaction aborts
// (or retries and aborts) if the request or the player's wallet changes
// underneath it.
//
// Coins rooms: the granted amount is exactly the requested (escrowed) stack
// and the requester's escrow for this room must cover it.
export async function approveStackRequest(
  code: string,
  uid: string,
  amount: number,
  opts: { coins: boolean },
): Promise<void> {
  const db = getDb();
  await runTransaction(db, async (tx) => {
    const reqRef = doc(db, "normalRooms", code, "stackRequests", uid);
    const lobbyRef = doc(db, "normalRooms", code, "lobby", uid);
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists()) throw new Error("La solicitud ya no existe");
    const req = reqSnap.data() as StackRequest;
    if (req.status !== "pending") throw new Error("La solicitud ya no esta pendiente");
    const lobbySnap = await tx.get(lobbyRef);

    let chips = Math.max(1, Math.floor(amount));
    if (opts.coins) {
      chips = Math.floor(req.requestedStack);
      const userSnap = await tx.get(doc(db, "users", uid));
      const escrows = userSnap.exists()
        ? ((userSnap.data() as { escrows?: Record<string, number> }).escrows ?? {})
        : {};
      if (!(chips > 0) || (escrows[code] ?? 0) < chips) {
        throw new Error("La entrada no esta respaldada por monedas en garantia");
      }
    }

    if (req.type === "join") {
      if (lobbySnap.exists()) throw new Error("El jugador ya esta sentado");
      const player: NormalLobbyPlayer = {
        uid,
        name: req.name,
        seed: req.seed,
        joinedAt: Date.now(),
        chips,
        sittingOut: false,
      };
      tx.set(lobbyRef, player);
    } else {
      if (!lobbySnap.exists()) throw new Error("El jugador ya no esta en la mesa");
      // Adds to any rebuy already approved and not yet applied.
      tx.update(doc(db, "normalRooms", code), {
        [`pendingRebuys.${uid}`]: increment(chips),
      });
    }
    tx.delete(reqRef);
  });
}
