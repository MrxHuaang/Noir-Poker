"use client";
// Mesa online en la trastienda (Noir 1929). El juego es autoritativo en el
// servidor: cada jugada es un POST a /api/online que corre una transacción de
// Firestore, y el estado público llega por suscripción a onlineRooms/{code}.
// Esta página SOLO renderiza y manda acciones, cero reglas de juego:
// - la mesa es la escena 3D en modo remoto (NoirTable), alimentada por el
//   adaptador puro src/lib/noirScene.ts;
// - tu jugada es el riel de cuero (NoirActionRail) que sube en tu turno;
// - los avisos son papeles y placas en los bordes: casi sin HUD.
//
// Flujo de entrada (estilo PokerNow): se entra OBSERVANDO. "Sentarme" te
// sienta si hay sitio o te pone en fila si la mesa está llena. Los invitados
// pueden observar; sentarse en una mesa con fichas pide cuenta.
//
// Economía: el buy-in (startStack) se descuenta del monedero en la MISMA
// transacción que te sienta, y al levantarte el stack final vuelve al monedero
// también de forma atómica. Si cierras la pestaña, tu heartbeat caduca y el
// servidor te levanta y liquida solo.
import { DesktopOnlyGate } from "@/components/ui/DesktopOnlyGate";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useOnlineGame } from "@/hooks/useOnlineGame";
import { useChat } from "@/hooks/useChat";
import { useTableChat, CANNED_PHRASES } from "@/hooks/useTableChat";
import { useOnlineHistory } from "@/hooks/useOnlineHistory";
import { adaptOnlineRuns } from "@/lib/onlineTable";
import { toSceneSnapshot } from "@/lib/noirScene";
import { MAX_SEATED, PRESENCE_STALE_MS } from "@/lib/online/protocol";
import { NoirTable, type SceneCam, type SceneCue } from "@/components/noir/NoirTable";
import { NoirActionRail, type RailMove } from "@/components/noir/NoirActionRail";
import { KeyholeMark } from "@/components/landing/KeyholeLogo";
import { NoirMenu } from "@/components/noir/NoirMenu";
import { NoirTableLedger } from "@/components/noir/NoirTableLedger";
import { NoirChat } from "@/components/noir/NoirChat";
import { NoirRuns } from "@/components/noir/NoirRuns";

const VoicePanel = dynamic(() => import("@/components/voice/VoicePanel"), {
  ssr: false,
});

const SUIT_ES: Record<string, string> = { S: "picas", H: "corazones", D: "diamantes", C: "tréboles" };
const prettyCard = (id: string) => `${id.slice(0, -1).replace("T", "10")} de ${SUIT_ES[id.slice(-1)] ?? ""}`;
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const PREFS_KEY = "noir:table";

// Table gestures: the figure acts them out in the scene.
const GESTURES: { kind: string; label: string }[] = [
  { kind: "hat", label: "Tocarse el sombrero" },
  { kind: "tap", label: "Golpear la mesa" },
  { kind: "puff", label: "Echar el humo" },
  { kind: "laugh", label: "Reírse" },
  { kind: "glare", label: "Mirar fijo" },
];

// v2: the table has a sound for every move, so sound starts on (older saved
// prefs had it off by default, not by choice).
type Prefs = { cam: SceneCam; sound: boolean; music: boolean; four: boolean; v?: number };

function readPrefs(): Prefs {
  const base: Prefs = { cam: "front", sound: true, music: true, four: false, v: 2 };
  if (typeof window === "undefined") return base;
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as Partial<Prefs>;
    return { ...base, ...saved, ...(saved.v === 2 ? {} : { sound: true, v: 2 }) };
  } catch {
    return base;
  }
}

export default function PlayOnlinePage() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() ?? null;
  return (
    <DesktopOnlyGate roomCode={code ?? undefined}>
      <PlayOnlinePageInner />
    </DesktopOnlyGate>
  );
}

