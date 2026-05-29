"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Clock, Trophy, X as CloseIcon, Menu } from "lucide-react";

// Importar con ssr:false porque VoicePanel usa navigator.mediaDevices,
// RTCPeerConnection y AudioContext que no existen en Node.
const VoicePanel = dynamic(() => import("@/components/voice/VoicePanel"), {
  ssr: false,
});
import { useAuth } from "@/hooks/useAuth";
import { usePresence } from "@/hooks/usePresence";
import { usePresenceMap } from "@/hooks/usePresenceMap";
import { useNormalRoom, useNormalLobby, useNormalHole } from "@/hooks/useNormalRoom";
import { useChat } from "@/hooks/useChat";
import { useReactions } from "@/hooks/useReactions";
import { ReactionBar } from "@/components/reactions/ReactionBar";
import { JoinWithStack } from "@/components/lobby/JoinWithStack";
import { SeatPicker } from "@/components/lobby/SeatPicker";
import { Avatar } from "@/components/players/Avatar";
import { setPlayerPreferredSlot } from "@/lib/normalRooms";
import {
  postPlayerAction,
  patchLobbyPlayer,
  postPlayerVote,
  lobbyToSeats,
} from "@/lib/normalRooms";
import {
  submitStackRequest,
  subscribeMyStackRequest,
  dismissStackRequest,
  type StackRequest,
} from "@/lib/stackRequests";
import { getMyPublicKeyString } from "@/lib/holeCrypto";
import { formatChips } from "@/lib/betting";
import type {
  BettingAction,
  BettingRound,
  NormalSeat,
} from "@/lib/betting";
import type { TableThemeId } from "@/lib/themes";
import { TableShell } from "@/components/table/TableShell";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { BettingDock } from "@/components/betting/BettingDock";
import { AllInVoteModal } from "@/components/betting/AllInVoteModal";
import { AllInVoteChip } from "@/components/betting/AllInVoteChip";

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

