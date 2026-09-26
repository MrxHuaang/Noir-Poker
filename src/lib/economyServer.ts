// Logica de economia/progresion del lado SERVIDOR (Admin SDK).
// Es la unica autoridad que escribe coins/escrows/xp/stats. Replica las
// transacciones que antes corrian en el cliente (users.ts), pero ahora con
// privilegios de servidor, derivando el uid del idToken verificado.
//
// Reglas de integridad reforzadas aqui (no en el cliente):
//   - buy-in: descuenta solo si hay saldo; monto acotado. Puede crear la
//     solicitud de asiento en la misma transaccion (sin escrow huerfano).
//   - cash-out: lee el stack de la autoridad del host (asiento en mano viva o
//     lobby.chips), NO un valor del cliente, y retira al jugador del lobby.
//   - refund: solo devuelve una solicitud pendiente/rechazada (que consume) o
//     un escrow que nunca entro a la mesa.
//   - record-session: el XP se RECALCULA server-side con sessionXp(); el cliente
//     no puede inflarlo. Manos y bote mayor salen de los registros de la sala.
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
import { addXp, titleForLevel, sessionXp, XP_PER_SESSION } from "./progression";
import { countOnlineHands, onlineEscrowKey, reconcileOnlineEscrow } from "./online/server";

// Prefijo de las claves de escrow de mesas online (ver onlineEscrowKey).
const ONLINE_PREFIX = "online-";

const MAX_BUYIN = 1_000_000; // coherente con el tope de stackRequests
const MAX_HANDS_PER_SESSION = 10_000; // cota anti-inflado de XP/stats
const HISTORY_CAP = 100;
// Ninguna mano real dura menos que esto: tope de manos creibles por sala segun
// el tiempo que lleva abierta (frena registros de manos inventados).
const MIN_MS_PER_HAND = 8_000;
// El rescate por quiebra se otorga como mucho una vez por este intervalo.
const BUST_RESCUE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
// Fases del modo normal con una mano en juego.
const LIVE_PHASES = new Set(["preflop", "flop", "turn", "river", "all-in-negotiation"]);

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
  // Modo de cada escrow ("normal" | "online"). Los online (clave online-CODE)
  // los liquida la propia mesa online; reconcileEscrows les pregunta a ella.
  escrowModes?: Record<string, string>;
  lastDailyBonus: number;
  lastBustRescue?: number;
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
// `contributors`: uids que compraron fichas en la sala (XP solo en salas con al
// menos dos jugadores que arriesgaron monedas reales).
type RoomLedger = { totalIn: number; totalOut: number; contributors: string[] };

function ledgerRef(code: string) {
  return adminDb().collection("roomLedgers").doc(code);
}

