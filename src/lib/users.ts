"use client";
// Perfil persistente de usuario (cuenta) + economia de monedas.
// Coleccion users/{uid}; subcoleccion users/{uid}/history para el historial.
//
// AUTORIDAD SERVER-SIDE: todas las mutaciones de monedas/XP/stats pasan por
// /api/economy (Firebase Admin SDK en una Route de Next.js, gratis en Vercel).
// El cliente NO puede escribir coins/xp/escrows/stats directamente (lo bloquean
// las reglas de Firestore). Aqui solo quedan: lecturas, edicion de perfil
// (apodo/avatar, permitida por reglas) y los wrappers fetch de las mutaciones.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDb, getFirebaseAuth } from "./firebase";
import { levelFromXp, titleForLevel } from "./progression";

export type AuthProvider = "google" | "github" | "anonymous";

export type UserProfile = {
  uid: string;
  provider: AuthProvider;
  displayName: string;
  nickname: string;
  photoURL: string | null;
  avatarSeed: string;
  // El email NO vive en Firestore: se lee del Auth record (user.email), solo
  // accesible por el dueno. Asi no se expone a otros usuarios.
  createdAt: number;
  // Economia
  coins: number;
  escrows: Record<string, number>;
  lastDailyBonus: number;
  // Progresion
  xp: number;
  level: number;
  title: string;
  // Stats de cuenta
  gamesPlayed: number;
  handsPlayed: number;
  handsWon: number;
  biggestPot: number;
};

export type HistoryRecord = {
  id: string;
  ts: number;
  code: string;
  roomName: string;
  handsPlayed: number;
  handsWon: number;
  net: number; // ganancia/perdida de fichas en la sesion
  xpGained: number;
};

const HISTORY_CAP = 100;

function userRef(uid: string) {
  return doc(getDb(), "users", uid);
}

// --- Cliente -> API server-side de economia ---

// Llama a /api/economy con el idToken del usuario actual. El servidor deriva el
// uid del token; `expectedUid` es una verificacion defensiva en el cliente.
// Lanza con el mensaje del servidor si la respuesta no es 2xx.
async function callEconomy<T>(
  action: string,
  payload: Record<string, unknown> = {},
  expectedUid?: string,
): Promise<T> {
  const current = getFirebaseAuth().currentUser;
  if (!current) throw new Error("No autenticado");
  if (expectedUid && current.uid !== expectedUid) {
    throw new Error("Sesion no coincide");
  }
  const token = await current.getIdToken();
  const res = await fetch("/api/economy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((data.error as string) ?? "Error de economia");
  }
  return data as T;
}

// --- Lecturas (client SDK) ---

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(userRef(uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export function subscribeUserProfile(
  uid: string,
  cb: (profile: UserProfile | null) => void,
): () => void {
  return onSnapshot(
    userRef(uid),
    (snap) => cb(snap.exists() ? (snap.data() as UserProfile) : null),
    () => cb(null),
  );
}

export async function getHistory(uid: string): Promise<HistoryRecord[]> {
  const q = query(
    collection(getDb(), "users", uid, "history"),
    orderBy("ts", "desc"),
    limit(HISTORY_CAP),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as HistoryRecord);
}

// --- Edicion de perfil (permitida al cliente por las reglas) ---

export async function updateProfileFields(
  uid: string,
  fields: Partial<Pick<UserProfile, "nickname" | "displayName" | "avatarSeed">>,
): Promise<void> {
  await updateDoc(userRef(uid), fields as Record<string, unknown>);
}

// --- Mutaciones de economia (via API server-side) ---

// Crea/actualiza el perfil (grant inicial, bono diario, rescate). Idempotente.
export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const token = await user.getIdToken();
  const res = await fetch("/api/economy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: "ensure-profile" }),
  });
  const data = (await res.json().catch(() => ({}))) as { profile?: UserProfile; error?: string };
  if (!res.ok || !data.profile) {
    throw new Error(data.error ?? "No se pudo crear el perfil");
  }
  return data.profile;
}

export async function claimDailyBonus(uid: string): Promise<number> {
  const { granted } = await callEconomy<{ granted: number }>("daily-bonus", {}, uid);
  return granted;
}

export async function buyIn(uid: string, code: string, amount: number): Promise<number> {
  const { coins } = await callEconomy<{ coins: number }>("buy-in", { code, amount }, uid);
  return coins;
}

export async function refundBuyIn(uid: string, code: string, amount: number): Promise<void> {
  await callEconomy("refund", { code, amount }, uid);
}

// `finalChips` se ignora: el servidor lee lobby.chips (autoridad del host).
// Se conserva el parametro por compatibilidad con los call sites existentes.
export async function cashOut(
  uid: string,
  code: string,
  _finalChips: number,
): Promise<number | null> {
  void _finalChips;
  const { coins } = await callEconomy<{ coins: number | null }>("cash-out", { code }, uid);
  return coins;
}

export async function reconcileEscrows(uid: string): Promise<void> {
  await callEconomy("reconcile-escrows", {}, uid);
}

export async function recordSession(
  uid: string,
  data: {
    code: string;
    roomName: string;
    handsPlayed: number;
    handsWon: number;
    net: number;
    biggestPot: number;
    xpGained: number; // ignorado por el servidor: el XP se recalcula server-side
  },
): Promise<void> {
  await callEconomy("record-session", { session: data }, uid);
}

// Mantiene level/title consistentes si se migra xp manualmente (util/testing).
export function reconcileLevel(profile: UserProfile): UserProfile {
  const level = levelFromXp(profile.xp);
  return { ...profile, level, title: titleForLevel(level) };
}
