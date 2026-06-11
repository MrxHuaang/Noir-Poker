"use client";
// Server-backed online table (modo estratégico). El juego corre en el servidor
// Go autoritativo (NEXT_PUBLIC_GAME_WS_URL); esta página SOLO renderiza estado
// y manda acciones — cero reglas de juego en el cliente. Usa la misma mesa rica
// (TableShell/RoundPokerTable + BettingDock) que el modo legacy, alimentada por
// el adaptador puro de src/lib/onlineTable.ts.
//
// Economía: buy-in en escrow al sentarse (monto = startStack del servidor);
// cash-out + record-session al salir (stack final lo reporta el Go server via
// /stacks; las manos verificadas se cuentan de Supabase). El cierre de pestaña
// se cubre con pagehide + fetch keepalive.
import { DesktopOnlyGate } from "@/components/ui/DesktopOnlyGate";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Clock, MessageSquareQuote, Pause, Play, RefreshCw, Trophy, UserRound } from "lucide-react";
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
  const isSpectator = search.get("spectator") === "1";

  const { isGuest, loading: authLoading } = useAuth();
  // Los invitados no se sientan (el buy-in de monedas exige cuenta real); solo
  // pueden observar. No abrir el WS como jugador hasta saberlo.
  const guestBlocked = isGuest && !isSpectator;
  const { connected, status, state, hole, uid, name, seed, error, start, action, config, pause, resume, getToken } =
    useServerGame(authLoading || guestBlocked ? null : code, isSpectator);

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
  const configSent = useRef(false);
  useEffect(() => {
    if (!connected || configSent.current) return;
    const sb = Number(search.get("sb"));
    const bb = Number(search.get("bb"));
    const stack = Number(search.get("stack"));
    const runItN = Number(search.get("runItN")) || undefined;
    const blindLevelSecs = Number(search.get("blindLevelSecs")) || undefined;
    if (sb > 0 || bb > 0 || stack > 0 || runItN || blindLevelSecs) {
      config(sb || 0, bb || 0, stack || 0, runItN, blindLevelSecs);
      configSent.current = true;
    }
  }, [connected, search, config]);

  // --- Economía -------------------------------------------------------------
  // Escrow del buy-in al recibir el primer estado: el monto es el startStack
  // que el servidor realmente otorga (no un parámetro de URL adivinado).
  const escrowRef = useRef<{ code: string; amount: number } | null>(null);
  const settledRef = useRef(false);
  const tokenRef = useRef<string | null>(null);
  const chipsRef = useRef(0);
  const biggestPotRef = useRef(0);

  useEffect(() => {
    getToken().then((t) => {
      tokenRef.current = t;
    });
  }, [getToken]);

  useEffect(() => {
    if (isSpectator || guestBlocked || !code || !uid || !state || escrowRef.current) return;
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
      }
    })();
  }, [isSpectator, guestBlocked, code, uid, state, getToken]);

  // Stack y bote más grande visibles, para net/stats del record-session.
  useEffect(() => {
    if (!state || !uid) return;
    const seat = state.seats.find((s) => s.id === uid);
    if (seat) chipsRef.current = seat.chips + (seat.bet ?? 0);
    if (state.pot > biggestPotRef.current) biggestPotRef.current = state.pot;
  }, [state, uid]);

  // Liquidación: cash-out (stack final lo reporta el servidor Go) + sesión
  // (XP/historial; las manos se verifican contra Supabase). Una sola vez.
  const settle = useMemo(() => {
    return (keepalive: boolean) => {
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

  // --- Vista ----------------------------------------------------------------
  const view = useMemo(() => adaptOnlineState(state, hole), [state, hole]);
  const mySeat = useMemo(
    () => view.seats.find((s) => s.id === uid) ?? null,
    [view.seats, uid],
  );
  const isMyTurn = !!(uid && state?.toAct === uid && !state?.paused);
  const isOwner = !!(uid && state?.owner === uid);
  const betweenHands = !state || state.phase === "idle" || state.phase === "showdown";
  const showdown = state?.phase === "showdown";
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
    if (isSpectator || confirm("¿Salir de la mesa? Tu stack se liquida al salir.")) {
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

  // Invitados: el online usa monedas, requiere cuenta real (o modo espectador).
  if (guestBlocked) {
    return (
      <div className="fixed inset-0 bg-[#0b0b0b] flex items-center justify-center p-6">
        <div className="glass-panel flex flex-col items-center gap-4 rounded-[28px] px-8 py-8 max-w-sm text-center">
          <UserRound className="w-8 h-8 text-accent-400" />
          <h1 className="text-lg font-black text-zinc-100">Necesitas una cuenta</h1>
          <p className="text-sm text-zinc-400">
            Las mesas online juegan con monedas de tu perfil. Inicia sesión para
            sentarte, o entra como espectador.
          </p>
          <div className="flex gap-2">
            <Link
              href="/login"
              className="px-4 py-2 rounded-xl bg-accent-500/20 ring-1 ring-accent-400/40 text-accent-100 font-bold text-sm btn-press"
            >
              Iniciar sesión
            </Link>
            <Link
              href={`/play/online/${code}?spectator=1`}
              className="px-4 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-300 font-bold text-sm btn-press"
            >
              Espectador
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const waitingCount = view.seats.length;

  const centerOverlay = (
    <>
      {!state && (
        <div className="glass-panel flex items-center gap-3 rounded-[24px] px-6 py-4 text-zinc-400 text-sm">
          <RefreshCw className="w-4 h-4 motion-safe:animate-spin" />
          {error ?? (status === "error" ? "Sin conexión con el servidor" : "Conectando con el servidor…")}
        </div>
      )}

      {state && betweenHands && !showdown && (
        <div className="glass-panel flex flex-col items-center gap-4 rounded-[28px] px-6 py-5">
          {waitingCount < 2 ? (
            <>
              <div className="px-5 py-2.5 rounded-2xl bg-zinc-900/80 ring-1 ring-white/10 text-zinc-400 text-sm font-bold uppercase tracking-widest">
                Esperando jugadores ({waitingCount}/2)
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
            {isOwner && (
              <button
                type="button"
                onClick={start}
                className="mt-3 inline-flex items-center gap-2 px-5 py-2 rounded-full bg-accent-500/20 ring-1 ring-accent-400/40 text-accent-100 text-xs font-black uppercase tracking-widest btn-press"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> Siguiente mano
              </button>
            )}
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
        ownHole={isSpectator ? null : view.ownHole}
        revealedHoles={view.revealedHoles}
        lastAction={state?.lastAction}
        turnTimeMs={30_000}
        isSpectator={isSpectator}
        topLeft={
          <OptionsMenu
            name={name}
            seed={seed}
            onOpenSettings={() => setOptionsOpen(true)}
            onLeave={handleLeave}
            leaveLabel={isSpectator ? "Dejar de observar" : "Salir de la mesa"}
          />
        }
        topCenter={topCenter}
        bottomLeft={
          <>
            {!isSpectator && (
              <VoicePanel
                code={code ?? ""}
                uid={uid}
                displayName={name}
                seed={seed}
                canLeave={false}
              />
            )}
            <ChatPanel code={code} uid={uid} name={name} seed={seed} messages={chat} />
            {!isSpectator && (
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
          !isSpectator && mySeat ? (
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

      {/* Pausa: el dueño puede pausar/reanudar desde un chip discreto */}
      {!isSpectator && isOwner && state && !betweenHands && (
        <div className="fixed top-4 right-4 z-[60]">
          <button
            type="button"
            onClick={state.paused ? resume : pause}
            className="glass-icon-button btn-press rounded-2xl p-3 text-zinc-300 shadow-xl"
            aria-label={state.paused ? "Reanudar" : "Pausar"}
          >
            {state.paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
          </button>
        </div>
      )}
    </>
  );
}