export default function PlayNormalPage() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() ?? null;
  const { uid, loading } = useAuth();
  const [mySeed] = useState(() => Math.random().toString(36).slice(2));
  const mySeedRef = useRef(mySeed);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [voteModalOpen, setVoteModalOpen] = useState(false);
  const lastVoteHandRef = useRef<number>(-1);
  const [myRequest, setMyRequest] = useState<StackRequest | null | undefined>(
    undefined,
  );

  usePresence(code, uid);
  const presenceMap = usePresenceMap(code);

  const room = useNormalRoom(code);
  const lobby = useNormalLobby(code);
  const hole = useNormalHole(code, uid);
  const chatMessages = useChat(code);
  const reactions = useReactions(code);

  useEffect(() => {
    if (!code || !uid) return;
    return subscribeMyStackRequest(code, uid, setMyRequest);
  }, [code, uid]);

  const gs = room?.state ?? null;
  const config = room?.config;

  // Vibrate once when it becomes the player's turn (mobile UX).
  const isMyTurn = !!(gs && gs.betting.toActId === uid);
  const prevTurnRef = useRef(false);
  useEffect(() => {
    if (isMyTurn && !prevTurnRef.current) {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([180]);
      }
    }
    prevTurnRef.current = isMyTurn;
  }, [isMyTurn]);
  const theme: TableThemeId = (room?.theme as TableThemeId) ?? "emerald";
  const locked = room?.locked ?? false;

  const inLobby = uid ? lobby.some((p) => p.uid === uid) : false;
  const myLobbyEntry = uid ? lobby.find((p) => p.uid === uid) : null;
  const mySeat = gs?.seats.find((s) => s.id === uid) ?? null;
  const result = room?.result ?? null;

  // Publish our public key into the lobby so the host can encrypt our hole
  // cards to it. Runs once we're in the lobby and re-publishes only if missing.
  const myPubKey = myLobbyEntry?.pubKey;
  useEffect(() => {
    if (!code || !uid || !inLobby) return;
    let cancelled = false;
    (async () => {
      const pub = await getMyPublicKeyString(uid);
      if (!pub || cancelled || myPubKey === pub) return;
      patchLobbyPlayer(code, uid, { pubKey: pub }).catch(() => {});
    })();
    return () => { cancelled = true; };
  }, [code, uid, inLobby, myPubKey]);

  const placeholderSeats: NormalSeat[] = useMemo(() => {
    if (gs) return gs.seats as NormalSeat[];
    if (!config) return [];
    const ownerMap: Record<string, string | null> = {};
    for (const p of lobby) ownerMap[p.uid] = p.uid;
    return lobbyToSeats(lobby, config, ownerMap);
  }, [gs, lobby, config]);

  // SeatPicker data — must be before any early returns (Rules of Hooks)
  const seatOccupants = useMemo(() => {
    const map: Record<number, { uid: string; name: string; seed: string }> = {};
    for (const p of lobby) {
      if (p.preferredSlot !== undefined) {
        map[p.preferredSlot] = { uid: p.uid, name: p.name, seed: p.seed };
      }
    }
    return map;
  }, [lobby]);
  const myPreferredSlot = myLobbyEntry?.preferredSlot;

  async function handleJoinRequest(name: string, stack: number, seed: string) {
    if (!uid || !code) return;
    mySeedRef.current = seed; // persist the picked avatar seed
    await submitStackRequest(code, {
      uid,
      name,
      seed,
      requestedStack: stack,
      type: "join",
      ts: Date.now(),
    });
  }

  async function handleRebuyRequest(stack: number) {
    if (!uid || !code || !myLobbyEntry) return;
    await submitStackRequest(code, {
      uid,
      name: myLobbyEntry.name,
      seed: myLobbyEntry.seed,
      requestedStack: stack,
      type: "rebuy",
      ts: Date.now(),
    });
  }

  async function handleAction(action: BettingAction, amount?: number) {
    if (!uid || !code) return;
    await postPlayerAction(code, uid, action, amount);
  }

  async function handleToggleSitOut() {
    if (!uid || !code || !myLobbyEntry) return;
    await patchLobbyPlayer(code, uid, {
      sittingOut: !myLobbyEntry.sittingOut,
    });
  }

  async function handleToggleTimeBank() {
    if (!uid || !code || !myLobbyEntry) return;
    const current = myLobbyEntry.useTimeBank !== false;
    await patchLobbyPlayer(code, uid, { useTimeBank: !current });
  }

  // Build timeBankByUid map for the table (so SeatTimer knows each player's pref)
  const timeBankByUid = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const p of lobby) out[p.uid] = p.useTimeBank !== false;
    return out;
  }, [lobby]);

  const myUseTimeBank = myLobbyEntry?.useTimeBank !== false;

  // Auto-open vote modal exactly once per all-in hand, only for involved players
  // who haven't voted yet. Subsequent renders use the side chip.
  useEffect(() => {
    if (!gs || gs.phase !== "all-in-negotiation" || !gs.allInNegotiation) {
      if (voteModalOpen) setVoteModalOpen(false);
      return;
    }
    const handNum = gs.betting.handNum;
    if (lastVoteHandRef.current === handNum) return;
    const involved = uid ? gs.allInNegotiation.playerIds.includes(uid) : false;
    const alreadyVoted = uid ? gs.allInNegotiation.votes[uid] != null : false;
    if (involved && !alreadyVoted) {
      lastVoteHandRef.current = handNum;
      setVoteModalOpen(true);
    } else {
      lastVoteHandRef.current = handNum;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs?.phase, gs?.betting.handNum]);

  async function handleRetry() {
    if (!uid || !code) return;
    await dismissStackRequest(code, uid);
    setMyRequest(null);
  }

  if (loading || room === undefined) {
    return (
      <div className="fixed inset-0 flex items-center justify-center text-zinc-500 text-sm bg-[#0b0b0b]">
        Conectando…
      </div>
    );
  }
  if (!room) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 text-sm bg-[#0b0b0b]">
        <p className="text-zinc-300">Sala no encontrada.</p>
        <p className="text-xs text-zinc-500">Código: {code}</p>
        <a
          href="/join"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-zinc-200 transition"
        >
          Intentar con otro código
        </a>
      </div>
    );
  }

  if (!inLobby) {
    return (
      <div className="fixed inset-0 bg-[#0b0b0b] flex items-center justify-center p-4">
        {myRequest?.status === "pending" ? (
          <div className="fixed inset-0 bg-[#0b0b0b] flex flex-col items-center justify-center gap-0 p-6 animate-in fade-in duration-500">
            {/* Ambient glow */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-emerald-500/5 blur-[80px]" />
            </div>

            {/* Room code chip */}
            {code && (
              <div className="mb-8 px-4 py-1.5 rounded-full bg-white/5 ring-1 ring-white/10 text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">
                Sala {code}
              </div>
            )}

            {/* Avatar */}
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full overflow-hidden ring-2 ring-emerald-400/30 shadow-[0_0_40px_-8px_rgba(52,211,153,0.3)]">
                <Avatar seed={mySeedRef.current} size={96} className="ring-0 rounded-none" />
              </div>
              {/* Pulsing ring */}
              <div className="absolute inset-0 rounded-full ring-2 ring-emerald-400/20 animate-ping" />
            </div>

            {/* Name */}
            <h2 className="text-2xl font-black text-white tracking-tight mb-1">
              {myRequest.name}
            </h2>

            {/* Stack badge */}
            <div className="flex items-center gap-2 px-5 py-2 rounded-full bg-emerald-500/10 ring-1 ring-emerald-400/20 mb-8">
              <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              <span className="text-emerald-300 font-mono font-black tabular-nums">
                {formatChips(myRequest.requestedStack)} fichas
              </span>
            </div>

            {/* Status */}
            <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-zinc-900/80 ring-1 ring-white/8">
              <Clock className="w-4 h-4 text-amber-400 animate-pulse flex-shrink-0" />
              <p className="text-sm text-zinc-400">
                Esperando aprobación del host…
              </p>
            </div>

            {/* Animated dots */}
            <div className="flex gap-1.5 mt-6">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-zinc-600"
                  style={{ animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }}
                />
              ))}
            </div>
          </div>
        ) : myRequest?.status === "rejected" ? (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-500">
            <div className="p-6 rounded-[32px] bg-rose-500/10 ring-1 ring-rose-500/30 text-center max-w-xs">
              <h2 className="text-xl font-bold text-rose-200">Rechazado</h2>
              {myRequest.rejectionReason && (
                <p className="text-xs text-rose-300/60 mt-2">
                  {myRequest.rejectionReason}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-zinc-200 text-sm font-bold transition btn-press"
            >
              Intentar de nuevo
            </button>
          </div>
        ) : (
          <div className="fixed inset-0 bg-[#0b0b0b] overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <JoinWithStack
              suggestedStack={config?.startingStack ?? 1000}
              locked={locked}
              showAvatar
              roomCode={code ?? undefined}
              onSubmit={handleJoinRequest}
            />
          </div>
        )}
      </div>
    );
  }

  const isOut = mySeat?.status === "out";
  const needsRebuy = isOut && !myRequest;
  const rebuyPending = myRequest?.status === "pending" && myRequest.type === "rebuy";

  const isShowdown = gs?.phase === "showdown";
  const canMuckOrShow = isShowdown && mySeat?.status !== "sitting-out" && hole?.cards;
  const hasRevealedLeft = room?.revealedHoles?.[uid ?? ""]?.[0] != null;
  const hasRevealedRight = room?.revealedHoles?.[uid ?? ""]?.[1] != null;
  const hasRevealedBoth = hasRevealedLeft && hasRevealedRight;

  const showMuckUI = canMuckOrShow ? (
    <div className="flex gap-2 mt-3 justify-center items-center p-3 rounded-2xl bg-zinc-900/80 backdrop-blur-md ring-1 ring-white/10">
      <span className="text-[10px] uppercase font-black tracking-widest text-zinc-500 mr-2">Cartas</span>
      <button
        onClick={() => postPlayerAction(code!, uid!, "show-card", 0)}
        disabled={hasRevealedLeft}
        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${hasRevealedLeft ? "bg-emerald-500/20 text-emerald-500 opacity-50" : "bg-white/10 hover:bg-white/20 text-white"}`}
      >
        Isq
      </button>
      <button
        onClick={() => postPlayerAction(code!, uid!, "show-card", 1)}
        disabled={hasRevealedRight}
        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${hasRevealedRight ? "bg-emerald-500/20 text-emerald-500 opacity-50" : "bg-white/10 hover:bg-white/20 text-white"}`}
      >
        Der
      </button>
      <button
        onClick={() => postPlayerAction(code!, uid!, "show-card", 2)}
        disabled={hasRevealedBoth}
        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${hasRevealedBoth ? "bg-emerald-500/20 text-emerald-500 opacity-50" : "bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20"}`}
      >
        Ambas
      </button>
    </div>
  ) : null;

  const playerExtra =
    isShowdown && showMuckUI ? showMuckUI :
    needsRebuy || rebuyPending ? (
      <div className="mt-3">
        {needsRebuy && (
          <JoinWithStack
            defaultName={myLobbyEntry?.name ?? ""}
            suggestedStack={config?.startingStack ?? 1000}
            mode="rebuy"
            onSubmit={async (_, stack) => handleRebuyRequest(stack) as unknown as Promise<void>}
          />
        )}
        {rebuyPending && (
          <div className="text-center py-3 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-[11px] font-bold text-amber-200 uppercase tracking-widest">
            Rebuy pendiente ({formatChips(myRequest!.requestedStack)})
          </div>
        )}
      </div>
    ) : showMuckUI;

  async function handlePickSeat(slot: number) {
    if (!code || !uid) return;
    await setPlayerPreferredSlot(code, uid, slot).catch(() => {});
  }

  const centerOverlay = (
    <>
      {!gs && (
        <div className="flex flex-col items-center gap-4 px-4 py-5 rounded-2xl bg-zinc-900/90 backdrop-blur-md ring-1 ring-white/10 shadow-2xl">
          <SeatPicker
            myUid={uid ?? ""}
            myPreferredSlot={myPreferredSlot}
            occupants={seatOccupants}
            onPick={handlePickSeat}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-zinc-500 text-[11px] font-bold uppercase tracking-widest">
              <Clock className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
              Esperando al host…
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 transition underline underline-offset-2"
            >
              ¿Sin actualizaciones? Refrescar
            </button>
          </div>
        </div>
      )}
      {result && gs && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in duration-500">
          <div className="px-8 py-4 rounded-[28px] bg-zinc-900/95 backdrop-blur-xl ring-2 ring-amber-400/50 shadow-[0_20px_80px_-20px_rgba(251,191,36,0.5)] flex flex-col items-center">
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-400 mb-1">
              Mano terminada
            </span>
            <h4 className="text-xl font-black text-white flex items-center gap-2">
              {result.winners.includes(uid ?? "") && (
                <Trophy className="w-5 h-5 text-amber-400" />
              )}
              {result.winners.includes(uid ?? "")
                ? "¡Has ganado!"
                : result.winners
                    .map((id) => gs.seats.find((s) => s.id === id)?.name ?? id)
                    .join(" & ")}
            </h4>
            {/* Hand category hidden for privacy — cards already reveal hand strength */}
          </div>
        </div>
      )}
    </>
  );

  const topLeft = (
    <button
      type="button"
      onClick={() => setOptionsOpen(true)}
      className="p-3 rounded-2xl glass hover:bg-white/10 ring-1 ring-white/10 text-zinc-300 transition btn-press shadow-xl"
    >
      <Menu className="w-5 h-5" />
    </button>
  );

  return (
    <>
      <TableShell
        seats={(gs?.seats ?? placeholderSeats) as NormalSeat[]}
        community={gs?.community ?? []}
        betting={gs?.betting ?? EMPTY_BETTING}
        winners={result?.winners}
        theme={theme}
        roomCode={code ?? undefined}
        selfUid={uid}
        ownHole={hole?.cards ?? null}
        revealedHoles={room?.revealedHoles ?? undefined}
        cardBack={(room?.cardBack as never) ?? "classic-blue"}
        cardFace={(room?.cardFace as never) ?? "classic"}
        roomBg={room?.roomBg ?? "onyx"}
        lastAction={gs?.lastAction}
        timeBankByUid={timeBankByUid}
        turnTimeMs={config?.turnTime ?? 30_000}
        onToggleAway={inLobby ? handleToggleSitOut : undefined}
        amSittingOut={myLobbyEntry?.sittingOut === true}
        presenceMap={presenceMap}
        topLeft={topLeft}
        bottomLeft={
          <>
            <VoicePanel
              code={code ?? ""}
              uid={uid}
              displayName={myLobbyEntry?.name ?? mySeat?.name ?? ""}
              seed={myLobbyEntry?.seed ?? mySeat?.seed ?? ""}
            />
            <ChatPanel
              code={code}
              uid={uid}
              name={myLobbyEntry?.name ?? ""}
              seed={myLobbyEntry?.seed ?? ""}
              messages={chatMessages}
            />
            <ReactionBar code={code} uid={uid} />
          </>
        }
        reactions={reactions}
        bottomRight={
          <BettingDock
            seat={mySeat}
            name={myLobbyEntry?.name ?? mySeat?.name ?? ""}
            seed={myLobbyEntry?.seed ?? mySeat?.seed ?? ""}
            betting={gs?.betting ?? null}
            holeCards={hole?.cards ?? null}
            community={gs?.community ?? []}
            isMyTurn={isMyTurn}
            turnTimeMs={config?.turnTime ?? 30_000}
            hasResult={!!result}
            onAction={handleAction}
            extra={playerExtra}
            useTimeBank={myUseTimeBank}
            onToggleTimeBank={handleToggleTimeBank}
          />
        }
        centerOverlay={centerOverlay}
      />

      <AllInVoteChip
        gameState={gs as never}
        selfUid={uid}
        onClick={() => setVoteModalOpen(true)}
      />
      <AllInVoteModal
        gameState={gs as never}
        selfUid={uid}
        open={voteModalOpen}
        onClose={() => setVoteModalOpen(false)}
        onVote={(n) => {
          if (code && uid) postPlayerVote(code, uid, n).catch(() => {});
        }}
      />

      {optionsOpen && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-900 rounded-[28px] ring-1 ring-white/10 shadow-2xl relative p-6 flex flex-col gap-5">
            <button
              type="button"
              onClick={() => setOptionsOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 text-zinc-500 hover:text-white transition"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-black uppercase tracking-tight text-white">
              Mesa {code}
            </h2>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 ring-1 ring-white/10">
              <div>
                <p className="text-sm text-zinc-100 font-bold">Tu estado</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {myLobbyEntry?.sittingOut ? "Sentado fuera" : "Activo"}
                </p>
              </div>
              {!isOut && (
                <button
                  type="button"
                  onClick={handleToggleSitOut}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition btn-press ${
                    myLobbyEntry?.sittingOut
                      ? "bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/20"
                      : "bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-zinc-300"
                  }`}
                >
                  {myLobbyEntry?.sittingOut ? "Volver" : "Sentar fuera"}
                </button>
              )}
            </div>

            <div className="p-3 rounded-2xl bg-white/5 ring-1 ring-white/10 flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Jugadores ({lobby.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {lobby.map((p) => (
                  <div
                    key={p.uid}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 ring-1 ring-white/5 text-[11px] text-zinc-300"
                  >
                    <Avatar seed={p.seed} size={14} />
                    {p.name}
                    {p.uid === uid && " (Tú)"}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
