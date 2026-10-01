"use client";
import { DesktopOnlyGate } from "@/components/ui/DesktopOnlyGate";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Play, Trophy } from "lucide-react";

const VoicePanel = dynamic(() => import("@/components/voice/VoicePanel"), {
  ssr: false,
});
import { useAuth } from "@/hooks/useAuth";
import { usePresenceMap } from "@/hooks/usePresenceMap";
import { useNormalLobbyState, useNormalRoom, useStackRequests } from "@/hooks/useNormalRoom";
import { useNormalHole } from "@/hooks/useNormalRoom";
import { useNormalGame } from "@/hooks/useNormalGame";
import { useChat } from "@/hooks/useChat";
import { useReactions } from "@/hooks/useReactions";
import { useHandHistory } from "@/hooks/useHandHistory";
import { ReactionBar } from "@/components/reactions/ReactionBar";
import {
  createNormalRoom,
  postPlayerAction,
  patchNormalRoom,
  lobbyToSeats,
  setHostHeartbeat,
} from "@/lib/normalRooms";
import { cashOutHost, seatHost } from "@/lib/hostSeat";
import { TOURNAMENT_LEVELS } from "@/lib/betting";
import type {
  BettingAction,
  BettingRound,
  NormalSeat,
  RoomConfig,
} from "@/lib/betting";
import type { TableThemeId, CardBackId } from "@/lib/themes";
import type { Card } from "@/lib/poker";
import { CATEGORY_LABEL } from "@/lib/handEval";
import {
  advanceLevel,
  initTournamentState,
  isLastLevel,
  levelTimeRemaining,
  pauseTournament,
  resumeTournament,
  startTournament,
  type TournamentState,
} from "@/lib/tournament";
import { randomSeed } from "@/lib/dicebear";
import { TableShell } from "@/components/table/TableShell";
import { OptionsMenu } from "@/components/settings/OptionsMenu";
import { HostSettings } from "@/components/settings/HostSettings";
import { HostNotifications } from "@/components/host/HostNotifications";
import { TournamentHUD } from "@/components/host/TournamentHUD";
import { TournamentPodium } from "@/components/host/TournamentPodium";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { BettingDock } from "@/components/betting/BettingDock";

const DEFAULT_TORNEO_CONFIG: RoomConfig = {
  mode: "torneo",
  startingStack: 5000,
  smallBlind: TOURNAMENT_LEVELS[0].sb,
  bigBlind: TOURNAMENT_LEVELS[0].bb,
  ante: TOURNAMENT_LEVELS[0].ante,
  turnTime: 30_000,
  timeBankInit: 60_000,
  blindLevels: TOURNAMENT_LEVELS,
  blindLevelDuration: 15 * 60_000,
};

const EMPTY_BETTING: BettingRound = {
  pot: 0,
  sidePots: [],
  currentBet: 0,
  minRaise: 0,
  bigBlind: 0,
  toActId: null,
  lastAggressorId: null,
  dealerIdx: -1,
  sbIdx: -1,
  bbIdx: -1,
  handNum: 0,
  actedThisRound: [],
};

export default function HostTorneoPage() {
  return (
    <DesktopOnlyGate>
      <HostTorneoPageInner />
    </DesktopOnlyGate>
  );
}

