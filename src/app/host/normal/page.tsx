"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, SkipForward, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
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
  patchLobbyPlayer,
  lobbyToSeats,
} from "@/lib/normalRooms";
import { DEFAULT_CONFIG } from "@/lib/betting";
import type { BettingAction, BettingRound, NormalSeat, RoomConfig } from "@/lib/betting";
import type { TableThemeId, CardBackId } from "@/lib/themes";
import type { Card } from "@/lib/poker";
import { randomSeed } from "@/lib/dicebear";
import { TableShell } from "@/components/table/TableShell";
import { HostDock } from "@/components/host/HostDock";
import { HostNotifications } from "@/components/host/HostNotifications";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { BettingDock } from "@/components/betting/BettingDock";
import { AllInVoteModal } from "@/components/betting/AllInVoteModal";
import { postPlayerVote } from "@/lib/normalRooms";

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

export default function HostNormalPage() {
  const { uid, loading } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [holeCards] = useState<Record<string, [Card, Card]>>({});
  const [dockOpen, setDockOpen] = useState(true);

  const room = useNormalRoom(code);
  const lobby = useNormalLobby(code);
  const requests = useStackRequests(code);
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

  const creatingRef = useRef(false);
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

  const myLobbyEntry = useMemo(() => lobby.find((p) => p.uid === uid), [lobby, uid]);
  const mySeat = useMemo(() => gameState?.seats.find((s) => s.id === uid) ?? null, [gameState, uid]);
  const isMyTurn = !!(gameState && gameState.betting.toActId === uid);

  const config: RoomConfig = room?.config ?? DEFAULT_CONFIG;
  const theme: TableThemeId = (room?.theme as TableThemeId) ?? "emerald";
  const cardBack: CardBackId = (room?.cardBack as CardBackId) ?? "classic-blue";
  const result = room?.result ?? null;
  const isShowdown = gameState?.phase === "showdown";
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

  async function handleAction(action: BettingAction, amount?: number) {
    if (!uid || !code) return;
    await postPlayerAction(code, uid, action, amount);
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

  function handleJoinAsHost() {
    if (!uid || !code) return;
    approveJoin(code, uid, "Host", randomSeed(), config.startingStack).catch(() => {});
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
              className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 text-emerald-950 font-black text-sm uppercase tracking-widest transition shadow-2xl shadow-emerald-500/30 btn-press animate-in zoom-in fade-in duration-500"
            >
              <Play className="w-5 h-5 fill-current" /> Repartir
            </button>
          )}
          {!lobby.some((p) => p.uid === uid) && (
            <button
              type="button"
              onClick={handleJoinAsHost}
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
            {/* Hand category hidden for privacy — cards already reveal hand strength */}
          </div>
        </div>
      )}
    </>
  );

  const adminExtra = (
    <div className="flex gap-2 mt-3">
      {isShowdown && !result && (
        <button
          type="button"
          onClick={resolveShowdown}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-amber-950 font-black text-xs uppercase tracking-widest transition shadow-xl animate-pulse"
        >
          <Trophy className="w-4 h-4" /> Resolver
        </button>
      )}
      {result && (
        <button
          type="button"
          onClick={startNewHand}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black text-xs uppercase tracking-widest transition shadow-xl"
        >
          <SkipForward className="w-4 h-4" /> Siguiente
        </button>
      )}
    </div>
  );

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
        cardFace={(room?.cardFace as never) ?? "classic"}
        lastAction={gameState?.lastAction}
        timeBankByUid={timeBankByUid}
        turnTimeMs={config.turnTime}
        onSit={!myLobbyEntry ? handleJoinAsHost : undefined}
        onToggleAway={myLobbyEntry ? handleToggleAway : undefined}
        amSittingOut={myLobbyEntry?.sittingOut === true}
        topLeft={
          <HostDock
            code={code}
            joinUrl={joinUrl}
            open={dockOpen}
            onOpen={() => setDockOpen(true)}
            onClose={() => setDockOpen(false)}
            config={config}
            onConfigChange={updateConfig}
            theme={theme}
            cardBack={cardBack}
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
        }
        bottomLeft={
          <>
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
              community={community}
              isMyTurn={isMyTurn}
              turnTimeMs={config.turnTime}
              hasResult={!!result}
              onAction={handleAction}
              extra={adminExtra}
              useTimeBank={myUseTimeBank}
              onToggleTimeBank={handleToggleTimeBank}
            />
          ) : gameState && (isShowdown || result) ? (
            <div className="w-[min(420px,92vw)] bg-zinc-900/95 backdrop-blur-xl rounded-[28px] ring-1 ring-white/10 p-4 shadow-2xl">
              {adminExtra}
            </div>
          ) : null
        }
        centerOverlay={centerOverlay}
      />
      <HostNotifications
        requests={requests}
        gameState={gameState}
        result={result}
        onClickRequest={() => setDockOpen(true)}
      />
      <AllInVoteModal
        gameState={gameState}
        selfUid={uid}
        onVote={(n) => {
          if (code && uid) postPlayerVote(code, uid, n).catch(() => {});
        }}
      />
    </>
  );
}
