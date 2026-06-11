// Logica de economia/progresion del lado SERVIDOR (Admin SDK).
// Es la unica autoridad que escribe coins/escrows/xp/stats. Replica las
// transacciones que antes corrian en el cliente (users.ts), pero ahora con
// privilegios de servidor, derivando el uid del idToken verificado.
//
// Reglas de integridad reforzadas aqui (no en el cliente):
//   - buy-in: descuenta solo si hay saldo; monto acotado.
//   - cash-out: lee lobby.chips (autoridad del host), NO un valor del cliente.
//   - record-session: el XP se RECALCULA server-side con sessionXp(); el cliente
//     no puede inflarlo. handsPlayed/handsWon se acotan.
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "./firebaseAdmin";
import {
  STARTING_COINS,
  applyBustRescue,
  applyDailyBonus,
  cappedCredit,
  creditableHands,
} from "./economy";
import { addXp, titleForLevel, sessionXp } from "./progression";

const MAX_BUYIN = 1_000_000; // coherente con el tope de stackRequests
const MAX_HANDS_PER_SESSION = 10_000; // cota anti-inflado de XP/stats
const HISTORY_CAP = 100;

type AuthProvider = "google" | "github" | "anonymous";

export type UserProfile = {
  uid: string;
  provider: AuthProvider;
  displayName: string;
  nickname: string;
  photoURL: string | null;
  avatarSeed: string;
  // El email NO se guarda en Firestore (vive solo en el Auth record, accesible
  // por el dueno via user.email). Evita exponerlo a otros usuarios.
  createdAt: number;
  coins: number;
  escrows: Record<string, number>;
  // Modo de cada escrow ("normal" | "online"). reconcileEscrows no auto-reembolsa
  // los online (no tienen lobby en normalRooms; los liquida el cash-out al salir).
  escrowModes?: Record<string, string>;
  lastDailyBonus: number;
  xp: number;
  level: number;
  title: string;
  gamesPlayed: number;
  handsPlayed: number;
  handsWon: number;
  biggestPot: number;
};

function userRef(uid: string) {
  return adminDb().collection("users").doc(uid);
}

// Libro de la sala (autoridad del servidor; el cliente no puede leerlo ni
// escribirlo, ver firestore.rules). Hace cumplir la suma cero: el total pagado
// (cash-outs) nunca excede el total comprometido (buy-ins) de la sala.
type RoomLedger = { totalIn: number; totalOut: number };

function ledgerRef(code: string) {
  return adminDb().collection("roomLedgers").doc(code);
}

function readLedger(snap: FirebaseFirestore.DocumentSnapshot): RoomLedger {
  const d = (snap.exists ? snap.data() : null) as Partial<RoomLedger> | null;
  return {
    totalIn: Math.max(0, Math.floor(d?.totalIn ?? 0)),
    totalOut: Math.max(0, Math.floor(d?.totalOut ?? 0)),
  };
}

function randomSeed(): string {
  // Semilla de avatar simple, server-side (no depende de crypto del browser).
  return Math.floor(Math.random() * 1e9).toString(36) + Date.now().toString(36);
}

function providerOf(providerId: string): AuthProvider {
  if (providerId.includes("google")) return "google";
  if (providerId.includes("github")) return "github";
  return "anonymous";
}