function HostTorneoPageInner() {
  const { uid, loading, profile, isGuest, getToken } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [holeCards] = useState<Record<string, [Card, Card]>>({});
  const [dockOpen, setDockOpen] = useState(false);
  const [tournament, setTournament] = useState<TournamentState>(
    initTournamentState(),
  );
  const [showPodium, setShowPodium] = useState(false);

  const room = useNormalRoom(code);
  const { players: lobby, ready: lobbyReady } = useNormalLobbyState(code);
  const requests = useStackRequests(code);
  const presenceMap = usePresenceMap(code);
  const hole = useNormalHole(code, uid);
  const chatMessages = useChat(code);
  const reactions = useReactions(code);
  const history = useHandHistory(code);

  const {
    gameState,
    startNewHand,
    resolveShowdown,
    adjustPlayerChips,
    setAllChips,
    kickPlayer,
    isProcessing,
    canStartHand,
  } = useNormalGame(code, room ?? null, lobby, uid, holeCards, { lobbyReady, getToken });

  useEffect(() => {
    if (loading || !uid || code || creating) return;
    setCreating(true);

    // Check URL first
    const searchParams = new URLSearchParams(window.location.search);
    const existingCode = searchParams.get("code");
    if (existingCode) {
      setCode(existingCode.toUpperCase());
      setCreating(false);
      return;
    }

    createNormalRoom(uid, { ...DEFAULT_TORNEO_CONFIG, mode: "torneo" })
      .then((c) => {
        setCode(c);
        window.history.replaceState(null, "", `?code=${c}`);
      })
      .catch(() => {})
      .finally(() => setCreating(false));
  }, [loading, uid, code, creating]);

  useEffect(() => {
    if (room?.tournament) setTournament(room.tournament as TournamentState);
  }, [room?.tournament]);

  // Lobby liveness + occupancy (same as normal host) so torneo rooms list.
  useEffect(() => {
    if (!code || !uid || room?.hostUid !== uid) return;
    setHostHeartbeat(code).catch(() => {});
    const id = setInterval(() => setHostHeartbeat(code).catch(() => {}), 15000);
    return () => clearInterval(id);
  }, [code, uid, room?.hostUid]);

  useEffect(() => {
    if (!code || !uid || room?.hostUid !== uid) return;
    patchNormalRoom(code, { playerCount: lobby.length }).catch(() => {});
  }, [code, uid, room?.hostUid, lobby.length]);

  // Detect tournament end: started + only 1 player with chips remaining, and
  // only once the hand is actually settled. Mid-runout every all-in seat
  // shows 0 chips behind, which used to pop the podium before the board ran.
  const handSettled =
    !!gameState &&
    (gameState.phase === "between-hands" || (gameState.phase === "showdown" && !!room?.result));
  useEffect(() => {
    if (!tournament.started || showPodium || !handSettled || isProcessing) return;
    const active = gameState?.seats.filter((s) => s.chips > 0) ?? [];
    if (active.length === 1 && (gameState?.seats.length ?? 0) > 1) {
      setShowPodium(true);
    }
  }, [tournament.started, showPodium, handSettled, isProcessing, gameState?.seats]);

  const myLobbyEntry = useMemo(() => lobby.find((p) => p.uid === uid), [lobby, uid]);
  const mySeat = useMemo(
    () => gameState?.seats.find((s) => s.id === uid) ?? null,
    [gameState, uid],
  );
  const isMyTurn = !!(gameState && mySeat && gameState.betting.toActId === mySeat.id);
  const isAdmin = !!(uid && room?.adminUid === uid);

  // Build podium ranking: winner first, then knockouts in reverse order (last out = 2nd)
  const podiumRanking = useMemo(() => {
    if (!gameState) return [];
    const winner = gameState.seats.find((s) => s.chips > 0);
    const allSeats = gameState.seats;
    // knockouts: last element = most recently knocked out = highest finish
    const knockedOut = [...tournament.knockouts].reverse();
    const ordered = [
      ...(winner ? [winner] : []),
      ...knockedOut.map((id) => allSeats.find((s) => s.id === id)).filter(Boolean),
    ] as typeof allSeats;
    return ordered.map((s) => ({ id: s.id, name: s.name, seed: s.seed ?? "" }));
  }, [showPodium, gameState, tournament.knockouts]);

  const config: RoomConfig = room?.config ?? DEFAULT_TORNEO_CONFIG;

  // Blind level auto-advance (host only). Fires when the level clock runs out;
  // the last level of the structure stays for the rest of the tournament. The
  // ref guards against advancing twice from the same level while the write is
  // in flight.
  const advancedFromLevelRef = useRef<number>(-1);
  useEffect(() => {
    if (!code || !isAdmin || !tournament.started || tournament.paused) return;
    if (isLastLevel(tournament, config)) return;
    const remaining = levelTimeRemaining(tournament, config);
    const t = setTimeout(() => {
      if (advancedFromLevelRef.current === tournament.currentLevel) return;
      advancedFromLevelRef.current = tournament.currentLevel;
      const next = advanceLevel(tournament);
      setTournament(next);
      patchNormalRoom(code, { tournament: next }).catch(() => {
        advancedFromLevelRef.current = -1;
      });
    }, Math.max(0, remaining));
    return () => clearTimeout(t);
  }, [code, isAdmin, tournament, config]);

  const theme: TableThemeId = (room?.theme as TableThemeId) ?? "sapphire";
  const cardBack: CardBackId = (room?.cardBack as CardBackId) ?? "classic-blue";
  const roomBg = room?.roomBg ?? "onyx";
  const result = room?.result ?? null;
  const canDeal = canStartHand;

  const joinUrl =
    typeof window !== "undefined" && code
      ? `${window.location.origin}/play/normal/${code}`
      : "";

  const placeholderSeats: NormalSeat[] = useMemo(() => {
    if (gameState) return gameState.seats;
    const ownerMap: Record<string, string | null> = {};
    for (const p of lobby) ownerMap[p.uid] = p.uid;
    return lobbyToSeats(lobby, config, ownerMap);
  }, [gameState, lobby, config]);

  const seats = gameState?.seats ?? placeholderSeats;
  const community = gameState?.community ?? [];
  const betting = gameState?.betting ?? EMPTY_BETTING;

  async function handleAction(action: BettingAction, amount?: number) {
    const seatId = mySeat?.id ?? uid;
    if (!seatId || !code) return;
    await postPlayerAction(code, seatId, action, amount);
  }

  function updateConfig(newConfig: RoomConfig) {
    if (code) patchNormalRoom(code, { config: newConfig }).catch(() => {});
  }

  async function handleJoinAsHost(slotIndex?: number) {
    if (!uid || !code) return;
    const hostName = profile?.nickname?.trim() || "Host";
    const hostSeed = profile?.avatarSeed || randomSeed();
    // Coins: the host buys in like everyone else before taking a seat.
    try {
      await seatHost({
        code,
        uid,
        name: hostName,
        seed: hostSeed,
        amount: config.startingStack,
        slot: slotIndex,
        coins: (room?.economy ?? "coins") === "coins",
        isGuest,
        getToken,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo tomar asiento.");
    }
  }

  async function handleLeaveTournament() {
    if (!confirm("¿Salir del torneo? Los jugadores perderán el host.")) return;
    if (code && myLobbyEntry && (room?.economy ?? "coins") === "coins") {
      await cashOutHost(code, getToken).catch(() => {});
    }
    window.location.href = "/";
  }

  function togglePause() {
    if (!code || !tournament.started) return;
    const next = tournament.paused
      ? resumeTournament(tournament)
      : pauseTournament(tournament, config);
    setTournament(next);
    patchNormalRoom(code, { tournament: next }).catch(() => {});
  }

  function manualAdvanceLevel() {
    if (!code || !tournament.started) return;
    const next = advanceLevel(tournament);
    setTournament(next);
    patchNormalRoom(code, { tournament: next }).catch(() => {});
  }

  async function handleStartTournament() {
    if (!code) return;
    if (!tournament.started) {
      const started = startTournament(tournament);
      setTournament(started);
      await patchNormalRoom(code, { tournament: started }).catch(() => {});
    }
    await startNewHand();
    setDockOpen(false);
  }

  if (loading || !code) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-ink-900 text-muted text-sm">
        Creando torneo…
      </div>
    );
  }

  const centerOverlay = (
    <>
      {(!gameState || gameState.phase === "between-hands") && !showPodium && (
        <div className="flex flex-col items-center gap-4">
          {lobby.length < 2 || (!!gameState && !canDeal) ? (
            <div className="eyebrow px-6 py-3 rounded-2xl bg-ink-850/80 backdrop-blur-md ring-1 ring-line text-sm shadow-2xl">
              Esperando jugadores ({Math.min(lobby.length, 2)}/2)
            </div>
          ) : (
            <button
              type="button"
              disabled={!canDeal || isProcessing}
              onClick={handleStartTournament}
              className="font-semibold inline-flex items-center gap-3 px-8 py-4 rounded-full bg-zinc-100 hover:bg-white disabled:bg-ink-800 disabled:text-secondary disabled:ring-1 disabled:ring-line disabled:cursor-not-allowed text-sm transition shadow-2xl shadow-black/40 btn-press animate-in zoom-in fade-in duration-500"
            >
              <Play className="w-5 h-5 fill-current" />
              {tournament.started ? "Repartir" : "Iniciar torneo"}
            </button>
          )}
          {!lobby.some((p) => p.uid === uid) && (
            <button
              type="button"
              onClick={() => void handleJoinAsHost()}
              className="text-xs font-semibold px-4 py-2 rounded-full bg-bone/[0.04] hover:bg-bone/[0.07] ring-1 ring-line transition btn-press"
            >
              Unirme como jugador
            </button>
          )}
        </div>
      )}

      {result && gameState && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in duration-500">
          <div className="px-8 py-4 rounded-[28px] bg-ink-850/95 backdrop-blur-xl ring-2 ring-line-strong shadow-[0_20px_80px_-20px_rgba(255,255,255,0.15)] flex flex-col items-center">
            <span className="eyebrow text-[11px] mb-1">
              Mano terminada
            </span>
            <h4 className="text-xl font-semibold text-primary flex items-center gap-2">
              <Trophy className="w-5 h-5 text-secondary" />
              {result.winners
                .map((id) => gameState.seats.find((s) => s.id === id)?.name ?? id)
                .join(" & ")}
            </h4>
            <p className="eyebrow text-[11px] mt-1">
              {CATEGORY_LABEL[result.category]}
            </p>
          </div>
        </div>
      )}
    </>
  );

  void resolveShowdown; // auto-resolved by useNormalGame after 1.5 s
  void Trophy; // reserved for centerOverlay

  return (
    <>
      <TableShell
        seats={seats}
        community={community}
        betting={betting}
        winners={result?.winners}
        theme={theme}
        roomCode={code}
        isTournament={true}
        selfUid={uid}
        ownHole={hole?.cards ?? null}
        revealedHoles={room?.revealedHoles ?? undefined}
        cardBack={cardBack}
        cardFace="classic"
        roomBg={roomBg}
        presenceMap={presenceMap}
        topLeft={
          <OptionsMenu
            name={myLobbyEntry?.name ?? profile?.nickname ?? "Host"}
            seed={myLobbyEntry?.seed}
            onOpenSettings={() => setDockOpen(true)}
            onLeave={() => void handleLeaveTournament()}
            leaveLabel="Salir del torneo"
            badge={requests.filter((r) => r.status === "pending").length}
          />
        }
        topCenter={
          <TournamentHUD
            tournament={tournament}
            config={config}
            isAdmin={isAdmin}
            onTogglePause={togglePause}
            onAdvanceLevel={manualAdvanceLevel}
          />
        }
        bottomLeft={
          <>
            {myLobbyEntry && (
              <VoicePanel
                code={code}
                uid={uid}
                displayName={myLobbyEntry.name}
                seed={myLobbyEntry.seed}
                canLeave={false}
              />
            )}
            <ChatPanel
              code={code}
              uid={uid}
              name={myLobbyEntry?.name ?? profile?.nickname ?? "Host"}
              seed={myLobbyEntry?.seed ?? ""}
              messages={chatMessages}
            />
            <ReactionBar code={code} uid={uid} />
          </>
        }
        reactions={reactions}
        bottomRight={
          mySeat ? (
            <BettingDock
              seat={mySeat}
              name={mySeat.name}
              seed={mySeat.seed}
              betting={gameState?.betting ?? null}
              holeCards={hole?.cards ?? null}
              isMyTurn={isMyTurn}
              turnTimeMs={config.turnTime}
              hasResult={!!result}
              onAction={handleAction}
            />
          ) : null
        }
        centerOverlay={centerOverlay}
      />
      {dockOpen && (
        <HostSettings
          code={code}
          joinUrl={joinUrl}
          onClose={() => setDockOpen(false)}
          config={config}
          onConfigChange={updateConfig}
          theme={theme}
          cardBack={cardBack}
          roomBg={roomBg}
          lobby={lobby}
          requests={requests}
          gameSeats={gameState?.seats ?? null}
          locked={room?.locked ?? false}
          hostUid={room?.hostUid}
          selfUid={uid}
          history={history}
          onAdjustChips={adjustPlayerChips}
          onSetAllChips={setAllChips}
          onKick={kickPlayer}
        />
      )}
      <HostNotifications
        requests={requests}
        gameState={gameState}
        result={result}
        onClickRequest={() => setDockOpen(true)}
      />
      {showPodium && (
        <TournamentPodium
          ranking={podiumRanking}
          onClose={() => { setShowPodium(false); window.location.href = "/"; }}
        />
      )}
    </>
  );
}
