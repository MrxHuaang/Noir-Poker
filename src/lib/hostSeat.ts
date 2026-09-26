"use client";
// The host taking a seat at its own normal/torneo table. In a coins room the
// seat is backed by a real buy-in (escrow) exactly like any other player: the
// host used to get a free starting stack it could later cash out, i.e. other
// players' coins. Casual rooms keep the free stack.
import { callEconomy } from "./economyClient";
import { approveJoin } from "./normalRooms";

export async function seatHost({
  code,
  uid,
  name,
  seed,
  amount,
  slot,
  coins,
  isGuest,
  getToken,
}: {
  code: string;
  uid: string;
  name: string;
  seed: string;
  amount: number;
  slot?: number;
  coins: boolean;
  isGuest: boolean;
  getToken: () => Promise<string | null>;
}): Promise<void> {
  if (!coins) {
    await approveJoin(code, uid, name, seed, amount, slot);
    return;
  }
  if (isGuest) throw new Error("Inicia sesion para jugar en una mesa con monedas.");
  const token = await getToken();
  if (!token) throw new Error("Sesion no disponible.");
  await callEconomy(token, "buy-in", { code, amount });
  try {
    await approveJoin(code, uid, name, seed, amount, slot);
  } catch (err) {
    // The escrow never reached the table: the server refunds it.
    await callEconomy(token, "refund", { code, amount }).catch(() => {});
    throw err;
  }
}

// The host leaving the room: settle its own seat first (coins rooms). The
// server pays the host's stack and removes its lobby entry.
export async function cashOutHost(
  code: string,
  getToken: () => Promise<string | null>,
): Promise<void> {
  const token = await getToken();
  if (!token) return;
  await callEconomy(token, "cash-out", { code });
}
