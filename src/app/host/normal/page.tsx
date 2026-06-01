"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const VoicePanel = dynamic(() => import("@/components/voice/VoicePanel"), {
  ssr: false,
});
import { usePresenceMap } from "@/hooks/usePresenceMap";
import { useNormalLobby, useNormalRoom, useStackRequests, useQueue } from "@/hooks/useNormalRoom";
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
  patchLobbyPlayer,
  lobbyToSeats,
  setHostHeartbeat,
  leaveQueue,
  setNormalRoomMaxPlayers,
  postPlayerVote,
} from "@/lib/normalRooms";
import { DEFAULT_CONFIG } from "@/lib/betting";
import type { BettingAction, BettingRound, NormalSeat, RoomConfig } from "@/lib/betting";
import type { TableThemeId, CardBackId } from "@/lib/themes";
import { getUserProfile } from "@/lib/users";
import { availableCoins } from "@/lib/economy";
import type { Card } from "@/lib/poker";
import { randomSeed } from "@/lib/dicebear";
import { TableShell } from "@/components/table/TableShell";
import { OptionsMenu } from "@/components/settings/OptionsMenu";
import { HostSettings } from "@/components/settings/HostSettings";
import { HostNotifications } from "@/components/host/HostNotifications";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { BettingDock } from "@/components/betting/BettingDock";
import { AllInVoteModal } from "@/components/betting/AllInVoteModal";
import { AllInVoteChip } from "@/components/betting/AllInVoteChip";
import { RunResults } from "@/components/table/RunResults";

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

