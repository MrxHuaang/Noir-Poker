"use client";
// Server-backed online table (modo estratégico). El juego corre en el servidor
// Go autoritativo (NEXT_PUBLIC_GAME_WS_URL); esta página SOLO renderiza estado
// y manda acciones — cero reglas de juego en el cliente. Usa la misma mesa rica
// (TableShell/RoundPokerTable + BettingDock) que el modo legacy, alimentada por
// el adaptador puro de src/lib/onlineTable.ts.
//
// Flujo de entrada (estilo PokerStars): se entra OBSERVANDO — sin formularios.
// Ves la mesa y los jugadores de inmediato; "Sentarme" te conecta como jugador
// (el servidor te sienta si hay sitio o te pone en fila si la mesa está llena).
// Los invitados pueden observar; sentarse pide cuenta real (monedas).
//
// Economía: buy-in en escrow al obtener asiento (monto = startStack del
// servidor); cash-out + record-session al levantarse o salir (stack final lo
// reporta el Go server via /stacks; las manos verificadas se cuentan de
// Supabase). El cierre de pestaña se cubre con pagehide + fetch keepalive.
import { DesktopOnlyGate } from "@/components/ui/DesktopOnlyGate";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Armchair, Clock, Hourglass, MessageSquareQuote, Pause, Play, RefreshCw, Trophy, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useServerGame } from "@/hooks/useServerGame";
import { useChat } from "@/hooks/useChat";
import { useTableChat, CANNED_PHRASES } from "@/hooks/useTableChat";
import { useOnlineHistory } from "@/hooks/useOnlineHistory";
import { adaptOnlineState, adaptOnlineRuns } from "@/lib/onlineTable";
import { callEconomy, callEconomyKeepalive } from "@/lib/economyClient";
import { formatChips, type BettingAction } from "@/lib/betting";
import { TableShell } from "@/components/table/TableShell";
import { BettingDock } from "@/components/betting/BettingDock";
import { OptionsMenu } from "@/components/settings/OptionsMenu";
import { OnlineOptionsPanel } from "@/components/online/OnlineOptionsPanel";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { RunResults } from "@/components/table/RunResults";

const VoicePanel = dynamic(() => import("@/components/voice/VoicePanel"), {
  ssr: false,
});

const MAX_SEATS = 9;

export default function PlayOnlinePage() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() ?? null;
  return (
    <DesktopOnlyGate roomCode={code ?? undefined}>
      <PlayOnlinePageInner />
    </DesktopOnlyGate>
  );
}

