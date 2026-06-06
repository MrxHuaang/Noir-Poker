// Economia de monedas finitas. Wallet en users/{uid}.coins.
// Las transacciones de buy-in / cash-out viven en users.ts (necesitan Firestore).
// Aqui: constantes + helpers puros de reposicion (grant inicial, bono diario, rescate).

export const STARTING_COINS = 10_000;
export const DAILY_BONUS = 2_000;
export const DAILY_BONUS_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const BUST_RESCUE_THRESHOLD = 1_000;
export const BUST_RESCUE_TARGET = 1_000;

type Wallet = {
  coins: number;
  lastDailyBonus: number;
  escrows: Record<string, number>;
};

// Total bloqueado en salas activas (no disponible para nuevos buy-ins).
export function escrowedTotal(escrows: Record<string, number> | undefined): number {
  if (!escrows) return 0;
  return Object.values(escrows).reduce((s, n) => s + (n > 0 ? n : 0), 0);
}

// Saldo gastable = monedas libres (los escrows ya estan descontados de coins).
export function availableCoins(wallet: Pick<Wallet, "coins">): number {
  return Math.max(0, Math.floor(wallet.coins));
}

// Tope de pago por sala. Una partida de dinero es de suma cero: el total que
// SALE de una sala (cash-outs) nunca puede exceder lo que ENTRO (buy-ins).
// El host es la autoridad de los stacks (lobby.chips), pero esa autoridad no
// puede acunar monedas: aunque infle el stack de un jugador, el credito se
// recorta a lo que queda del bote real de la sala (totalIn - totalOut). El host
// puede decidir quien gana o pierde, no crear monedas de la nada.
export function cappedCredit(
  desired: number,
  totalIn: number,
  totalOut: number,
): number {
  const remaining = Math.max(0, Math.floor(totalIn) - Math.floor(totalOut));
  const want = Math.max(0, Math.floor(Number.isFinite(desired) ? desired : 0));
  return Math.min(want, remaining);
}

// Manos acreditables para XP/stats en esta llamada. La verdad es el conteo
// server-side de manos de la sala donde el jugador participo (subcoleccion
// hands, escribible SOLO por el host); el cliente no decide cuantas manos jugo.
// El marcador `alreadyCredited` (por sala) evita re-acreditar manos ya contadas
// en sesiones previas: solo se otorga el delta. Asi el XP no se puede forjar
// repitiendo record-session ni inflando handsPlayed.
export function creditableHands(verifiedTotal: number, alreadyCredited: number): number {
  return Math.max(0, Math.floor(verifiedTotal) - Math.max(0, Math.floor(alreadyCredited)));
}

export function dailyBonusReady(lastDailyBonus: number, now: number): boolean {
  return now - lastDailyBonus >= DAILY_BONUS_INTERVAL_MS;
}

// Aplica el bono diario si toca. Devuelve el wallet (posiblemente sin cambios).
export function applyDailyBonus<T extends Pick<Wallet, "coins" | "lastDailyBonus">>(
  wallet: T,
  now: number,
): { wallet: T; granted: number } {
  if (!dailyBonusReady(wallet.lastDailyBonus, now)) {
    return { wallet, granted: 0 };
  }
  return {
    wallet: { ...wallet, coins: wallet.coins + DAILY_BONUS, lastDailyBonus: now },
    granted: DAILY_BONUS,
  };
}

// Rescate por quiebra: solo si el saldo libre esta por debajo del umbral
// Y no hay monedas atrapadas en escrows (no rescatamos a quien tiene stack en juego).
export function applyBustRescue<T extends Wallet>(
  wallet: T,
): { wallet: T; granted: number } {
  const locked = escrowedTotal(wallet.escrows);
  if (locked > 0 || wallet.coins >= BUST_RESCUE_THRESHOLD) {
    return { wallet, granted: 0 };
  }
  const granted = BUST_RESCUE_TARGET - wallet.coins;
  return { wallet: { ...wallet, coins: BUST_RESCUE_TARGET }, granted };
}