export default function HostNormalPage() {
  const { uid, loading, profile } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [holeCards] = useState<Record<string, [Card, Card]>>({});
  const [dockOpen, setDockOpen] = useState(false);

  const room = useNormalRoom(code);
  const lobby = useNormalLobby(code);
  const requests = useStackRequests(code);
  const { queue } = useQueue(code, uid);
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
    runs,
    dismissRuns,
  } = useNormalGame(code, room ?? null, lobby, uid, holeCards);

  const creatingRef = useRef(false);
  const [closedAllInVoteHand, setClosedAllInVoteHand] = useState<number | null>(null);
  const [closedRunResultsHand, setClosedRunResultsHand] = useState<number | null>(null);
  useEffect(() => {
    if (loading || !uid || code || creatingRef.current) return;
    creatingRef.current = true;

    // Check URL first
    const searchParams = new URLSearchParams(window.location.search);
    const existingCode = searchParams.get("code");
    if (existingCode) {
      setCode(existingCode.toUpperCase());
      creatingRef.current = false;
      return;
    }

    createNormalRoom(uid, { ...DEFAULT_CONFIG, mode: "normal" })
      .then((c) => {
        setCode(c);
        window.history.replaceState(null, "", `?code=${c}`);
      })
      .catch(() => {})
      .finally(() => { creatingRef.current = false; });
  }, [loading, uid, code]);

  // Lobby liveness: while the host tab is open, refresh the heartbeat so the
  // room stays listed. When the tab closes the heartbeat goes stale and the
  // lobby drops the room (rooms exist only while the host is present).
  useEffect(() => {
    if (!code || !uid || room?.hostUid !== uid) return;
    setHostHeartbeat(code).catch(() => {});
    const id = setInterval(() => setHostHeartbeat(code).catch(() => {}), 15000);
    return () => clearInterval(id);
  }, [code, uid, room?.hostUid]);

  // Mirror the lobby size onto the room doc so the lobby list can show
  // occupancy (N/max) without reading every room's lobby subcollection.
  useEffect(() => {
    if (!code || !uid || room?.hostUid !== uid) return;
    patchNormalRoom(code, { playerCount: lobby.length }).catch(() => {});
  }, [code, uid, room?.hostUid, lobby.length]);

  // Auto-seat the head of the wait queue whenever a seat is free. Seats added
  // here are dealt in on the next hand (startNewHand merges new lobby members).
  // TODO(roadmap): 30s accept countdown before promoting, instead of auto-seat.
  useEffect(() => {
    if (!code || !uid || room?.hostUid !== uid) return;
    const max = room?.maxPlayers ?? 9;
    if (lobby.length >= max || queue.length === 0) return;
    const head = queue[0];
    if (lobby.some((p) => p.uid === head.uid)) return; // already seated
    const stack = room?.config?.startingStack ?? 1000;
    approveJoin(code, head.uid, head.name, head.seed, stack)
      .then(() => leaveQueue(code, head.uid))
      .catch(() => {});
  }, [code, uid, room?.hostUid, room?.maxPlayers, room?.config?.startingStack, lobby, queue]);

  const myLobbyEntry = useMemo(() => lobby.find((p) => p.uid === uid), [lobby, uid]);
  const mySeat = useMemo(() => gameState?.seats.find((s) => s.id === uid) ?? null, [gameState, uid]);
  const isMyTurn = !!(gameState && gameState.betting.toActId === uid);

  const config: RoomConfig = room?.config ?? DEFAULT_CONFIG;
  const theme: TableThemeId = (room?.theme as TableThemeId) ?? "noir";
  const cardBack: CardBackId = (room?.cardBack as CardBackId) ?? "classic-blue";
  const cardFace = (room?.cardFace as never) ?? "classic";
  const roomBg = room?.roomBg ?? "onyx";
  const economy = (room?.economy ?? "coins") as "coins" | "casual";

  // En modo coins, leer el wallet disponible de cada jugador del lobby para que
  // el host vea saldos y use el atajo "Máx" al ajustar stacks.
  const [walletByUid, setWalletByUid] = useState<Record<string, number>>({});
  const lobbyUidsKey = useMemo(
    () => lobby.map((p) => p.uid).sort().join(","),
    [lobby],
  );
  useEffect(() => {
    if (economy !== "coins" || !lobbyUidsKey) {
      setWalletByUid({});
      return;
    }
    const uids = lobbyUidsKey.split(",");
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        uids.map(async (u) => {
          const p = await getUserProfile(u).catch(() => null);
          return [u, p ? availableCoins(p) : 0] as const;
        }),
      );
      if (!cancelled) setWalletByUid(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [economy, lobbyUidsKey]);
  const result = room?.result ?? null;
  const canDeal = !gameState && lobby.length >= 2 && lobby.length <= 9;

  const joinUrl =
    typeof window !== "undefined" && code
      ? `${window.location.origin}/play/normal/${code}`
      : "";

  // Placeholder seats from lobby when no game yet
  const placeholderSeats: NormalSeat[] = useMemo(() => {
    if (gameState) return gameState.seats;
    const ownerMap: Record<string, string | null> = {};
    for (const p of lobby) ownerMap[p.uid] = p.uid;
    return lobbyToSeats(lobby, config, ownerMap);
  }, [gameState, lobby, config]);

  const seats = gameState?.seats ?? placeholderSeats;
  const community = gameState?.community ?? [];
  const betting = gameState?.betting ?? EMPTY_BETTING;
  const visibleRunResults =
    closedRunResultsHand === betting.handNum ? null : (runs ?? room?.runResults ?? null);
  const allInVoteOpen =
    gameState?.phase === "all-in-negotiation" ? closedAllInVoteHand !== betting.handNum : true;

  async function handleAction(action: BettingAction, amount?: number) {
    if (!uid || !code) return;
    await postPlayerAction(code, uid, action, amount);
  }

  async function handleRunVote(n: number) {
    if (!uid || !code) return;
    await postPlayerVote(code, uid, n).catch(() => {});
  }

  function updateConfig(newConfig: RoomConfig) {
    if (code) patchNormalRoom(code, { config: newConfig }).catch(() => {});
  }

  async function handleToggleAway() {
    if (!uid || !code || !myLobbyEntry) return;
    await patchLobbyPlayer(code, uid, { sittingOut: !myLobbyEntry.sittingOut });
  }

  async function handleToggleTimeBank() {
    if (!uid || !code || !myLobbyEntry) return;
    const current = myLobbyEntry.useTimeBank !== false;
    await patchLobbyPlayer(code, uid, { useTimeBank: !current });
  }

  const timeBankByUid = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const p of lobby) out[p.uid] = p.useTimeBank !== false;
    return out;
  }, [lobby]);

  const myUseTimeBank = myLobbyEntry?.useTimeBank !== false;

  function handleJoinAsHost(slotIndex?: number) {
    if (!uid || !code) return;
    // Convert visual slot to physical slot (remove current rotationOffset — host page
    // doesn't track rotationOffset so we use slotIndex as physical directly, and
    // the RoundPokerTable rotate button will shift the view as needed).
    const hostName = profile?.nickname?.trim() || "Host";
    const hostSeed = profile?.avatarSeed || randomSeed();
    approveJoin(code, uid, hostName, hostSeed, config.startingStack, slotIndex).catch(() => {});
  }

  if (loading || !code) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0b0b0b] text-zinc-500 text-sm">
        Creando sala…
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
              onClick={() => {
                startNewHand();
                setDockOpen(false);
              }}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-accent-700 hover:bg-accent-600 disabled:opacity-30 text-accent-100 font-black text-sm uppercase tracking-widest transition shadow-2xl shadow-accent-700/25 btn-press animate-in zoom-in fade-in duration-500"
            >
              <Play className="w-5 h-5 fill-current" /> Repartir
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
          <div className="px-8 py-4 rounded-[28px] bg-zinc-900/95 backdrop-blur-xl ring-2 ring-accent-400/50 shadow-[0_20px_80px_-20px_rgba(167,139,250,0.5)] flex flex-col items-center">
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-accent-400 mb-1">
              Mano terminada
            </span>
            <h4 className="text-xl font-black text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-accent-400" />
              {result.winners
                .map((id) => gameState.seats.find((s) => s.id === id)?.name ?? id)
                .join(" & ")}
            </h4>
            {/* Hand category hidden for privacy — cards already reveal hand strength */}
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
        isTournament={false}
        selfUid={uid}
        ownHole={hole?.cards ?? null}
        revealedHoles={room?.revealedHoles ?? undefined}
        cardBack={cardBack}
        cardFace={cardFace}
        roomBg={roomBg}
        lastAction={gameState?.lastAction}
        timeBankByUid={timeBankByUid}
        turnTimeMs={config.turnTime}
        onSit={!myLobbyEntry ? handleJoinAsHost : undefined}
        onToggleAway={myLobbyEntry ? handleToggleAway : undefined}
        amSittingOut={myLobbyEntry?.sittingOut === true}
        presenceMap={presenceMap}
        topLeft={
          <OptionsMenu
            name={myLobbyEntry?.name ?? profile?.nickname ?? "Host"}
            seed={myLobbyEntry?.seed}
            onOpenSettings={() => setDockOpen(true)}
            away={myLobbyEntry?.sittingOut === true}
            onToggleAway={myLobbyEntry ? handleToggleAway : undefined}
            onLeave={() => {
              if (confirm("¿Salir de la sala? Los jugadores perderán el host.")) {
                window.location.href = "/";
              }
            }}
            leaveLabel="Salir de la sala"
            badge={requests.filter((r) => r.status === "pending").length}
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
              community={community}
              isMyTurn={isMyTurn}
              turnTimeMs={config.turnTime}
              hasResult={!!result}
              onAction={handleAction}
              useTimeBank={myUseTimeBank}
              onToggleTimeBank={handleToggleTimeBank}
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
          maxPlayers={room?.maxPlayers}
          onMaxPlayersChange={(n) => {
            if (code) setNormalRoomMaxPlayers(code, n).catch(() => {});
          }}
          theme={theme}
          cardBack={cardBack}
          roomBg={roomBg}
          lobby={lobby}
          requests={requests}
          gameSeats={gameState?.seats ?? null}
          locked={room?.locked ?? false}
          hostUid={room?.hostUid}
          selfUid={uid}
          economy={economy}
          walletByUid={walletByUid}
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
      <AllInVoteModal
        gameState={gameState}
        selfUid={uid}
        onVote={handleRunVote}
        open={allInVoteOpen}
        onClose={() => setClosedAllInVoteHand(betting.handNum)}
      />
      {!allInVoteOpen && (
        <AllInVoteChip
          gameState={gameState}
          selfUid={uid}
          onClick={() => setClosedAllInVoteHand(null)}
        />
      )}
      {visibleRunResults ? (
        <RunResults
          runs={visibleRunResults!}
          players={seats.map((s) => ({
            id: s.id,
            name: s.name,
            seed: s.seed,
            createdAt: 0,
          }))}
          onClose={() => {
            dismissRuns();
            setClosedRunResultsHand(betting.handNum);
          }}
        />
      ) : null}
    </>
  );
}