function PlayOnlinePageInner() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() ?? null;
  const search = useSearchParams();
  const router = useRouter();
  // ?spectator=1: espectador puro por URL (sin botón de sentarse).
  const urlSpectator = search.get("spectator") === "1";
  // ?casual=1: sala sin monedas — el creador lo propaga; lo confirmamos con state.casual.
  const urlCasual = search.get("casual") === "1";

  const { isGuest, loading: authLoading } = useAuth();

  // Intención de sentarse. El creador llega con params de mesa en la URL: se
  // sienta de una (y reclama la autoridad de la sala). Los demás entran
  // observando y deciden con el botón.
  const [wantSeat, setWantSeat] = useState<boolean>(() => {
    if (urlSpectator) return false;
    return Number(search.get("sb")) > 0 || Number(search.get("stack")) > 0;
  });
  const [showLoginCta, setShowLoginCta] = useState(false);
  const [seatOverlayDismissed, setSeatOverlayDismissed] = useState(false);

  // casualConfirmed empieza con la señal de la URL y se actualiza cuando
  // llega state.casual=true del servidor. Necesita ser state (no ref) para
  // que asSpectator se recalcule y el WS reconecte cuando el invitado da click en Sentarme.
  const [casualConfirmed, setCasualConfirmed] = useState(urlCasual);
  // Conexión: jugador con intención + (cuenta real O modo casual); si no, espectador.
  const asSpectator = urlSpectator || !wantSeat || (isGuest && !casualConfirmed);
  const { connected, status, state, hole, uid, name, seed, error, start, action, config, pause, resume, getToken } =
    useServerGame(authLoading ? null : code, asSpectator);

  // Confirmar modo casual tan pronto llegue el primer state del servidor.
  const isCasual = casualConfirmed || !!state?.casual;
  useEffect(() => {
    if (state?.casual && !casualConfirmed) setCasualConfirmed(true);
  }, [state?.casual, casualConfirmed]);

  const chat = useChat(code);
  const { send: sendPhrase, activePhrases } = useTableChat(code, uid);
  const showdownKey = state?.phase === "showdown" ? state.handNum : 0;
  const { records: history } = useOnlineHistory(code, showdownKey);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [phrasesOpen, setPhrasesOpen] = useState(false);
  const [closedRunsHand, setClosedRunsHand] = useState(0);
  const [econError, setEconError] = useState<string | null>(null);

  // Aplicar config de sala una vez al conectar (solo el enlace del creador trae
  // estos params; los joins normales usan los defaults del servidor).
  // Reintentar hasta que el state del servidor REFLEJE la config: send() es
  // silencioso si el WS aún no está OPEN (churn de reconexiones al cargar el
  // perfil), así que un solo intento se perdía y la sala quedaba sin `casual`,
  // con blinds default, etc. Solo se reintenta en fase idle (nunca mid-hand).
  const configSent = useRef(false);
  useEffect(() => {
    if (!connected || configSent.current || asSpectator) return;
    const sb = Number(search.get("sb"));
    const bb = Number(search.get("bb"));
    const stack = Number(search.get("stack"));
    const runItN = Number(search.get("runItN")) || undefined;
    const blindLevelSecs = Number(search.get("blindLevelSecs")) || undefined;
    const wantsConfig = sb > 0 || bb > 0 || stack > 0 || runItN || blindLevelSecs || urlCasual;
    if (!wantsConfig) {
      configSent.current = true;
      return;
    }
    if (!state) return; // espera el primer snapshot para poder verificar el echo
    if (state.phase !== "idle") {
      configSent.current = true; // la mano ya empezó: no tocar la config
      return;
    }
    const applied =
      (!urlCasual || !!state.casual) &&
      (!(sb > 0) || state.sb === sb) &&
      (!(bb > 0) || state.bb === bb) &&
      (!(stack > 0) || state.startStack === stack);
    if (applied) {
      configSent.current = true;
      return;
    }
    config(sb || 0, bb || 0, stack || 0, runItN, blindLevelSecs, urlCasual || undefined);
  }, [connected, state, search, config, asSpectator, urlCasual]);

  // --- Posición propia ------------------------------------------------------
  const amSeated = !!(uid && state?.seats.some((s) => s.id === uid) && !asSpectator);
  const queuePos = uid && state?.waiting ? state.waiting.indexOf(uid) : -1;
  const inQueue = !asSpectator && queuePos >= 0;

  // --- Economía -------------------------------------------------------------
  // Escrow del buy-in al obtener asiento: el monto es el startStack que el
  // servidor realmente otorga (no un parámetro de URL adivinado).
  // En modo casual todo el bloque de economía se omite.
  const escrowRef = useRef<{ code: string; amount: number } | null>(null);
  const settledRef = useRef(false);
  const tokenRef = useRef<string | null>(null);
  const chipsRef = useRef(0);
  const biggestPotRef = useRef(0);
  // Ref para que settle() pueda leer isCasual sin reinicializarse como función.
  const casualRef = useRef(isCasual);
  useEffect(() => { casualRef.current = isCasual; }, [isCasual]);

  useEffect(() => {
    getToken().then((t) => {
      tokenRef.current = t;
    });
  }, [getToken]);

  useEffect(() => {
    if (!amSeated || !code || !uid || !state || escrowRef.current) return;
    // Modo casual: sin compra de fichas. Se usa isCasual (URL + confirmación del
    // server) y no state.casual a secas: el creador guest llegaba con casual=1
    // pero el primer snapshot aún no traía el flag, el buy-in corría, fallaba
    // con 400 y lo bajaba a espectador (perdiendo asiento y autoridad de sala).
    if (isCasual) return;
    const amount = state.startStack || 1000;
    escrowRef.current = { code, amount };
    settledRef.current = false;
    (async () => {
      const token = await getToken();
      if (!token) return;
      tokenRef.current = token;
      try {
        // mode:"online": reconcileEscrows no auto-reembolsa mientras se juega.
        await callEconomy(token, "buy-in", { code, amount, mode: "online" });
        setEconError(null);
      } catch (err) {
        escrowRef.current = null;
        setEconError(err instanceof Error ? err.message : "No se pudo hacer el buy-in");
        // Sin escrow no se juega: volver a observador.
        setWantSeat(false);
      }
    })();
  }, [amSeated, code, uid, state, getToken, isCasual]);

  // Stack y bote más grande visibles, para net/stats del record-session.
  useEffect(() => {
    if (!state || !uid) return;
    const seat = state.seats.find((s) => s.id === uid);
    if (seat) chipsRef.current = seat.chips + (seat.bet ?? 0);
    if (state.pot > biggestPotRef.current) biggestPotRef.current = state.pot;
  }, [state, uid]);

  // Liquidación: cash-out (stack final lo reporta el servidor Go) + sesión
  // (XP/historial; las manos se verifican contra Supabase). Una sola vez por
  // escrow; volver a sentarse abre un escrow nuevo.
  const settle = useMemo(() => {
    return (keepalive: boolean) => {
      if (casualRef.current) return; // modo casual: sin liquidación
      const esc = escrowRef.current;
      const token = tokenRef.current;
      if (!esc || !token || settledRef.current) return;
      settledRef.current = true;
      escrowRef.current = null;
      const session = {
        code: esc.code,
        roomName: `Online ${esc.code}`,
        handsPlayed: 0, // el servidor cuenta las manos verificadas
        handsWon: 0,
        net: chipsRef.current - esc.amount,
        biggestPot: biggestPotRef.current,
        mode: "online",
      };
      if (keepalive) {
        callEconomyKeepalive(token, "cash-out", { code: esc.code });
        callEconomyKeepalive(token, "record-session", { session });
      } else {
        callEconomy(token, "cash-out", { code: esc.code })
          .catch(() => {})
          .finally(() => {
            callEconomy(token, "record-session", { session }).catch(() => {});
          });
      }
    };
  }, []);

  // SPA: liquidar al desmontar. Cierre de pestaña / navegación dura: pagehide
  // con keepalive (el unmount de React no corre en ese caso).
  useEffect(() => {
    const onPageHide = () => settle(true);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      settle(false);
    };
  }, [settle]);

  // --- Acciones de asiento ----------------------------------------------------
  function handleSit() {
    if (isGuest && !isCasual) {
      setShowLoginCta(true);
      return;
    }
    setEconError(null);
    setWantSeat(true); // reconecta como jugador; el servidor sienta o encola
  }

  function standUp() {
    settle(false); // liquida el escrow con el stack actual
    setWantSeat(false); // reconecta como espectador (libera el asiento)
  }

  function rebuy() {
    // Recompra = levantarse (liquida el stack en 0) y volver a sentarse: el
    // servidor otorga un stack fresco y el cliente abre un escrow nuevo. El
    // pequeño retraso deja que el servidor procese la desconexión primero.
    standUp();
    setTimeout(() => setWantSeat(true), 900);
  }

  // --- Vista ----------------------------------------------------------------
  const view = useMemo(() => adaptOnlineState(state, hole), [state, hole]);
  const mySeat = useMemo(
    () => view.seats.find((s) => s.id === uid) ?? null,
    [view.seats, uid],
  );
  const isMyTurn = !!(uid && state?.toAct === uid && !state?.paused && amSeated);
  const isOwner = !!(uid && state?.owner === uid && amSeated);
  const betweenHands = !state || state.phase === "idle" || state.phase === "showdown";
  const showdown = state?.phase === "showdown";
  const tableFull = (state?.seats.length ?? 0) >= MAX_SEATS;
  const busted = amSeated && betweenHands && (mySeat?.chips ?? 0) === 0;
  const runs = useMemo(
    () =>
      showdown && state?.handNum !== closedRunsHand
        ? adaptOnlineRuns(state?.runs, state?.reveals)
        : null,
    [showdown, state, closedRunsHand],
  );

  const joinUrl =
    typeof window !== "undefined" && code
      ? `${window.location.origin}/play/online/${code}`
      : "";

  function handleAction(a: BettingAction, amount?: number) {
    // El modo online no soporta show-card / vote-run (decisiones del legacy).
    if (a === "show-card" || a === "vote-run") return;
    action(a, amount ?? 0);
  }

  function handleLeave() {
    if (!amSeated || confirm("¿Salir de la sala? Tu stack se liquida al salir.")) {
      settle(false);
      router.push("/play/online");
    }
  }

  if (authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0b0b0b] text-zinc-500 text-sm">
        Conectando…
      </div>
    );
  }

  const seatedCount = state?.seats.length ?? 0;

  const centerOverlay = (
    <>
      {!state && (
        <div className="glass-panel flex items-center gap-3 rounded-[24px] px-6 py-4 text-zinc-400 text-sm">
          <RefreshCw className="w-4 h-4 motion-safe:animate-spin" />
          {status === "reconnecting"
            ? "Iniciando servidor… puede tardar hasta 60 s"
            : error ?? "Conectando con el servidor…"}
        </div>
      )}

      {/* Observador: ve la mesa y decide. Sentarse / hacer fila / seguir mirando. */}
      {/* Show when: not yet seated AND (hasn't asked to sit, OR is a guest who can't sit). */}
      {state && !urlSpectator && !amSeated && !inQueue && (!wantSeat || isGuest) && !seatOverlayDismissed && (
        <div className="glass-panel flex flex-col items-center gap-3 rounded-[28px] px-6 py-5">
          {isGuest && !isCasual ? (
            <>
              <UserRound className="w-6 h-6 text-accent-400" />
              <p className="text-sm text-zinc-300 text-center max-w-[260px]">
                Para sentarte necesitas una cuenta: las mesas juegan con las
                monedas de tu perfil.
              </p>
              <div className="flex gap-2">
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-xl bg-accent-500/20 ring-1 ring-accent-400/40 text-accent-100 font-bold text-sm btn-press"
                >
                  Iniciar sesión
                </Link>
                <button
                  type="button"
                  onClick={() => setSeatOverlayDismissed(true)}
                  className="px-4 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-300 font-bold text-sm btn-press"
                >
                  Seguir mirando
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSit}
                className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-accent-700 hover:bg-accent-600 text-accent-100 font-black text-sm uppercase tracking-widest transition shadow-2xl shadow-accent-700/25 btn-press"
              >
                <Armchair className="w-5 h-5" />
                {tableFull ? "Hacer fila" : "Sentarme a la mesa"}
              </button>
              <span className="text-[11px] text-zinc-500">
                {seatedCount}/{MAX_SEATS} en mesa
                {tableFull ? " — está llena, entras cuando se libere un asiento" : ""}
              </span>
            </>
          )}
        </div>
      )}

      {/* En fila: posición + salida. El servidor te sienta solo. */}
      {state && inQueue && (
        <div className="glass-panel flex flex-col items-center gap-3 rounded-[28px] px-6 py-5">
          <div className="flex items-center gap-2 text-accent-200 text-sm font-bold">
            <Hourglass className="w-4 h-4 animate-pulse" />
            En fila — puesto #{queuePos + 1}
          </div>
          <span className="text-[11px] text-zinc-500">
            Te sentamos en cuanto se libere un asiento.
          </span>
          <button
            type="button"
            onClick={() => setWantSeat(false)}
            className="px-4 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-300 font-bold text-xs btn-press"
          >
            Salir de la fila
          </button>
        </div>
      )}

      {/* Pediste asiento a mitad de mano: entras al repartir la siguiente. */}
      {state && wantSeat && !asSpectator && !amSeated && !inQueue && !betweenHands && (
        <div className="glass-panel flex items-center gap-2 rounded-[24px] px-5 py-3 text-zinc-400 text-xs font-bold uppercase tracking-widest">
          <Clock className="w-3.5 h-3.5 text-accent-500 animate-pulse" />
          Entras en la próxima mano
        </div>
      )}

      {/* Sentado, entre manos: repartir (dueño) / esperar / recomprar. */}
      {state && amSeated && betweenHands && !showdown && (
        <div className="glass-panel flex flex-col items-center gap-4 rounded-[28px] px-6 py-5">
          {busted ? (
            <button
              type="button"
              onClick={rebuy}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent-700 hover:bg-accent-600 text-accent-100 font-black text-xs uppercase tracking-widest transition btn-press"
            >
              <RefreshCw className="w-4 h-4" /> Recomprar ({formatChips(state.startStack || 1000)})
            </button>
          ) : seatedCount < 2 ? (
            <>
              <div className="px-5 py-2.5 rounded-2xl bg-zinc-900/80 ring-1 ring-white/10 text-zinc-400 text-sm font-bold uppercase tracking-widest">
                Esperando jugadores ({seatedCount}/2)
              </div>
              <p className="text-[11px] text-zinc-500">
                Comparte el código <span className="font-mono font-black text-accent-300">{code}</span> desde el menú.
              </p>
            </>
          ) : isOwner ? (
            <button
              type="button"
              onClick={start}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-accent-700 hover:bg-accent-600 text-accent-100 font-black text-sm uppercase tracking-widest transition shadow-2xl shadow-accent-700/25 btn-press"
            >
              <Play className="w-5 h-5 fill-current" /> Repartir
            </button>
          ) : (
            <div className="flex items-center gap-2 text-zinc-500 text-[11px] font-bold uppercase tracking-widest">
              <Clock className="w-3.5 h-3.5 text-accent-500 animate-pulse" />
              Esperando a que {view.seats.find((s) => s.id === state.owner)?.name ?? "el anfitrión"} reparta…
            </div>
          )}
        </div>
      )}

      {showdown && state && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in duration-500 pointer-events-auto">
          <div className="glass-panel flex flex-col items-center rounded-[30px] px-8 py-4 ring-1 ring-accent-400/40">
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-accent-400 mb-1">
              Mano terminada
            </span>
            <h4 className="text-xl font-black text-white flex items-center gap-2">
              {view.winners?.includes(uid ?? "") && (
                <Trophy className="w-5 h-5 text-accent-400" />
              )}
              {view.winners?.includes(uid ?? "")
                ? "¡Has ganado!"
                : (state.winners ?? [])
                    .map((w) => `${view.seats.find((s) => s.id === w.id)?.name ?? w.id.slice(0, 6)} +${formatChips(w.amount)}`)
                    .join(" · ")}
            </h4>
            {busted ? (
              <button
                type="button"
                onClick={rebuy}
                className="mt-3 inline-flex items-center gap-2 px-5 py-2 rounded-full bg-accent-500/20 ring-1 ring-accent-400/40 text-accent-100 text-xs font-black uppercase tracking-widest btn-press"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Recomprar
              </button>
            ) : isOwner ? (
              <button
                type="button"
                onClick={start}
                className="mt-3 inline-flex items-center gap-2 px-5 py-2 rounded-full bg-accent-500/20 ring-1 ring-accent-400/40 text-accent-100 text-xs font-black uppercase tracking-widest btn-press"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> Siguiente mano
              </button>
            ) : null}
          </div>
        </div>
      )}
    </>
  );

  const topCenter = (
    <div className="flex flex-col items-center gap-1.5">
      {status === "reconnecting" && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warn-500/15 ring-1 ring-warn-400/30 text-warn-200 text-[10px] font-black uppercase tracking-[0.2em]">
          <RefreshCw className="w-3 h-3 motion-safe:animate-spin" /> Reconectando…
        </span>
      )}
      {state?.paused && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warn-500/15 ring-1 ring-warn-400/30 text-warn-200 text-[10px] font-black uppercase tracking-[0.2em]">
          <Pause className="w-3 h-3" /> Partida en pausa
        </span>
      )}
      {econError && (
        <span className="px-3 py-1.5 rounded-full bg-rose-500/15 ring-1 ring-rose-400/30 text-rose-200 text-[10px] font-bold">
          {econError}
        </span>
      )}
      {(state?.waiting?.length ?? 0) > 0 && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] ring-1 ring-white/10 text-zinc-400 text-[10px] font-bold uppercase tracking-[0.2em]">
          <Hourglass className="w-3 h-3" /> {state!.waiting!.length} en fila
        </span>
      )}
      {/* Frases rápidas de los jugadores (broadcast efímero) */}
      {Object.entries(activePhrases).map(([senderUid, phrase]) => (
        <span
          key={senderUid}
          className="px-3 py-1.5 rounded-full bg-accent-500/15 ring-1 ring-accent-400/25 text-accent-100 text-[11px] font-bold animate-in fade-in slide-in-from-top-2"
        >
          {view.seats.find((s) => s.id === senderUid)?.name ?? "Alguien"}: {phrase}
        </span>
      ))}
    </div>
  );

  return (
    <>
      <TableShell
        seats={view.seats}
        community={view.community}
        betting={view.betting}
        winners={view.winners}
        theme="noir"
        roomCode={code ?? undefined}
        selfUid={uid}
        ownHole={amSeated ? view.ownHole : null}
        revealedHoles={view.revealedHoles}
        lastAction={state?.lastAction}
        turnTimeMs={30_000}
        isSpectator={urlSpectator}
        topLeft={
          <OptionsMenu
            name={name}
            seed={seed}
            onOpenSettings={() => setOptionsOpen(true)}
            onLeave={handleLeave}
            leaveLabel={amSeated ? "Salir de la mesa" : "Salir de la sala"}
          />
        }
        topCenter={topCenter}
        topRight={
          isOwner && state && !betweenHands ? (
            <button
              type="button"
              onClick={state.paused ? resume : pause}
              className="glass-icon-button btn-press rounded-2xl p-3 text-zinc-300 shadow-xl"
              aria-label={state.paused ? "Reanudar" : "Pausar"}
            >
              {state.paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            </button>
          ) : undefined
        }
        bottomLeft={
          <>
            {amSeated && (
              <VoicePanel
                code={code ?? ""}
                uid={uid}
                displayName={name}
                seed={seed}
                canLeave={false}
              />
            )}
            <ChatPanel code={code} uid={uid} name={name} seed={seed} messages={chat} />
            {amSeated && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPhrasesOpen((v) => !v)}
                  className="glass-icon-button btn-press rounded-2xl p-3 text-zinc-300 shadow-xl"
                  aria-label="Frases rápidas"
                  aria-expanded={phrasesOpen}
                >
                  <MessageSquareQuote className="w-5 h-5" />
                </button>
                {phrasesOpen && (
                  <div className="absolute bottom-14 left-0 z-50 w-56 rounded-2xl bg-zinc-950/95 ring-1 ring-white/10 p-2 flex flex-wrap gap-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                    {CANNED_PHRASES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          sendPhrase(p);
                          setPhrasesOpen(false);
                        }}
                        className="text-[10px] font-bold px-2 py-1 rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08] text-zinc-400 hover:bg-accent-500/15 hover:ring-accent-400/30 hover:text-accent-200 transition"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        }
        bottomRight={
          amSeated && mySeat ? (
            <BettingDock
              seat={mySeat}
              name={mySeat.name}
              seed={mySeat.seed}
              betting={view.betting}
              holeCards={view.ownHole}
              community={view.community}
              isMyTurn={isMyTurn}
              turnTimeMs={30_000}
              hasResult={showdown}
              onAction={handleAction}
            />
          ) : null
        }
        centerOverlay={centerOverlay}
      />

      {optionsOpen && code && (
        <OnlineOptionsPanel
          code={code}
          joinUrl={joinUrl}
          isOwner={isOwner}
          sb={state?.sb ?? 5}
          bb={state?.bb ?? 10}
          startStack={state?.startStack ?? 1000}
          history={history}
          onConfig={config}
          onStandUp={amSeated ? () => { standUp(); setOptionsOpen(false); } : undefined}
          onClose={() => setOptionsOpen(false)}
        />
      )}

      {runs && (
        <RunResults
          runs={runs}
          players={view.seats.map((s) => ({
            id: s.id,
            name: s.name,
            seed: s.seed,
            createdAt: 0,
          }))}
          onClose={() => setClosedRunsHand(state?.handNum ?? 0)}
        />
      )}
    </>
  );
}