/** A riveted plate in the middle of the room for decisions between hands. */
/** Which seats (and the owner) count as present at time t, as one comparable string. */
function freshnessKey(
  f: { seats?: { id: string }[]; owner?: string | null; presence: Record<string, number> },
  t: number,
): string {
  const fresh = (id: string) => {
    const beat = f.presence[id];
    return beat === undefined || t - beat <= PRESENCE_STALE_MS ? 1 : 0;
  };
  return `${(f.seats ?? []).map((s) => fresh(s.id)).join("")}|${f.owner ? fresh(f.owner) : ""}`;
}

function Plate({ children }: { children: ReactNode }) {
  return <div className="plate legible pointer-events-auto grid max-w-[420px] justify-items-center gap-3 px-8 pt-8 pb-7 text-center">{children}</div>;
}

/** Current blinds and, when they climb, the countdown to the next level. */
function BlindClock({ sb, bb, ante, level, next }: { sb: number; bb: number; ante: number; level: number; next: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!next) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [next]);
  const left = Math.max(0, Math.round((next - now) / 1000));
  return (
    <span className="text-[14px] tabular-nums tracking-[.02em] text-paper-dim">
      {level > 0 ? <>NIVEL <b className="text-paper">{level}</b> · </> : null}CIEGAS <b className="text-paper">{fmt(sb)}/{fmt(bb)}</b>
      {ante > 0 ? <> · ANTE <b className="text-paper">{fmt(ante)}</b></> : null}
      {next > 0 && (
        <>
          {" "}· SUBEN EN{" "}
          <b className="tabular-nums text-tungsten-400">
            {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}
          </b>
        </>
      )}
    </span>
  );
}