// Crea el perfil si no existe (grant inicial) y aplica bono diario + rescate.
// Idempotente; el cliente lo invoca en cada login. Devuelve el perfil vigente.
export async function ensureProfile(uid: string): Promise<UserProfile> {
  const ref = userRef(uid);
  const userRecord = await adminAuth().getUser(uid);
  const providerId = userRecord.providerData[0]?.providerId ?? "";
  const provider = providerOf(providerId);
  const now = Date.now();

  const snap = await ref.get();
  if (!snap.exists) {
    const profile: UserProfile = {
      uid,
      provider,
      displayName: userRecord.displayName ?? "Jugador",
      nickname: userRecord.displayName ?? "Jugador",
      photoURL: userRecord.photoURL ?? null,
      avatarSeed: randomSeed(),
      createdAt: now,
      coins: STARTING_COINS,
      escrows: {},
      lastDailyBonus: now, // el bono no aplica el primer dia
      xp: 0,
      level: 1,
      title: titleForLevel(1),
      gamesPlayed: 0,
      handsPlayed: 0,
      handsWon: 0,
      biggestPot: 0,
    };
    await ref.set(profile);
    return profile;
  }

  const raw = snap.data() as Record<string, unknown>;
  let profile = snap.data() as UserProfile;
  const patch: Record<string, unknown> = {};

  // Migracion: borrar el email de docs antiguos (antes vivia en el doc
  // publico, legible por terceros). Ahora el email solo vive en el Auth record.
  if ("email" in raw) {
    patch.email = FieldValue.delete();
  }

  // Al enlazar cuenta social sobre la anonima, traer datos del proveedor.
  if (provider !== "anonymous") {
    if (profile.provider === "anonymous") patch.provider = provider;
    if (userRecord.photoURL && !profile.photoURL) patch.photoURL = userRecord.photoURL;
    if (
      userRecord.displayName &&
      (profile.displayName === "Jugador" || !profile.displayName)
    ) {
      patch.displayName = userRecord.displayName;
      if (profile.nickname === "Jugador" || !profile.nickname) {
        patch.nickname = userRecord.displayName;
      }
    }
  }

  const daily = applyDailyBonus(profile, now);
  if (daily.granted > 0) {
    profile = daily.wallet;
    patch.coins = profile.coins;
    patch.lastDailyBonus = profile.lastDailyBonus;
  }

  const rescue = applyBustRescue(profile);
  if (rescue.granted > 0) {
    profile = rescue.wallet;
    patch.coins = profile.coins;
  }

  if (Object.keys(patch).length > 0) {
    await ref.update(patch);
    // No reflejar el FieldValue.delete() sentinel en el objeto devuelto.
    const { email: _drop, ...rest } = patch as Record<string, unknown> & { email?: unknown };
    void _drop;
    profile = { ...profile, ...rest } as UserProfile;
  }
  return profile;
}

export async function claimDailyBonus(uid: string): Promise<number> {
  const ref = userRef(uid);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 0;
    const p = snap.data() as UserProfile;
    const { wallet, granted } = applyDailyBonus(p, Date.now());
    if (granted > 0) {
      tx.update(ref, { coins: wallet.coins, lastDailyBonus: wallet.lastDailyBonus });
    }
    return granted;
  });
}

export type RoomMode = "normal" | "online";

export async function buyIn(
  uid: string,
  code: string,
  amount: number,
  mode: RoomMode = "normal",
): Promise<number> {
  const amt = Math.floor(amount);
  if (!(amt > 0) || amt > MAX_BUYIN) throw new Error("Monto invalido");
  // Las salas con monedas exigen cuenta real: un invitado anonimo que pierde
  // el wallet lo "resetea" cerrando la pestana (cuenta nueva = grant nuevo).
  const userRecord = await adminAuth().getUser(uid);
  if ((userRecord.providerData?.length ?? 0) === 0) {
    throw new Error("Cuenta de invitado");
  }
  const ref = userRef(uid);
  const lref = ledgerRef(code);
  return adminDb().runTransaction(async (tx) => {
    // Lecturas antes de escrituras (requisito de las transacciones Firestore).
    const [snap, lsnap] = await Promise.all([tx.get(ref), tx.get(lref)]);
    if (!snap.exists) throw new Error("Perfil inexistente");
    const p = snap.data() as UserProfile;
    const escrows = { ...(p.escrows ?? {}) };
    const escrowModes = { ...(p.escrowModes ?? {}) };
    if (p.coins < amt) throw new Error("Saldo insuficiente");
    escrows[code] = (escrows[code] ?? 0) + amt;
    escrowModes[code] = mode; // recordar el modo: reconcile trata online distinto
    const coins = p.coins - amt;
    const ledger = readLedger(lsnap);
    // El buy-in entra al bote de la sala.
    tx.set(lref, { totalIn: ledger.totalIn + amt, totalOut: ledger.totalOut }, { merge: true });
    tx.update(ref, { coins, escrows, escrowModes });
    return coins;
  });
}

