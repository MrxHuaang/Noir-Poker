"use client";
// Mesa online (modo estratégico). El juego es autoritativo en el servidor: cada
// jugada es un POST a /api/online que corre una transacción de Firestore, y el
// estado público llega por suscripción a onlineRooms/{code}. Esta página SOLO
// renderiza estado y manda acciones — cero reglas de juego en el cliente. Usa
// la misma mesa rica (TableShell/RoundPokerTable + BettingDock) que el modo
// legacy, alimentada por el adaptador puro de src/lib/onlineTable.ts.
//
// Flujo de entrada (estilo PokerStars): se entra OBSERVANDO — sin formularios.
// "Sentarme" te sienta si hay sitio o te pone en fila si la mesa está llena.
// Los invitados pueden observar; sentarse en una mesa con fichas pide cuenta.
//
// Economía: el buy-in (startStack) se descuenta del monedero en la MISMA
// transacción que te sienta, y al levantarte el stack final vuelve al monedero
// también de forma atómica (con el tope del libro de la sala). Si cierras la
// pestaña, tu heartbeat caduca y el servidor te levanta y liquida solo.
import { DesktopOnlyGate } from "@/components/ui/DesktopOnlyGate";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Armchair,
  Clock,
  Hourglass,
  MessageSquareQuote,
  Pause,
  Play,
  RefreshCw,
  Trophy,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOnlineGame } from "@/hooks/useOnlineGame";