/** Seconds left to vote on the all-in boards. */
function VoteClock({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <p className="m-0 font-pix text-[13px] text-paper-mute">{left} s para decidir</p>;
}

function PlayOnlinePageInner() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() ?? null;
  const router = useRouter();

  const { uid, isGuest, profile, loading: authLoading } = useAuth();
  const game = useOnlineGame(code);
  const { state, hole, presence, busy } = game;

  const name = profile?.nickname || profile?.displayName || "Jugador";
  const seed = profile?.avatarSeed || uid || "seed";
  const isCasual = !!state?.casual;

  const chat = useChat(code);
  const { send: sendPhrase, activePhrases } = useTableChat(code, uid);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const { records: history } = useOnlineHistory(code, optionsOpen);

  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const setPref = (p: Partial<Prefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...p };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const [phrasesOpen, setPhrasesOpen] = useState(false);
  // One-off sounds for what the scene cannot see: a new blind level, a note
  // from someone else, someone at the door.
  const [cue, setCue] = useState<SceneCue | null>(null);
  const ring = (kind: SceneCue["kind"]) => setCue((c) => ({ kind, n: (c?.n ?? 0) + 1 }));
  const seen = useRef({ level: 0, chat: 0, phrases: "", door: 0 });
  const [gesturesOpen, setGesturesOpen] = useState(false);
  const [closedRunsHand, setClosedRunsHand] = useState(0);
  // The result notes wait until the scene has finished the runout on the felt
  // (it reports the hand), so a slow all-in is not spoiled by a note on top.
  const [shownHand, setShownHand] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [showLoginCta, setShowLoginCta] = useState(false);
  const [seatOverlayDismissed, setSeatOverlayDismissed] = useState(false);

  // Reloj grueso para detectar anfitriones con heartbeat caducado. It checks
  // every 5 s but only re-renders the page (and re-sends the scene snapshot)
  // when someone's freshness actually flips.
  const [now, setNow] = useState(() => Date.now());
  const freshIn = useRef({ seats: state?.seats, owner: state?.owner, presence });
  freshIn.current = { seats: state?.seats, owner: state?.owner, presence };
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow((prev) => (freshnessKey(freshIn.current, prev) === freshnessKey(freshIn.current, t) ? prev : t));
    }, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const level = state?.level ?? 0;
  useEffect(() => {
    if (level > seen.current.level && seen.current.level > 0) ring("level");
    seen.current.level = level;
  }, [level]);
  const lastChat = chat.reduce((m, c) => (c.uid !== uid && c.ts > m ? c.ts : m), 0);
  useEffect(() => {
    if (seen.current.chat && lastChat > seen.current.chat) ring("paper");
    seen.current.chat = lastChat || seen.current.chat || 1;
  }, [lastChat]);
  const othersPhrases = Object.keys(activePhrases).filter((id) => id !== uid).sort().join(",");
  useEffect(() => {
    if (othersPhrases && othersPhrases !== seen.current.phrases) ring("paper");
    seen.current.phrases = othersPhrases;
  }, [othersPhrases]);
  const atDoor = (state?.requests?.length ?? 0) + (state?.waiting?.length ?? 0);
  useEffect(() => {
    if (atDoor > seen.current.door && state?.owner === uid) ring("join");
    seen.current.door = atDoor;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atDoor]);

  // --- Posición propia ------------------------------------------------------
  const amSeated = !!(uid && state?.seats.some((s) => s.id === uid));
  const queuePos = uid && state?.waiting ? state.waiting.indexOf(uid) : -1;
  const inQueue = queuePos >= 0;
  const joiningNext = !!(uid && state?.joining?.includes(uid));
  const requested = !!(uid && state?.requests?.some((r) => r.id === uid));
  const present = amSeated || inQueue || joiningNext || requested;
  const amAway = !!(uid && state?.seats.find((s) => s.id === uid)?.away);

  const report = (err: string | null) => {
    if (!err) return;
    if (err === "Cuenta de invitado") setShowLoginCta(true);
    setNotice(err);
  };

  async function handleSit() {
    if (isGuest && !isCasual) {
      setShowLoginCta(true);
      return;
    }
    setNotice(null);
    report(await game.sit());
  }
  const standUp = async () => report(await game.leave());
  const rebuy = async () => report(await game.rebuy());
  const deal = async () => report(await game.start());

  function handleMove(m: RailMove) {
    if (busy === "act") return;
    game.act(m.action, m.amount).then(report);
  }

  async function handleLeave() {
    if (present && !confirm("¿Salir de la sala? Tu stack vuelve a tu monedero al salir.")) return;
    if (present) await game.leave();
    router.push("/jugar");
  }

  // --- Vista ----------------------------------------------------------------
  // Keyed by the flags, not the heartbeat times: a heartbeat that changes
  // nobody's freshness keeps the same map, so the scene snapshot is not rebuilt.
  const presenceFlags = (state?.seats ?? [])
    .map((s) => {
      const beat = presence[s.id];
      return `${s.id}:${beat === undefined || now - beat <= PRESENCE_STALE_MS ? 1 : 0}`;
    })
    .join(",");
  const presenceMap = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const pair of presenceFlags ? presenceFlags.split(",") : []) {
      const i = pair.lastIndexOf(":");
      out[pair.slice(0, i)] = pair.slice(i + 1) === "1";
    }
    return out;
  }, [presenceFlags]);
  const snapshot = useMemo(() => toSceneSnapshot(state, hole, uid, presenceMap), [state, hole, uid, presenceMap]);

  const me = state?.seats.find((s) => s.id === uid) ?? null;
  const isMyTurn = !!(uid && state?.toAct === uid && !state?.paused && amSeated);
  const isOwner = !!(uid && state?.owner === uid);
  const betweenHands = !state || state.phase === "idle" || state.phase === "showdown";
  const showdown = state?.phase === "showdown";
  const seatedCount = state?.seats.length ?? 0;
  const maxSeats = state?.rules?.maxSeats ?? MAX_SEATED;
  const tableFull = seatedCount >= maxSeats;
  const busted = amSeated && betweenHands && (me?.chips ?? 0) === 0;
  const fundedCount = state?.seats.filter((s) => s.chips > 0).length ?? 0;
  // Si el anfitrión cerró la pestaña, cualquiera sentado puede repartir: el
  // servidor levanta primero a los ausentes y reasigna la autoridad.
  const ownerBeat = state?.owner ? presence[state.owner] : undefined;
  const ownerGone =
    !!state?.owner && state.owner !== uid && ownerBeat !== undefined && now - ownerBeat > PRESENCE_STALE_MS;
  const canDeal = amSeated && (isOwner || ownerGone) && fundedCount >= 2;
  // Fallback: if the scene never reports (hidden tab), show the result anyway.
  const hand = state?.handNum ?? 0;
  useEffect(() => {
    if (!showdown) return;
    // Two boards in the dark take longer than one.
    const t = setTimeout(() => setShownHand((h) => Math.max(h, hand)), (state?.runs?.length ?? 0) > 1 ? 60_000 : 30_000);
    return () => clearTimeout(t);
  }, [showdown, hand]);
  const resultReady = showdown && shownHand >= hand;
  const runs = useMemo(
    () => (resultReady && state?.handNum !== closedRunsHand ? adaptOnlineRuns(state?.runs, state?.reveals) : null),
    [resultReady, state, closedRunsHand],
  );
  const seatName = (id: string) => state?.seats.find((s) => s.id === id)?.name ?? "Alguien";
  const tourney = !!state?.tournament;
  const tStarted = !!state?.tStarted;
  const tFinished = !!state?.tFinished;
  // Place of a busted player: counted from the bottom of those who started.
  const bustIdx = uid && state?.bustedOrder ? state.bustedOrder.indexOf(uid) : -1;
  const myPlace = bustIdx >= 0 && state ? state.seats.length + state.bustedOrder!.length - bustIdx : 0;
  const iWon = !!(uid && state?.winners?.length && state.winners.every((w) => w.id === uid));
  // After the hand, a player still holding unshown cards may turn them up.
  const canShow = !!(showdown && me && me.hasCards && me.status !== "folded" && hole && !state?.reveals?.[uid ?? ""]);

  const joinUrl = typeof window !== "undefined" && code ? `${window.location.origin}/m/${code}` : "";

  if (authLoading) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-soot-900 font-pix text-sm tracking-[.14em] text-brass-200">
        TOCANDO LA PUERTA
      </div>
    );
  }

  if (game.status === "missing") {
    return (
      <div className="fixed inset-0 grid place-items-center bg-soot-900 px-6 text-paper">
        <Plate>
          <p className="kick">La mirilla no se abre</p>
          <h1 className="stencil text-4xl">
            No hay mesa <span className="text-tungsten-400">{code}</span>
          </h1>
          <p className="m-0 max-w-[34ch] text-[15px] text-paper-dim">
            Puede que la contraseña esté mal escrita o que la mesa ya se haya cerrado.
          </p>
          <Link href="/jugar" className="tk tk-red">
            Volver al club
          </Link>
        </Plate>
      </div>
    );
  }

  // Decision between hands (or before sitting), in the middle of the room.
  let prompt: ReactNode = null;
  if (!state) {
    prompt = <p className="scrap m-0 px-4 py-2 font-pix text-sm">{game.error ?? "Buscando la mesa…"}</p>;
  } else if (tourney && tFinished && (resultReady || !showdown)) {
    prompt = (
      <Plate>
        <p className="kick">Torneo terminado</p>
        <h2 className="stencil m-0 text-4xl">Gana {state.ranking?.[0]?.name ?? "la casa"}</h2>
        <ol className="m-0 grid list-none gap-1 p-0 text-left">
          {(state.ranking ?? []).map((r, i) => (
            <li key={r.id} className="flex items-baseline gap-3">
              <b className="w-6 font-pix text-tungsten-400">{i + 1}</b>
              <span className={r.id === uid ? "text-tungsten-400" : "text-paper"}>{r.id === uid ? "Tú" : r.name}</span>
            </li>
          ))}
        </ol>
        <Link href="/jugar" className="tk tk-sm tk-red">
          Volver al club
        </Link>
      </Plate>
    );
  } else if (tourney && tStarted && !present) {
    prompt =
      myPlace > 0 ? (
        <p className="scrap m-0 px-4 py-2 font-pix text-sm">Quedaste en el puesto {myPlace}. Miras desde la barra.</p>
      ) : seatOverlayDismissed ? null : (
        <p className="scrap m-0 px-4 py-2 font-pix text-sm">El torneo ya empezó. Miras desde la barra.</p>
      );
  } else if (!present && !seatOverlayDismissed) {
    prompt =
      (isGuest && !isCasual) || showLoginCta ? (
        <Plate>
          <p className="kick">Mesa con fichas</p>
          <p className="m-0 max-w-[30ch] text-[15px] text-paper-dim">
            Para sentarte necesitas una cuenta: esta mesa juega con las monedas de tu perfil.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={`/login?next=${encodeURIComponent(`/play/online/${code}`)}`} className="tk tk-sm tk-red">
              Iniciar sesión
            </Link>
            <button type="button" onClick={() => setSeatOverlayDismissed(true)} className="btn-brass">
              Seguir mirando
            </button>
          </div>
        </Plate>
      ) : (
        <Plate>
          <p className="kick">
            {seatedCount}/{maxSeats} en la mesa
          </p>
          <button type="button" onClick={handleSit} disabled={busy === "sit"} className="tk tk-red">
            {busy === "sit" ? "Sentando…" : tableFull ? "Hacer fila" : "Sentarme"}
          </button>
          <p className="m-0 text-[13px] text-paper-mute">
            {tourney
              ? `Torneo: todos salen con ${fmt(state.startStack)} fichas${isCasual ? "" : " de tu monedero"}. Sin recompras.`
              : isCasual
                ? "Mesa sin fichas: recompras libres."
                : `Entras con ${fmt(state.startStack)} fichas de tu monedero.`}
            {tableFull ? " Está llena: te sientas en cuanto haya silla." : ""}
          </p>
          <button type="button" onClick={() => setSeatOverlayDismissed(true)} className="text-[13px] text-paper-dim underline underline-offset-4">
            Solo mirar
          </button>
        </Plate>
      );
  } else if (requested) {
    prompt = (
      <Plate>
        <p className="kick">En la puerta</p>
        <p className="m-0 max-w-[30ch] text-[15px] text-paper-dim">Esperando a que {seatName(state.owner ?? "")} te deje pasar.</p>
        <button type="button" onClick={standUp} className="text-[13px] text-paper-dim underline underline-offset-4">
          Irme
        </button>
      </Plate>
    );
  } else if (inQueue) {
    prompt = (
      <Plate>
        <p className="kick">En la barra</p>
        <p className="stencil m-0 text-4xl">Puesto {queuePos + 1}</p>
        <p className="m-0 text-[13px] text-paper-mute">Te sentamos en cuanto se libere una silla.</p>
        <button type="button" onClick={standUp} className="text-[13px] text-paper-dim underline underline-offset-4">
          Salir de la fila
        </button>
      </Plate>
    );
  } else if (joiningNext) {
    prompt = <p className="scrap m-0 px-4 py-2 font-pix text-sm">Entras en la próxima mano.</p>;
  } else if (amSeated && betweenHands && !showdown) {
    prompt = busted && !tourney ? (
      <Plate>
        <p className="kick">Te quedaste sin fichas</p>
        <button type="button" onClick={rebuy} disabled={busy === "rebuy"} className="tk tk-red">
          Recomprar {fmt(state.startStack)}
        </button>
      </Plate>
    ) : seatedCount < 2 ? (
      <Plate>
        <p className="kick">Esperando rival</p>
        <p className="m-0 max-w-[30ch] text-[15px] text-paper-dim">
          Pasa el enlace de la mesa a quien quieras sentar.
        </p>
        <button
          type="button"
          className="tk tk-sm tk-red pointer-events-auto"
          onClick={() => void navigator.clipboard?.writeText(joinUrl).then(() => setNotice("Enlace copiado.")).catch(() => {})}
        >
          Copiar el enlace
        </button>
        <p className="m-0 font-pix text-[12px] text-paper-mute">
          o la contraseña <b className="tracking-[.2em] text-tungsten-400">{code}</b>
        </p>
      </Plate>
    ) : canDeal ? (
      <button type="button" onClick={deal} disabled={busy === "start"} className="tk tk-red pointer-events-auto">
        {busy === "start" ? "Repartiendo…" : tourney && !tStarted ? `Empezar el torneo (${seatedCount})` : "Repartir"}
      </button>
    ) : (
      <p className="scrap m-0 px-4 py-2 font-pix text-sm">
        {tourney && !tStarted ? `Esperando a que ${seatName(state.owner ?? "")} empiece el torneo…` : `Esperando a que ${seatName(state.owner ?? "")} reparta…`}
      </p>
    );
  }

  // All-in: the players involved choose how many boards (twice only if all agree).
  const vote = state?.runVote;
  const myVote = vote && uid ? vote.votes[uid] : undefined;
  const iVote = !!(vote && uid && vote.voters.includes(uid));
  if (vote) {
    prompt = iVote && myVote === undefined ? (
      <Plate>
        <p className="kick">Todo al centro</p>
        <h2 className="stencil m-0 text-3xl">¿Cuántas veces repartimos?</h2>
        <p className="m-0 text-[14px] text-paper-dim">Dos tableros solo si todos los del all-in aceptan. Si no, uno.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn-brass" onClick={() => game.vote(1).then(report)}>
            Una vez
          </button>
          <button type="button" className="tk tk-red" onClick={() => game.vote(2).then(report)}>
            Dos veces
          </button>
        </div>
        <VoteClock deadline={vote.deadline} />
      </Plate>
    ) : (
      <p className="scrap m-0 px-4 py-2 font-pix text-sm">
        {iVote ? "Esperando a los demás del all-in…" : "Los del all-in deciden cuántas veces se reparte…"} ({Object.keys(vote.votes).length}/{vote.voters.length})
      </p>
    );
  }

  return (
    <>
      <NoirTable snapshot={snapshot} cam={prefs.cam} sound={prefs.sound} music={prefs.music} cue={cue} fourColor={prefs.four} onShown={setShownHand}>
        {/* Top edge: the way out, the password, the room controls */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4">
          <div className="legible pointer-events-auto flex items-center gap-3">
            <span className="flex items-center gap-2 text-[14px] font-semibold tracking-[.08em] text-brass-200">
              <KeyholeMark className="h-6 w-auto" /> {tourney ? "TORNEO" : "MESA"} {code}
            </span>
            {state && state.phase !== "idle" && !tFinished && <BlindClock sb={state.sb} bb={state.bb} ante={state.ante ?? 0} level={state.level ?? 0} next={state.nextBlindsAt ?? 0} />}
            {state?.bomb && <span className="text-[14px] font-semibold tracking-[.08em] text-blood-400">BOTE BOMBA</span>}
          </div>
          <div className="flex flex-col items-center gap-2">
            {!game.online && state && (
              <p role="status" className="scrap m-0 px-3 py-1 font-pix text-sm text-blood-500">
                Se cortó la línea. Reconectando…
              </p>
            )}
            {state?.paused && <p className="scrap m-0 px-3 py-1 font-pix text-sm">Partida en pausa</p>}
            {notice && (
              <p role="status" className="scrap m-0 px-3 py-1 font-pix text-sm text-blood-500">
                {notice}
              </p>
            )}
            {isOwner &&
              (state?.requests ?? []).map((q) => (
                <p key={q.id} className="scrap pointer-events-auto m-0 flex items-center gap-2 px-3 py-1 text-sm">
                  <b>{q.name}</b> quiere sentarse
                  <button type="button" className="stamp h-6 px-1.5 text-[11px] text-blood-500" onClick={() => game.approve(q.id).then(report)}>
                    Dejar pasar
                  </button>
                  <button type="button" className="stamp h-6 px-1.5 text-[11px] text-[#5a4d3e]" onClick={() => game.deny(q.id).then(report)}>
                    No
                  </button>
                </p>
              ))}
            {state?.timeBank && state.toAct && (
              <p className="scrap m-0 px-3 py-1 font-pix text-[15px]">
                {state.toAct === uid ? "Enciendes el cigarrillo de reserva" : `${seatName(state.toAct)} enciende el cigarrillo de reserva`}
              </p>
            )}
            {(state?.waiting?.length ?? 0) > 0 && (
              <p className="m-0 font-pix text-[13px] text-paper-dim">{state!.waiting!.length} en la barra esperando silla</p>
            )}
            {game.watchers > 0 && (
              <p className="m-0 font-pix text-[13px] text-paper-mute">
                {game.watchers === 1 ? "1 mira desde la barra" : `${game.watchers} miran desde la barra`}
              </p>
            )}
            {Object.entries(activePhrases).map(([senderUid, phrase]) => (
              <p key={senderUid} className="scrap m-0 px-3 py-1 text-sm">
                <b>{seatName(senderUid)}:</b> {phrase}
              </p>
            ))}
          </div>
          <div className="pointer-events-auto">
            <NoirMenu
              items={[
                ...(isOwner && state && state.phase !== "idle"
                  ? [{ label: state.paused ? "Reanudar" : "Pausar", onSelect: () => (state.paused ? game.resume() : game.pause()).then(report) }]
                  : []),
                { label: prefs.cam === "iso" ? "Vista frontal" : "Vista isométrica", onSelect: () => setPref({ cam: prefs.cam === "iso" ? "front" : "iso" }) },
                { label: prefs.sound ? "Quitar sonido" : "Poner sonido", hint: prefs.sound ? "todo, también la música" : undefined, onSelect: () => setPref({ sound: !prefs.sound }) },
                ...(prefs.sound ? [{ label: prefs.music ? "Apagar la radio" : "Encender la radio", hint: prefs.music ? "la música, no los efectos" : "jazz de fondo", onSelect: () => setPref({ music: !prefs.music }) }] : []),
                { label: prefs.four ? "Baraja de 2 colores" : "Baraja de 4 colores", hint: prefs.four ? undefined : "un color por palo", onSelect: () => setPref({ four: !prefs.four }) },
                { label: "Copiar el enlace", hint: "para invitar", onSelect: () => void navigator.clipboard?.writeText(joinUrl).then(() => setNotice("Enlace copiado. Pásalo a quien quieras sentar.")).catch(() => {}) },
                { label: "La mesa", hint: "reglas y jugadores", onSelect: () => setOptionsOpen(true) },
                ...(amSeated ? [{ label: amAway ? "Volver a la mesa" : "Ausentarme", hint: amAway ? undefined : "no te reparten", onSelect: () => void game.away(!amAway).then(report) }] : []),
                ...(present ? [{ label: "Levantarme", onSelect: () => void standUp() }] : []),
                { label: "Salir del club", danger: true, onSelect: () => void handleLeave() },
              ]}
            />
          </div>
        </div>

        {/* Middle of the room: decisions between hands */}
        {prompt && (
          <div className={`pointer-events-none absolute inset-0 z-10 grid ${vote ? "content-start justify-items-start pt-[72px] pl-4 [&>.plate]:max-w-[340px] [&>.plate]:px-6 [&>.plate]:pt-7 [&>.plate]:pb-5" : "place-items-center"}`}>{prompt}</div>
        )}

        {/* The result, written on a scrap above the table */}
        {resultReady && state && !tFinished && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[17%] z-10 flex flex-col items-center gap-3">
            {state.rabbit?.length ? (
              <p className="m-0 font-pix text-[13px] text-paper-dim">
                Habría salido: <b className="text-paper">{state.rabbit.map(prettyCard).join("  ")}</b>
              </p>
            ) : null}
            <p className="scrap m-0 px-5 py-2 stencil text-2xl">
              {iWon
                ? "Te llevas el bote"
                : (state.winners ?? []).map((w) => `${w.id === uid ? "Tú" : seatName(w.id)} +${fmt(w.amount)}`).join("   ")}
            </p>
            {canShow && (
              <button type="button" onClick={() => void game.show().then(report)} disabled={busy === "show"} className="btn-brass btn-sm pointer-events-auto">
                Enseñar mis cartas
              </button>
            )}
            {busted && !tourney ? (
              <button type="button" onClick={rebuy} disabled={busy === "rebuy"} className="tk tk-sm tk-red pointer-events-auto">
                Recomprar
              </button>
            ) : canDeal && !state.deadline ? (
              <button type="button" onClick={deal} disabled={busy === "start"} className="tk tk-sm tk-red pointer-events-auto">
                Repartir
              </button>
            ) : state.deadline ? (
              <p className="m-0 font-pix text-[13px] text-paper-dim">La próxima mano se reparte sola.</p>
            ) : null}
          </div>
        )}

        {/* Bottom-left: voice, chat, quick lines */}
        <div className={`absolute left-4 z-20 flex items-end gap-2 transition-[bottom] duration-500 ${isMyTurn ? "bottom-[128px]" : "bottom-4"}`}>
          {amSeated && <VoicePanel code={code ?? ""} uid={uid} displayName={name} seed={seed} canLeave />}
          <NoirChat code={code} uid={uid} name={name} seed={seed} messages={chat} />
          {amSeated && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setPhrasesOpen((v) => !v);
                  setGesturesOpen(false);
                }}
                className="btn-brass btn-sm"
                aria-expanded={phrasesOpen}
              >
                Decir
              </button>
              {phrasesOpen && (
                <div className="absolute bottom-12 left-0 flex w-64 flex-col items-start gap-1.5">
                  {CANNED_PHRASES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        sendPhrase(p);
                        setPhrasesOpen(false);
                      }}
                      className="scrap px-3 py-1 text-left text-sm hover:brightness-110"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {amSeated && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setGesturesOpen((v) => !v);
                  setPhrasesOpen(false);
                }}
                className="btn-brass btn-sm"
                aria-expanded={gesturesOpen}
              >
                Gesto
              </button>
              {gesturesOpen && (
                <div className="absolute bottom-12 left-0 flex w-56 flex-col items-start gap-1.5">
                  {GESTURES.map((g) => (
                    <button
                      key={g.kind}
                      type="button"
                      onClick={() => {
                        void game.react(g.kind).then(report);
                        setGesturesOpen(false);
                      }}
                      className="scrap px-3 py-1 text-left text-sm hover:brightness-110"
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {amSeated && me && state && (
          <NoirActionRail
            active={isMyTurn && busy !== "act"}
            turnKey={`${state.handNum}:${state.phase}:${state.deadline ?? 0}`}
            stack={me.chips}
            myBet={me.bet}
            currentBet={state.currentBet ?? 0}
            minRaise={state.minRaise ?? state.bb}
            bb={state.bb}
            pot={state.pot}
            onMove={handleMove}
          />
        )}
      </NoirTable>

      {optionsOpen && code && (
        <NoirTableLedger
          code={code}
          joinUrl={joinUrl}
          state={state}
          uid={uid}
          isOwner={isOwner}
          history={history}
          onConfig={(cfg) => game.config({ sb: cfg.rules.levels[0]?.sb ?? cfg.sb, bb: cfg.rules.levels[0]?.bb ?? cfg.bb, stack: cfg.stack, rules: cfg.rules })}
          onApprove={(id) => void game.approve(id).then(report)}
          onDeny={(id) => void game.deny(id).then(report)}
          onKick={(id) => {
            if (confirm(`¿Echar a ${seatName(id)} de la mesa? Sus fichas vuelven a su monedero.`)) void game.kick(id).then(report);
          }}
          onStandUp={
            present
              ? () => {
                  standUp();
                  setOptionsOpen(false);
                }
              : undefined
          }
          onClose={() => setOptionsOpen(false)}
        />
      )}

      {runs && (
        <NoirRuns
          runs={runs}
          names={Object.fromEntries((state?.seats ?? []).map((s) => [s.id, s.id === uid ? "Tú" : s.name]))}
          onClose={() => setClosedRunsHand(state?.handNum ?? 0)}
        />
      )}
    </>
  );
}