export async function refundBuyIn(uid: string, code: string, amount: number): Promise<void> {
  const amt = Math.max(0, Math.floor(amount));
  if (amt === 0) return;
  const ref = userRef(uid);
  const lref = ledgerRef(code);
  await adminDb().runTransaction(async (tx) => {
    const [snap, lsnap] = await Promise.all([tx.get(ref), tx.get(lref)]);
    if (!snap.exists) return;
    const p = snap.data() as UserProfile;
    const escrows = { ...(p.escrows ?? {}) };
    const current = escrows[code] ?? 0;
    if (current <= 0) return; // nada comprometido: no acunar
    // No devolver mas de lo que realmente esta en escrow para esta sala.
    const give = Math.min(amt, current);
    const remaining = current - give;
    const escrowModes = { ...(p.escrowModes ?? {}) };
    if (remaining > 0) escrows[code] = remaining;
    else {
      delete escrows[code];
      delete escrowModes[code];
    }
    // El reembolso saca esas monedas del bote: nunca jugaron. El nuevo totalIn
    // nunca baja de totalOut: lo ya pagado por cash-out es un piso, de lo
    // contrario el tope (totalIn - totalOut) quedaria negativo y se desincroniza.
    const ledger = readLedger(lsnap);
    const newTotalIn = Math.max(ledger.totalOut, ledger.totalIn - give);
    tx.set(lref, { totalIn: newTotalIn }, { merge: true });
    tx.update(ref, { coins: p.coins + give, escrows, escrowModes });
  });
}

