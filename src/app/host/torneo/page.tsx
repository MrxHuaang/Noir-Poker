"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Play, Trophy } from "lucide-react";

const VoicePanel = dynamic(() => import("@/components/voice/VoicePanel"), {
  ssr: false,
});
import { useAuth } from "@/hooks/useAuth";
import { usePresenceMap } from "@/hooks/usePresenceMap";
import { useNormalLobby, useNormalRoom, useStackRequests } from "@/hooks/useNormalRoom";
import { useNormalHole } from "@/hooks/useNormalRoom";
import { useNormalGame } from "@/hooks/useNormalGame";
import { useChat } from "@/hooks/useChat";
import { useReactions } from "@/hooks/useReactions";
import { useHandHistory } from "@/hooks/useHandHistory";
import { ReactionBar } from "@/components/reactions/ReactionBar";
import {
  createNormalRoom,
  postPlayerAction,
  approveJoin,
  patchNormalRoom,
  lobbyToSeats,
  setHostHeartbeat,
} from "@/lib/normalRooms";
import { formatChips, TOURNAMENT_LEVELS } from "@/lib/betting";
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
import { ChatPanel } from "@/components/chat/ChatPanel";
import { BettingDock } from "@/components/betting/BettingDock";
// AllInVoteModal removed — run-it-N pending reimplementation
import { postPlayerVote } from "@/lib/normalRooms";

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
  toActId: null,
  lastAggressorId: null,
  dealerIdx: -1,
  sbIdx: -1,
  bbIdx: -1,
  handNum: 0,
  actedThisRound: [],
};

export default function HostTorneoPage() {
  const { uid, loading } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [holeCards] = useState<Record<string, [Card, Card]>>({});
  const [dockOpen, setDockOpen] = useState(false);
  const [tournament, setTournament] = useState<TournamentState>(
    initTournamentState(),
  );

  const room = useNormalRoom(code);
  const lobby = useNormalLobby(code);
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
  } = useNormalGame(code, room ?? null, lobby, uid, holeCards);

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

  const myLobbyEntry = useMemo(() => lobby.find((p) => p.uid === uid), [lobby, uid]);
  const mySeat = useMemo(
    () => gameState?.seats.find((s) => s.id === uid) ?? null,
    [gameState, uid],
  );
  const isMyTurn = !!(gameState && gameState.betting.toActId === uid);
  const isAdmin = !!(uid && room?.adminUid === uid);

  const config: RoomConfig = room?.config ?? DEFAULT_TORNEO_CONFIG;
  const theme: TableThemeId = (room?.theme as TableThemeId) ?? "sapphire";
  const cardBack: CardBackId = (room?.cardBack as CardBackId) ?? "classic-blue";
  const cardFace = (room?.cardFace as never) ?? "classic";
  const roomBg = room?.roomBg ?? "onyx";
  const result = room?.result ?? null;
  const isShowdown = gameState?.phase === "showdown";
  const canDeal = !gameState && lobby.length >= 2 && lobby.length <= 9;

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
    if (!uid || !code) return;
    await postPlayerAction(code, uid, action, amount);
  }

  function updateConfig(newConfig: RoomConfig) {
    if (code) patchNormalRoom(code, { config: newConfig }).catch(() => {});
  }

  function handleJoinAsHost(slotIndex?: number) {
    if (!uid || !code) return;
    approveJoin(code, uid, "Host", randomSeed(), config.startingStack, slotIndex).catch(() => {});
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
    const started = startTournament(tournament);
    setTournament(started);
    await patchNormalRoom(code, { tournament: started }).catch(() => {});
    await startNewHand();
    setDockOpen(false);
  }

  if (loading || !code) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0b0b0b] text-zinc-500 text-sm">
        Creando torneo…
      </div>
    );
  }

  const centerOverlay = (
    <>
      {!gameState && (
        <div className="flex flex-col items-center gap-4">
          {lobby.length < 2 ? (
            <div className="px-6 py-3 rounded-2xl bg-zinc-900/80 backdrop-blur-md ring-1 ring-white/10 text-zinc-400 text-sm font-bold uppercase tracking-widest shadow-2xl">
              Esperando jugadores ({lobby.length}/2)
            </div>
          ) : (
            <button
              type="button"
              disabled={!canDeal || isProcessing}
              onClick={handleStartTournament}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-amber-700 hover:bg-amber-600 disabled:opacity-30 text-amber-100 font-black text-sm uppercase tracking-widest transition shadow-2xl shadow-amber-700/25 btn-press animate-in zoom-in fade-in duration-500"
            >
              <Play className="w-5 h-5 fill-current" /> Iniciar torneo
            </button>
          )}
          {!lobby.some((p) => p.uid === uid) && (
            <button
              type="button"
              onClick={() => handleJoinAsHost()}
              className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-zinc-300 text-[11px] font-bold uppercase tracking-widest transition btn-press"
            >
              Unirme como jugador
            </button>
          )}
        </div>
      )}

      {result && gameState && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in duration-500">
          <div className="px-8 py-4 rounded-[28px] bg-zinc-900/95 backdrop-blur-xl ring-2 ring-amber-400/50 shadow-[0_20px_80px_-20px_rgba(251,191,36,0.5)] flex flex-col items-center">
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-400 mb-1">
              Mano terminada
            </span>
            <h4 className="text-xl font-black text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              {result.winners
                .map((id) => gameState.seats.find((s) => s.id === id)?.name ?? id)
                .join(" & ")}
            </h4>
            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">
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
        cardFace={cardFace}
        roomBg={roomBg}
        presenceMap={presenceMap}
        topLeft={
          <OptionsMenu
            name={myLobbyEntry?.name ?? "Host"}
            seed={myLobbyEntry?.seed}
            onOpenSettings={() => setDockOpen(true)}
            onLeave={() => {
              if (confirm("¿Salir del torneo? Los jugadores perderán el host.")) {
                window.location.href = "/";
              }
            }}
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
              />
            )}
            <ChatPanel
              code={code}
              uid={uid}
              name={myLobbyEntry?.name ?? "Host"}
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
          cardFace={cardFace}
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
    </>
  );
}