function readLedger(snap: FirebaseFirestore.DocumentSnapshot): RoomLedger {
  const d = (snap.exists ? snap.data() : null) as Partial<RoomLedger> | null;
  return {
    totalIn: Math.max(0, Math.floor(d?.totalIn ?? 0)),
    totalOut: Math.max(0, Math.floor(d?.totalOut ?? 0)),
    contributors: Array.isArray(d?.contributors) ? (d!.contributors as string[]) : [],
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
// Corre en una transaccion: escribe valores absolutos de coins, y un buy-in o
// cash-out concurrente no debe quedar pisado por una lectura vieja.
export async function ensureProfile(uid: string): Promise<UserProfile> {
  const ref = userRef(uid);
  const userRecord = await adminAuth().getUser(uid);
  const providerId = userRecord.providerData[0]?.providerId ?? "";
  const provider = providerOf(providerId);

  return adminDb().runTransaction(async (tx) => {
    const now = Date.now();
    const snap = await tx.get(ref);
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
      tx.set(ref, profile);
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

    // Rescate por quiebra con enfriamiento: sin el, una cuenta que pierde sus
    // monedas a proposito contra otra se recargaba en cada recarga de pagina.
    if (now - (profile.lastBustRescue ?? 0) >= BUST_RESCUE_COOLDOWN_MS) {
      const rescue = applyBustRescue(profile);
      if (rescue.granted > 0) {
        profile = { ...rescue.wallet, lastBustRescue: now };
        patch.coins = profile.coins;
        patch.lastBustRescue = now;
      }
    }

    if (Object.keys(patch).length > 0) {
      tx.update(ref, patch);
      // No reflejar el FieldValue.delete() sentinel en el objeto devuelto.
      const { email: _drop, ...rest } = patch as Record<string, unknown> & { email?: unknown };
      void _drop;
      profile = { ...profile, ...rest } as UserProfile;
    }
    return profile;
  });
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

export type SeatRequest = {
  type: "join" | "rebuy";
  name: string;
  seed: string;
};

export async function buyIn(
  uid: string,
  code: string,
  amount: number,
  mode: RoomMode = "normal",
  request?: SeatRequest,
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
  const reqRef = adminDb()
    .collection("normalRooms").doc(code)
    .collection("stackRequests").doc(uid);
  return adminDb().runTransaction(async (tx) => {
    // Lecturas antes de escrituras (requisito de las transacciones Firestore).
    const [snap, lsnap, rsnap] = await Promise.all([
      tx.get(ref),
      tx.get(lref),
      request ? tx.get(reqRef) : Promise.resolve(null),
    ]);
    if (!snap.exists) throw new Error("Perfil inexistente");
    if (rsnap?.exists && (rsnap.data() as { status?: string }).status === "pending") {
      throw new Error("Ya tienes una solicitud pendiente");
    }
    const p = snap.data() as UserProfile;
    const escrows = { ...(p.escrows ?? {}) };
    const escrowModes = { ...(p.escrowModes ?? {}) };
    if (p.coins < amt) throw new Error("Saldo insuficiente");
    escrows[code] = (escrows[code] ?? 0) + amt;
    escrowModes[code] = mode; // recordar el modo: reconcile trata online distinto
    const coins = p.coins - amt;
    const ledger = readLedger(lsnap);
    // El buy-in entra al bote de la sala.
    tx.set(
      lref,
      {
        totalIn: ledger.totalIn + amt,
        totalOut: ledger.totalOut,
        contributors: FieldValue.arrayUnion(uid),
      },
      { merge: true },
    );
    tx.update(ref, { coins, escrows, escrowModes });
    if (request) {
      // Misma transaccion: nunca queda un escrow sin su solicitud (ni viceversa).
      tx.set(reqRef, {
        uid,
        name: String(request.name ?? "").slice(0, 40) || "Jugador",
        seed: String(request.seed ?? "").slice(0, 80) || uid,
        requestedStack: amt,
        type: request.type === "rebuy" ? "rebuy" : "join",
        status: "pending",
        ts: Date.now(),
      });
    }
    return coins;
  });
}

type RoomSeatLite = {
  id: string;
  ownerUid?: string | null;
  chips?: number;
  status?: string;
};

function seatOf(state: { seats?: RoomSeatLite[] } | null | undefined, uid: string) {
  return (state?.seats ?? []).find((s) => s.id === uid || s.ownerUid === uid) ?? null;
}

// Devuelve monedas de una solicitud que el host no aprobo (pendiente que el
// jugador cancela, o rechazada) consumiendo la solicitud, o un escrow que nunca
// entro a la mesa (sin lobby ni asiento). Nada mas: un jugador sentado que
// perdio su stack no puede "reembolsarse" el buy-in. Nunca paga mas de lo que
// queda en el libro de la sala.
export async function refundBuyIn(uid: string, code: string, amount: number): Promise<void> {
  const amt = Math.max(0, Math.floor(amount));
  if (amt === 0) return;
  const db = adminDb();
  const ref = userRef(uid);
  const lref = ledgerRef(code);
  const roomRef = db.collection("normalRooms").doc(code);
  const lobbyRef = roomRef.collection("lobby").doc(uid);
  const reqRef = roomRef.collection("stackRequests").doc(uid);
  await db.runTransaction(async (tx) => {
    const [snap, lsnap, roomSnap, lobbySnap, reqSnap] = await Promise.all([
      tx.get(ref),
      tx.get(lref),
      tx.get(roomRef),
      tx.get(lobbyRef),
      tx.get(reqRef),
    ]);
    if (!snap.exists) return;
    const p = snap.data() as UserProfile;
    const escrows = { ...(p.escrows ?? {}) };
    const current = escrows[code] ?? 0;
    if (current <= 0) return; // nada comprometido: no acunar

    const req = reqSnap.exists
      ? (reqSnap.data() as { status?: string; requestedStack?: number })
      : null;
    let refundable = 0;
    if (req && (req.status === "pending" || req.status === "rejected")) {
      refundable = Math.max(0, Math.floor(req.requestedStack ?? 0));
    } else {
      const state = roomSnap.exists
        ? ((roomSnap.data() as { state?: { seats?: RoomSeatLite[] } | null }).state ?? null)
        : null;
      if (!lobbySnap.exists && !seatOf(state, uid)) refundable = current;
    }
    const ledger = readLedger(lsnap);
    const remainingPot = lsnap.exists ? Math.max(0, ledger.totalIn - ledger.totalOut) : current;
    const give = Math.min(amt, current, refundable, remainingPot);
    if (give <= 0) return;

    const remaining = current - give;
    const escrowModes = { ...(p.escrowModes ?? {}) };
    if (remaining > 0) escrows[code] = remaining;
    else {
      delete escrows[code];
      delete escrowModes[code];
    }
    // El reembolso saca esas monedas del bote: nunca jugaron.
    if (lsnap.exists) tx.set(lref, { totalIn: ledger.totalIn - give }, { merge: true });
    tx.update(ref, { coins: p.coins + give, escrows, escrowModes });
    // La solicitud reembolsada ya no puede aprobarse.
    if (req) tx.delete(reqRef);
  });
}

// Cash-out autoritativo. La autoridad de stacks depende del modo de la sala:
//   - normal: el host. Con una mano en juego en la que el jugador participa,
//     su stack es lo que le queda detras en state.seats (lo comprometido en el
//     bote se pierde, como un fold). Si no, lobby.chips (el host lo sincroniza
//     tras cada mano). Se suma cualquier rebuy aprobado aun no aplicado. Sin
//     lobby ni asiento, el jugador nunca entro a la mesa: se devuelve su escrow.
//     El cash-out retira al jugador: borra su entrada del lobby y su rebuy
//     pendiente en la misma transaccion (el host deja de repartirle).
//   - online: las mesas online liquidan su propio cash-out dentro de la
//     transaccion del juego (src/lib/online/server.ts). Aqui solo llegan
//     escrows online heredados del antiguo servidor Go, sin autoridad viva:
//     se devuelve el escrow (recortado al libro de la sala).
// Ninguna autoridad puede acunar monedas: el credito se recorta al bote real de
// la sala (totalIn - totalOut) via cappedCredit. Asi se reparte quien gana o
// pierde, pero el total que sale de la sala jamas supera lo que entro. Si la
// sala no tiene libro (creada antes de esta version), el tope conservador es el
// propio escrow del jugador: nunca paga mas de lo que ese jugador aporto.
export async function cashOut(uid: string, code: string): Promise<number | null> {
  const db = adminDb();
  const ref = userRef(uid);
  const lref = ledgerRef(code);
  const roomRef = db.collection("normalRooms").doc(code);
  const lobbyRef = roomRef.collection("lobby").doc(uid);
  const reqRef = roomRef.collection("stackRequests").doc(uid);
  return db.runTransaction(async (tx) => {
    const [snap, lsnap, roomSnap, lobbySnap, reqSnap] = await Promise.all([
      tx.get(ref),
      tx.get(lref),
      tx.get(roomRef),
      tx.get(lobbyRef),
      tx.get(reqRef),
    ]);
    if (!snap.exists) return null;
    const p = snap.data() as UserProfile;
    const escrows = { ...(p.escrows ?? {}) };
    if (!(code in escrows)) return null; // ya liquidado
    const ownEscrow = Math.max(0, escrows[code] ?? 0);
    const isOnline = p.escrowModes?.[code] === "online";

    let desired = ownEscrow;
    let pendingRebuy = 0;
    let pendingRequest = 0;
    if (!isOnline) {
      const room = roomSnap.exists
        ? (roomSnap.data() as {
            state?: { phase?: string; seats?: RoomSeatLite[] } | null;
            pendingRebuys?: Record<string, number>;
          })
        : null;
      const state = room?.state ?? null;
      const seat = seatOf(state, uid);
      const live = !!state && LIVE_PHASES.has(String(state.phase ?? ""));
      const inHand =
        !!seat && ["active", "all-in", "folded"].includes(String(seat.status ?? ""));
      const lobbyChips = lobbySnap.exists
        ? Math.max(0, Math.floor((lobbySnap.data() as { chips?: number }).chips ?? 0))
        : null;
      const req = reqSnap.exists
        ? (reqSnap.data() as { status?: string; requestedStack?: number })
        : null;
      // Una solicitud sin aprobar (su escrow nunca llego a la mesa) se devuelve
      // y se consume, para que el host ya no pueda aprobarla despues.
      if (req && (req.status === "pending" || req.status === "rejected")) {
        pendingRequest = Math.max(0, Math.floor(req.requestedStack ?? 0));
      }
      pendingRebuy = Math.max(0, Math.floor(room?.pendingRebuys?.[uid] ?? 0));
      const tableStack =
        live && inHand
          ? Math.max(0, Math.floor(seat!.chips ?? 0))
          : lobbyChips !== null
            ? lobbyChips
            : seat
              ? Math.max(0, Math.floor(seat.chips ?? 0))
              : null;
      // Sin lobby ni asiento nunca entro a la mesa: su escrow (que ya incluye
      // cualquier solicitud pendiente) vuelve integro.
      desired = tableStack === null ? ownEscrow : tableStack + pendingRebuy + pendingRequest;
    }

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
    if (!isOnline) {
      if (lobbySnap.exists) tx.delete(lobbyRef);
      if (pendingRebuy > 0) {
        tx.update(roomRef, { [`pendingRebuys.${uid}`]: FieldValue.delete() });
      }
      if (pendingRequest > 0) tx.delete(reqRef);
    }
    return coins;
  });
}

// Expulsion desde el host: liquida el stack del jugador (misma autoridad que
// su propio cash-out) antes de sacarlo del lobby. Solo el host de la sala.
export async function hostCashOut(
  hostUid: string,
  code: string,
  targetUid: string,
): Promise<number | null> {
  const db = adminDb();
  const roomRef = db.collection("normalRooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new Error("Sala inexistente");
  if ((roomSnap.data() as { hostUid?: string }).hostUid !== hostUid) {
    throw new Error("Solo el host");
  }
  const coins = await cashOut(targetUid, code);
  // Sin escrow (sala casual o ya liquidado): igual se saca del lobby.
  await roomRef.collection("lobby").doc(targetUid).delete().catch(() => {});
  return coins;
}

// Libera escrows huerfanos: salas donde el jugador ya no esta en el lobby ni
// tiene una solicitud pendiente. Se liquidan con la misma autoridad que el
// cash-out (asiento conservado por el host, o el escrow si nunca se sento), no
// devolviendo el buy-in completo: un jugador expulsado tras perder su stack no
// debe recuperarlo.
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
    // Escrows online: la mesa decide (sigue sentado, heartbeat vencido, o sala
    // inexistente). Nunca usar la ausencia de lobby en normalRooms como senal
    // de huerfano para ellos (BUG-N1).
    if (code.startsWith(ONLINE_PREFIX)) {
      try {
        await reconcileOnlineEscrow(uid, code.slice(ONLINE_PREFIX.length));
      } catch {
        /* best-effort */
      }
      continue;
    }
    if (escrowModes[code] === "online") {
      // Heredado del servidor Go (clave sin prefijo): esa sala ya no existe.
      try {
        await cashOut(uid, code);
      } catch {
        /* best-effort */
      }
      continue;
    }
    try {
      const lobbySnap = await db
        .collection("normalRooms").doc(code).collection("lobby").doc(uid).get();
      if (lobbySnap.exists) continue;
      const reqSnap = await db
        .collection("normalRooms").doc(code).collection("stackRequests").doc(uid).get();
      if (reqSnap.exists && (reqSnap.data() as { status?: string }).status === "pending") {
        continue;
      }
      await cashOut(uid, code);
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
): Promise<{ played: number; won: number; biggestPot: number }> {
  const snap = await adminDb()
    .collection("normalRooms").doc(code).collection("hands")
    .limit(MAX_HANDS_PER_SESSION)
    .get();
  const played = new Set<number>();
  const won = new Set<number>();
  let biggestPot = 0;
  snap.forEach((d) => {
    const h = d.data() as {
      handNum?: number;
      dealtIds?: string[];
      winners?: { id: string }[];
      pot?: number;
    };
    const n = Number(h.handNum ?? -1);
    if (n < 0 || !Array.isArray(h.dealtIds) || !h.dealtIds.includes(uid)) return;
    played.add(n);
    biggestPot = Math.max(biggestPot, Math.floor(Number(h.pot ?? 0)) || 0);
    if (Array.isArray(h.winners) && h.winners.some((w) => w.id === uid)) won.add(n);
  });
  return { played: played.size, won: won.size, biggestPot };
}

function millisOf(v: unknown): number {
  if (typeof v === "number") return v;
  const t = v as { toMillis?: () => number } | null;
  return t && typeof t.toMillis === "function" ? t.toMillis() : 0;
}

// Condiciones para que una sala acredite XP: con monedas (las casuales no dan
// XP), al menos dos jugadores distintos compraron fichas (uno de ellos, quien
// reclama), y un tope de manos creibles segun el tiempo que lleva abierta.
async function xpEligibility(
  code: string,
  uid: string,
  isOnline: boolean,
): Promise<{ ok: boolean; maxHands: number }> {
  const db = adminDb();
  const ledgerKey = isOnline ? onlineEscrowKey(code) : code;
  const [lsnap, roomSnap] = await Promise.all([
    ledgerRef(ledgerKey).get(),
    isOnline
      ? db.collection("onlineRooms").doc(code).collection("private").doc("engine").get()
      : db.collection("normalRooms").doc(code).get(),
  ]);
  if (!lsnap.exists || !roomSnap.exists) return { ok: false, maxHands: 0 };
  const contributors = new Set(readLedger(lsnap).contributors);
  if (contributors.size < 2 || !contributors.has(uid)) return { ok: false, maxHands: 0 };
  let createdAt = 0;
  if (isOnline) {
    const eng = JSON.parse(String(roomSnap.data()?.json ?? "{}")) as {
      createdAt?: number;
      casual?: boolean;
    };
    if (eng.casual) return { ok: false, maxHands: 0 };
    createdAt = Number(eng.createdAt ?? 0);
  } else {
    const room = roomSnap.data() as { economy?: string; createdAt?: unknown };
    if (room.economy === "casual") return { ok: false, maxHands: 0 };
    createdAt = millisOf(room.createdAt);
  }
  const elapsed = Math.max(0, Date.now() - createdAt);
  return { ok: true, maxHands: Math.floor(elapsed / MIN_MS_PER_HAND) + 1 };
}

// Registra una sesion: stats + XP + historial. handsPlayed/handsWon NO se toman
// del cliente: se cuentan server-side desde las manos autoritativas de la sala
// (Firestore hands del host en modo normal; onlineRooms/{code}/hands, escritas
// por la transaccion del juego, en modo online) y se acreditan por DELTA (marcador por sala) para
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
  if (!code) return;

  // Verdad server-side: manos realmente registradas para esta sala. El bote
  // mayor tambien sale de esos registros (el valor del cliente se ignora).
  const isOnline = data.mode === "online";
  const eligibility = await xpEligibility(code, uid, isOnline);
  if (!eligibility.ok) return;
  const counted = isOnline
    ? await countOnlineHands(code, uid, MAX_HANDS_PER_SESSION)
    : await countVerifiedHands(code, uid);
  const verified = {
    played: Math.min(counted.played, eligibility.maxHands),
    won: Math.min(counted.won, eligibility.maxHands),
  };
  const biggestPot = counted.biggestPot;

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

    // El bono de sesion (y la partida jugada) cuenta una sola vez por sala:
    // repetir record-session tras cada mano no puede multiplicarlo.
    const firstCredit = !creditSnap.exists;
    const xpGained = sessionXp(played, won) - (firstCredit ? 0 : XP_PER_SESSION);
    const withXp = addXp(p, xpGained);
    tx.update(ref, {
      xp: withXp.xp,
      level: withXp.level,
      title: withXp.title,
      gamesPlayed: p.gamesPlayed + (firstCredit ? 1 : 0),
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