// Lee el stack final de un jugador en una sala online directamente del servidor
// Go (GET /stacks), que es la autoridad del juego. Devuelve null si el servidor
// no responde o la sala ya expiro (fallback conservador: devolver el escrow).
async function fetchOnlineStack(code: string, uid: string): Promise<number | null> {
  const base = process.env.GAME_SERVER_URL || process.env.NEXT_PUBLIC_GAME_WS_URL;
  if (!base) return null;
  try {
    const url = `${base.replace(/\/$/, "")}/stacks?room=${encodeURIComponent(code)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { stacks?: Record<string, number> };
    const chips = data.stacks?.[uid];
    return typeof chips === "number" ? Math.max(0, Math.floor(chips)) : null;
  } catch {
    return null;
  }
}

// Cash-out autoritativo. La autoridad de stacks depende del modo de la sala:
//   - normal: lobby.chips lo controla el host.
//   - online: el servidor Go reporta el stack final via GET /stacks.
// Ninguna autoridad puede acunar monedas: el credito se recorta al bote real de
// la sala (totalIn - totalOut) via cappedCredit. Asi se reparte quien gana o
// pierde, pero el total que sale de la sala jamas supera lo que entro. Si la
// sala no tiene libro (creada antes de esta version), el tope conservador es el
// propio escrow del jugador: nunca paga mas de lo que ese jugador aporto.
export async function cashOut(uid: string, code: string): Promise<number | null> {
  const db = adminDb();
  const ref = userRef(uid);

  // Determinar el modo del escrow antes de la transaccion (los fetch externos
  // no pueden vivir dentro de ella).
  const preSnap = await ref.get();
  if (!preSnap.exists) return null;
  const pre = preSnap.data() as UserProfile;
  if (!(code in (pre.escrows ?? {}))) return null; // ya liquidado
  const isOnline = pre.escrowModes?.[code] === "online";

  let authorityChips: number | null = null;
  if (isOnline) {
    authorityChips = await fetchOnlineStack(code, uid);
  } else {
    const lobbySnap = await db
      .collection("normalRooms").doc(code)
      .collection("lobby").doc(uid)
      .get();
    authorityChips = lobbySnap.exists
      ? Math.max(0, Math.floor((lobbySnap.data() as { chips?: number }).chips ?? 0))
      : null;
  }
  const lobbyChips = authorityChips;
  const lref = ledgerRef(code);
  return db.runTransaction(async (tx) => {
    const [snap, lsnap] = await Promise.all([tx.get(ref), tx.get(lref)]);
    if (!snap.exists) return null;
    const p = snap.data() as UserProfile;
    const escrows = { ...(p.escrows ?? {}) };
    if (!(code in escrows)) return null; // ya liquidado
    const ownEscrow = Math.max(0, escrows[code] ?? 0);
    // Si hay lobby, la verdad del host manda; si no, devolver el escrow.
    const desired = lobbyChips ?? ownEscrow;

    let credit: number;
    if (lsnap.exists) {
      const ledger = readLedger(lsnap);
      credit = cappedCredit(desired, ledger.totalIn, ledger.totalOut);
      tx.set(lref, { totalOut: ledger.totalOut + credit }, { merge: true });
    } else {
      // Sala legacy sin libro: tope conservador al propio aporte del jugador.
      credit = Math.min(Math.max(0, Math.floor(desired)), ownEscrow);
    }

    const escrowModes = { ...(p.escrowModes ?? {}) };
    delete escrows[code];
    delete escrowModes[code];
    const coins = p.coins + credit;
    tx.update(ref, { coins, escrows, escrowModes });
    return coins;
  });
}

// Libera escrows huerfanos: salas donde el jugador ya no esta en el lobby ni
// tiene una solicitud pendiente. Devuelve el monto EXACTO del escrow.
export async function reconcileEscrows(uid: string): Promise<void> {
  const db = adminDb();
  const ref = userRef(uid);
  const snap = await ref.get();
  if (!snap.exists) return;
  const p = snap.data() as UserProfile;
  const escrows = p.escrows ?? {};
  const escrowModes = p.escrowModes ?? {};
  const codes = Object.keys(escrows).filter((c) => (escrows[c] ?? 0) > 0);
  for (const code of codes) {
    // Los escrows de salas online no tienen lobby en normalRooms; usar la
    // ausencia de lobby como senal de "huerfano" los reembolsaria por error
    // mientras el jugador sigue en la mesa (BUG-N1). El cash-out al salir los
    // liquida; reconcile solo limpia salas normal-mode.
    if (escrowModes[code] === "online") continue;
    try {
      const lobbySnap = await db
        .collection("normalRooms").doc(code).collection("lobby").doc(uid).get();
      if (lobbySnap.exists) continue;
      const reqSnap = await db
        .collection("normalRooms").doc(code).collection("stackRequests").doc(uid).get();
      if (reqSnap.exists && (reqSnap.data() as { status?: string }).status === "pending") {
        continue;
      }
      const amt = escrows[code] ?? 0;
      if (amt > 0) await refundBuyIn(uid, code, amt);
    } catch {
      /* best-effort */
    }
  }
}

// Cuenta las manos (por handNum distinto) en las que `uid` participo y gano,
// leyendo la subcoleccion autoritativa normalRooms/{code}/hands (escribible SOLO
// por el host segun firestore.rules). El cliente no puede inflar esto. Run-it-N
// escribe varios docs por mano: se deduplica por handNum.
async function countVerifiedHands(
  code: string,
  uid: string,
): Promise<{ played: number; won: number }> {
  const snap = await adminDb()
    .collection("normalRooms").doc(code).collection("hands")
    .limit(MAX_HANDS_PER_SESSION)
    .get();
  const played = new Set<number>();
  const won = new Set<number>();
  snap.forEach((d) => {
    const h = d.data() as {
      handNum?: number;
      dealtIds?: string[];
      winners?: { id: string }[];
    };
    const n = Number(h.handNum ?? -1);
    if (n < 0 || !Array.isArray(h.dealtIds) || !h.dealtIds.includes(uid)) return;
    played.add(n);
    if (Array.isArray(h.winners) && h.winners.some((w) => w.id === uid)) won.add(n);
  });
  return { played: played.size, won: won.size };
}

// Cuenta manos jugadas/ganadas de una sala ONLINE desde Supabase
// online_hand_records, que escribe SOLO el servidor Go (service role; RLS
// bloquea INSERT de clientes). Mismo contrato que countVerifiedHands: el
// cliente no puede inflar el conteo. Dedup por hand_num.
async function countVerifiedOnlineHands(
  code: string,
  uid: string,
): Promise<{ played: number; won: number }> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return { played: 0, won: 0 };
  const url =
    `${base.replace(/\/$/, "")}/rest/v1/online_hand_records` +
    `?room=eq.${encodeURIComponent(code)}&select=hand_num,seat_ids,winners` +
    `&limit=${MAX_HANDS_PER_SESSION}`;
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  });
  if (!res.ok) return { played: 0, won: 0 };
  const rows = (await res.json()) as {
    hand_num?: number;
    seat_ids?: string[];
    winners?: { id: string }[];
  }[];
  const played = new Set<number>();
  const won = new Set<number>();
  for (const h of rows) {
    const n = Number(h.hand_num ?? -1);
    if (n < 0 || !Array.isArray(h.seat_ids) || !h.seat_ids.includes(uid)) continue;
    played.add(n);
    if (Array.isArray(h.winners) && h.winners.some((w) => w.id === uid)) won.add(n);
  }
  return { played: played.size, won: won.size };
}

// Registra una sesion: stats + XP + historial. handsPlayed/handsWon NO se toman
// del cliente: se cuentan server-side desde las manos autoritativas de la sala
// (Firestore hands del host en modo normal; Supabase online_hand_records del
// servidor Go en modo online) y se acreditan por DELTA (marcador por sala) para
// que repetir record-session o inflar los contadores no forje XP. El XP se
// recalcula con sessionXp().
export async function recordSession(
  uid: string,
  data: {
    code: string;
    roomName: string;
    handsPlayed: number;
    handsWon: number;
    net: number;
    biggestPot: number;
    mode?: RoomMode;
  },
): Promise<void> {
  const code = String(data.code ?? "").slice(0, 64);
  const roomName = String(data.roomName ?? "").slice(0, 120);
  const net = Math.floor(Number.isFinite(data.net) ? data.net : 0);
  const biggestPot = Math.max(0, Math.floor(Number.isFinite(data.biggestPot) ? data.biggestPot : 0));
  if (!code) return;

  // Verdad server-side: manos realmente registradas para esta sala.
  const isOnline = data.mode === "online";
  const verified = isOnline
    ? await countVerifiedOnlineHands(code, uid)
    : await countVerifiedHands(code, uid);

  const db = adminDb();
  const ref = userRef(uid);
  // Marcador por sala; las online llevan prefijo para no chocar con una sala
  // normal que reutilice el mismo codigo.
  const creditRef = ref.collection("sessionCredits").doc(isOnline ? `online-${code}` : code);

  const granted = await db.runTransaction(async (tx) => {
    const [snap, creditSnap] = await Promise.all([tx.get(ref), tx.get(creditRef)]);
    if (!snap.exists) return { played: 0, won: 0, xp: 0 };
    const p = snap.data() as UserProfile;
    const prior = (creditSnap.exists ? creditSnap.data() : null) as
      | { played?: number; won?: number }
      | null;

    // Solo el delta no acreditado, acotado por llamada.
    let played = creditableHands(verified.played, prior?.played ?? 0);
    played = Math.min(MAX_HANDS_PER_SESSION, played);
    let won = creditableHands(verified.won, prior?.won ?? 0);
    won = Math.min(played, won);
    if (played === 0 && won === 0) return { played: 0, won: 0, xp: 0 };

    const xpGained = sessionXp(played, won);
    const withXp = addXp(p, xpGained);
    tx.update(ref, {
      xp: withXp.xp,
      level: withXp.level,
      title: withXp.title,
      gamesPlayed: p.gamesPlayed + (played > 0 ? 1 : 0),
      handsPlayed: p.handsPlayed + played,
      handsWon: p.handsWon + won,
      biggestPot: Math.max(p.biggestPot, biggestPot),
    });
    tx.set(creditRef, {
      played: (prior?.played ?? 0) + played,
      won: (prior?.won ?? 0) + won,
    }, { merge: true });
    return { played, won, xp: xpGained };
  });

  // Nada nuevo acreditado: no escribir historial (evita spam de repeticiones).
  if (granted.played === 0 && granted.won === 0) return;

  const id = `${code}-${Date.now().toString(36)}`;
  await ref.collection("history").doc(id).set({
    id,
    ts: Date.now(),
    code,
    roomName,
    handsPlayed: granted.played,
    handsWon: granted.won,
    net,
    xpGained: granted.xp,
  });

  // Recorta historial al cap (borra los mas viejos).
  const old = await ref.collection("history").orderBy("ts", "desc").offset(HISTORY_CAP).get();
  if (!old.empty) {
    const batch = db.batch();
    old.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}