import { useChat } from "@/hooks/useChat";
import { useTableChat, CANNED_PHRASES } from "@/hooks/useTableChat";
import { useOnlineHistory } from "@/hooks/useOnlineHistory";
import { adaptOnlineState, adaptOnlineRuns } from "@/lib/onlineTable";
import { formatChips, type BettingAction } from "@/lib/betting";
import { MAX_SEATED, PRESENCE_STALE_MS, TURN_MS } from "@/lib/online/protocol";
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

  const [phrasesOpen, setPhrasesOpen] = useState(false);
  const [closedRunsHand, setClosedRunsHand] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [showLoginCta, setShowLoginCta] = useState(false);
  const [seatOverlayDismissed, setSeatOverlayDismissed] = useState(false);

  // Reloj grueso para detectar anfitriones con heartbeat caducado.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  // --- Posición propia ------------------------------------------------------
  const amSeated = !!(uid && state?.seats.some((s) => s.id === uid));
  const queuePos = uid && state?.waiting ? state.waiting.indexOf(uid) : -1;
  const inQueue = queuePos >= 0;
  const joiningNext = !!(uid && state?.joining?.includes(uid));
  const present = amSeated || inQueue || joiningNext;

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

  async function standUp() {
    report(await game.leave());
  }

  async function rebuy() {
    report(await game.rebuy());
  }

  async function deal() {
    report(await game.start());
  }

  function handleAction(a: BettingAction, amount?: number) {
    // El modo online no soporta show-card / vote-run (decisiones del legacy).
    if (a === "show-card" || a === "vote-run") return;
    if (busy === "act") return;
    game.act(a, amount ?? 0).then(report);
  }

  async function handleLeave() {
    if (present && !confirm("¿Salir de la sala? Tu stack vuelve a tu monedero al salir.")) return;
    if (present) await game.leave();
    router.push("/play/online");
  }

  // --- Vista ----------------------------------------------------------------
  const view = useMemo(() => adaptOnlineState(state, hole), [state, hole]);
  const mySeat = useMemo(
    () => view.seats.find((s) => s.id === uid) ?? null,
    [view.seats, uid],
  );
  const isMyTurn = !!(uid && state?.toAct === uid && !state?.paused && amSeated);
  const isOwner = !!(uid && state?.owner === uid);
  const betweenHands = !state || state.phase === "idle" || state.phase === "showdown";
  const showdown = state?.phase === "showdown";
  const seatedCount = state?.seats.length ?? 0;
  const tableFull = seatedCount >= MAX_SEATED;
  const busted = amSeated && betweenHands && (mySeat?.chips ?? 0) === 0;
  const fundedCount = state?.seats.filter((s) => s.chips > 0).length ?? 0;
  // Si el anfitrión cerró la pestaña, cualquiera sentado puede repartir: el
  // servidor levanta primero a los ausentes y reasigna la autoridad.
  const ownerBeat = state?.owner ? presence[state.owner] : undefined;
  const ownerGone =
    !!state?.owner && state.owner !== uid && ownerBeat !== undefined && now - ownerBeat > PRESENCE_STALE_MS;
  const canDeal = amSeated && (isOwner || ownerGone) && fundedCount >= 2;
  const runs = useMemo(
    () =>
      showdown && state?.handNum !== closedRunsHand
        ? adaptOnlineRuns(state?.runs, state?.reveals)
        : null,
    [showdown, state, closedRunsHand],
  );
  const presenceMap = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const s of state?.seats ?? []) {
      const beat = presence[s.id];
      out[s.id] = beat === undefined || now - beat <= PRESENCE_STALE_MS;
    }
    return out;
  }, [state?.seats, presence, now]);

  const joinUrl =
    typeof window !== "undefined" && code
      ? `${window.location.origin}/play/online/${code}`
      : "";

  if (authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-ink-900 font-display text-xl italic text-muted">
        Conectando…
      </div>
    );
  }

  if (game.status === "missing") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-ink-900 px-6 text-center">
        <p className="display text-4xl text-primary">
          La sala <span className="numeric text-3xl text-accent-300">{code}</span> no existe
        </p>
        <p className="max-w-[40ch] text-sm text-muted">
          Puede que el código esté mal escrito o que la mesa ya se haya cerrado.
        </p>
        <Link href="/play/online" className="btn-primary">
          Abrir una mesa
        </Link>
      </div>
    );
  }

  const primaryBtn = "btn-primary h-12 px-7 text-[15px]";

  const centerOverlay = (
    <>
      {!state && (
        <div className="glass-panel flex items-center gap-3 rounded-2xl px-6 py-4 text-secondary text-sm">
          <RefreshCw className="w-4 h-4 motion-safe:animate-spin" />
          {game.error ?? "Conectando con la sala…"}
        </div>
      )}

      {/* Observador: ve la mesa y decide. Sentarse / hacer fila / seguir mirando. */}
      {state && !present && !seatOverlayDismissed && (
        <div className="glass-panel flex flex-col items-center gap-4 rounded-2xl px-7 py-6">
          {(isGuest && !isCasual) || showLoginCta ? (
            <>
              <UserRound className="w-6 h-6 text-accent-300" aria-hidden />
              <p className="max-w-[30ch] text-center text-sm leading-relaxed text-secondary">
                Para sentarte necesitas una cuenta: esta mesa juega con las
                monedas de tu perfil.
              </p>
              <div className="flex gap-2">
                <Link
                  href={`/login?next=${encodeURIComponent(`/play/online/${code}`)}`}
                  className="btn-primary h-10 px-5"
                >
                  Iniciar sesión
                </Link>
                <button
                  type="button"
                  onClick={() => setSeatOverlayDismissed(true)}
                  className="btn-quiet h-10 px-5"
                >
                  Seguir mirando
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={handleSit} disabled={busy === "sit"} className={primaryBtn}>
                <Armchair className="w-5 h-5" />
                {busy === "sit" ? "Sentando…" : tableFull ? "Hacer fila" : "Sentarme a la mesa"}
              </button>
              <span className="text-xs text-muted">
                <span className="numeric">{seatedCount}/{MAX_SEATED}</span> en mesa
                {isCasual
                  ? " — mesa casual, sin monedas"
                  : ` — buy-in ${formatChips(state.startStack)} monedas`}
                {tableFull ? " — está llena, entras cuando se libere un asiento" : ""}
              </span>
            </>
          )}
        </div>
      )}

      {/* En fila: posición + salida. El servidor te sienta solo. */}
      {state && inQueue && (
        <div className="glass-panel flex flex-col items-center gap-3 rounded-2xl px-7 py-6">
          <p className="eyebrow flex items-center gap-2">
            <Hourglass className="w-3.5 h-3.5 text-accent-300 motion-safe:animate-pulse" aria-hidden />
            En fila
          </p>
          <p className="display text-4xl text-primary">
            Puesto <span className="numeric text-3xl">{queuePos + 1}</span>
          </p>
          <span className="text-xs text-muted">Te sentamos en cuanto se libere un asiento.</span>
          <button type="button" onClick={standUp} className="btn-link text-sm">
            Salir de la fila
          </button>
        </div>
      )}

      {/* Te sentaste a mitad de mano: entras al repartir la siguiente. */}
      {state && joiningNext && (
        <div className="glass-panel flex items-center gap-2 rounded-2xl px-5 py-3 text-sm text-secondary">
          <Clock className="w-3.5 h-3.5 text-accent-300 motion-safe:animate-pulse" aria-hidden />
          Entras en la próxima mano
        </div>
      )}

      {/* Sentado, entre manos: repartir (dueño) / esperar / recomprar. */}
      {state && amSeated && betweenHands && !showdown && (
        <div className="glass-panel flex flex-col items-center gap-4 rounded-2xl px-7 py-6">
          {busted ? (
            <button
              type="button"
              onClick={rebuy}
              disabled={busy === "rebuy"}
              className="btn-primary"
            >
              <RefreshCw className="w-4 h-4" aria-hidden /> Recomprar{" "}
              <span className="numeric">{formatChips(state.startStack)}</span>
            </button>
          ) : seatedCount < 2 ? (
            <>
              <p className="display text-3xl text-primary">
                Esperando rival <span className="numeric text-2xl text-muted">{seatedCount}/2</span>
              </p>
              <p className="text-xs text-muted">
                Comparte el código <span className="numeric text-sm tracking-[0.2em] text-accent-200">{code}</span> desde el menú.
              </p>
            </>
          ) : canDeal ? (
            <button type="button" onClick={deal} disabled={busy === "start"} className={primaryBtn}>
              <Play className="w-5 h-5 fill-current" /> {busy === "start" ? "Repartiendo…" : "Repartir"}
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Clock className="w-3.5 h-3.5 text-accent-300 motion-safe:animate-pulse" aria-hidden />
              Esperando a que {view.seats.find((s) => s.id === state.owner)?.name ?? "el anfitrión"} reparta…
            </div>
          )}
        </div>
      )}

      {showdown && state && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in duration-500 pointer-events-auto">
          <div className="glass-panel flex flex-col items-center rounded-2xl px-8 py-5">
            <span className="eyebrow mb-1">Mano terminada</span>
            <h4 className="display flex items-center gap-2 text-3xl text-primary">
              {view.winners?.includes(uid ?? "") && (
                <Trophy className="w-5 h-5 text-accent-300" aria-hidden />
              )}
              {view.winners?.includes(uid ?? "")
                ? "Te llevas el bote"
                : (state.winners ?? [])
                    .map((w) => `${view.seats.find((s) => s.id === w.id)?.name ?? w.id.slice(0, 6)} +${formatChips(w.amount)}`)
                    .join(" · ")}
            </h4>
            {busted ? (
              <button
                type="button"
                onClick={rebuy}
                disabled={busy === "rebuy"}
                className="btn-primary mt-4 h-10 px-5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Recomprar
              </button>
            ) : canDeal ? (
              <button
                type="button"
                onClick={deal}
                disabled={busy === "start"}
                className="btn-primary mt-4 h-10 px-5"
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
      {state?.paused && (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-warn-500/12 px-3 py-1.5 text-xs font-semibold text-warn-200 ring-1 ring-warn-400/25">
          <Pause className="w-3 h-3" aria-hidden /> Partida en pausa
        </span>
      )}
      {notice && (
        <span role="status" className="rounded-lg bg-rose-500/12 px-3 py-1.5 text-xs font-medium text-rose-200 ring-1 ring-rose-400/25">
          {notice}
        </span>
      )}
      {(state?.waiting?.length ?? 0) > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-bone/[0.05] px-3 py-1.5 text-xs text-secondary ring-1 ring-line">
          <Hourglass className="w-3 h-3" aria-hidden /> <span className="numeric">{state!.waiting!.length}</span> en fila
        </span>
      )}
      {/* Frases rápidas de los jugadores (broadcast efímero) */}
      {Object.entries(activePhrases).map(([senderUid, phrase]) => (
        <span
          key={senderUid}
          className="rounded-lg bg-accent-500/12 px-3 py-1.5 text-xs font-medium text-accent-100 ring-1 ring-accent-400/25 animate-in fade-in slide-in-from-top-2"
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
        turnTimeMs={TURN_MS}
        presenceMap={presenceMap}
        topLeft={
          <OptionsMenu
            name={name}
            seed={seed}
            onOpenSettings={() => setOptionsOpen(true)}
            onLeave={handleLeave}
            leaveLabel={present ? "Salir de la mesa" : "Salir de la sala"}
          />
        }
        topCenter={topCenter}
        topRight={
          isOwner && state && !betweenHands ? (
            <button
              type="button"
              onClick={() => (state.paused ? game.resume() : game.pause()).then(report)}
              className="glass-icon-button btn-press rounded-xl p-3 text-secondary"
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
                  className="glass-icon-button btn-press rounded-xl p-3 text-secondary"
                  aria-label="Frases rápidas"
                  aria-expanded={phrasesOpen}
                >
                  <MessageSquareQuote className="w-5 h-5" />
                </button>
                {phrasesOpen && (
                  <div className="sheet absolute bottom-14 left-0 z-50 flex w-60 flex-wrap gap-1.5 p-2 animate-in fade-in zoom-in-95 duration-150">
                    {CANNED_PHRASES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          sendPhrase(p);
                          setPhrasesOpen(false);
                        }}
                        className="rounded-lg px-2.5 py-1.5 text-xs text-secondary ring-1 ring-line transition-colors hover:bg-bone/[0.05] hover:text-primary"
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
              isMyTurn={isMyTurn && busy !== "act"}
              turnTimeMs={TURN_MS}
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
          runItN={state?.runItN ?? 1}
          history={history}
          onConfig={(cfg) => game.config(cfg)}
          onStandUp={present ? () => { standUp(); setOptionsOpen(false); } : undefined}
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
