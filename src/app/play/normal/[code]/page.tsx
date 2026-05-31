"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { Clock, Trophy, Eye, Hourglass, Users } from "lucide-react";

// Importar con ssr:false porque VoicePanel usa navigator.mediaDevices,
// RTCPeerConnection y AudioContext que no existen en Node.
const VoicePanel = dynamic(() => import("@/components/voice/VoicePanel"), {
  ssr: false,
});
import { useAuth } from "@/hooks/useAuth";
import { usePresence } from "@/hooks/usePresence";
import { usePresenceMap } from "@/hooks/usePresenceMap";
import { useNormalRoom, useNormalLobby, useNormalHole, useQueue } from "@/hooks/useNormalRoom";
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
  kickFromLobby,
  joinQueue,
  leaveQueue,
  joinSpectators,
  leaveSpectators,
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
import { OptionsMenu } from "@/components/settings/OptionsMenu";
import { PlayerSettings } from "@/components/settings/PlayerSettings";
// AllInVoteModal + AllInVoteChip removed — run-it-N pending reimplementation

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
  const router = useRouter();
  const code = params.code?.toUpperCase() ?? null;
  const { uid, loading } = useAuth();
  const [mySeed] = useState(() => Math.random().toString(36).slice(2));
  const mySeedRef = useRef(mySeed);

  const [optionsOpen, setOptionsOpen] = useState(false);
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
  const { position: queuePos } = useQueue(code, uid);
  const [spectating, setSpectating] = useState(false);

  // Register/unregister spectator presence while watching.
  useEffect(() => {
    if (!code || !uid || !spectating) return;
    joinSpectators(code, uid, "Espectador", mySeedRef.current).catch(() => {});
    return () => {
      leaveSpectators(code, uid).catch(() => {});
    };
  }, [code, uid, spectating]);

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
  const theme: TableThemeId = (room?.theme as TableThemeId) ?? "noir";
  const locked = room?.locked ?? false;

  const inLobby = uid ? lobby.some((p) => p.uid === uid) : false;
  const maxPlayers = room?.maxPlayers ?? 9;
  const roomFull = lobby.length >= maxPlayers;
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

  async function handleRetry() {
    if (!uid || !code) return;
    await dismissStackRequest(code, uid);
    setMyRequest(null);
  }

  async function handleLeave() {
    if (!uid || !code) return;
    if (spectating) {
      await leaveSpectators(code, uid).catch(() => {});
      setSpectating(false);
      router.push("/lobby");
      return;
    }
    if (!confirm("¿Salir de la sala? Perderás tu lugar en esta mano.")) return;
    try {
      await kickFromLobby(code, uid);
    } catch { /* ignore */ }
    router.push("/lobby");
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

  if (!inLobby && !spectating) {
    return (
      <div className="fixed inset-0 bg-[#0b0b0b] flex items-center justify-center p-4">
        {myRequest?.status === "pending" ? (
          <div className="fixed inset-0 bg-[#0b0b0b] flex flex-col items-center justify-center gap-0 p-6 animate-in fade-in duration-500">
            {/* Ambient glow */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-amber-500/5 blur-[80px]" />
            </div>

            {/* Room code chip */}
            {code && (
              <div className="mb-8 px-4 py-1.5 rounded-full bg-white/5 ring-1 ring-white/10 text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">
                Sala {code}
              </div>
            )}

            {/* Avatar */}
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full overflow-hidden ring-2 ring-amber-400/25 shadow-[0_0_40px_-8px_rgba(180,130,40,0.25)]">
                <Avatar seed={mySeedRef.current} size={96} className="ring-0 rounded-none" />
              </div>
              {/* Pulsing ring */}
              <div className="absolute inset-0 rounded-full ring-2 ring-amber-400/20 animate-ping" />
            </div>

            {/* Name */}
            <h2 className="text-2xl font-black text-white tracking-tight mb-1">
              {myRequest.name}
            </h2>

            {/* Stack badge */}
            <div className="flex items-center gap-2 px-5 py-2 rounded-full bg-amber-500/8 ring-1 ring-amber-400/18 mb-8">
              <div className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(180,130,40,0.5)]" />
              <span className="text-amber-300 font-mono font-black tabular-nums">
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
        ) : roomFull ? (
          <FullRoomPanel
            code={code ?? ""}
            playerCount={lobby.length}
            maxPlayers={maxPlayers}
            queuePos={queuePos}
            onSpectate={() => setSpectating(true)}
            onJoinQueue={(name) => {
              if (uid && code) joinQueue(code, uid, name, mySeedRef.current).catch(() => {});
            }}
            onLeaveQueue={() => {
              if (uid && code) leaveQueue(code, uid).catch(() => {});
            }}
          />
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
        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${hasRevealedLeft ? "bg-amber-500/10 text-amber-500 opacity-50" : "bg-white/10 hover:bg-white/20 text-white"}`}
      >
        Isq
      </button>
      <button
        onClick={() => postPlayerAction(code!, uid!, "show-card", 1)}
        disabled={hasRevealedRight}
        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${hasRevealedRight ? "bg-amber-500/10 text-amber-500 opacity-50" : "bg-white/10 hover:bg-white/20 text-white"}`}
      >
        Der
      </button>
      <button
        onClick={() => postPlayerAction(code!, uid!, "show-card", 2)}
        disabled={hasRevealedBoth}
        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${hasRevealedBoth ? "bg-amber-500/10 text-amber-500 opacity-50" : "bg-amber-700/70 hover:bg-amber-600/75 text-amber-100 shadow-lg shadow-amber-700/20"}`}
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
      {!gs && inLobby && (
        <div className="flex flex-col items-center gap-4 px-4 py-5 rounded-2xl bg-zinc-900/90 backdrop-blur-md ring-1 ring-white/10 shadow-2xl">
          <SeatPicker
            myUid={uid ?? ""}
            myPreferredSlot={myPreferredSlot}
            occupants={seatOccupants}
            onPick={handlePickSeat}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-zinc-500 text-[11px] font-bold uppercase tracking-widest">
              <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
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
    <OptionsMenu
      name={myLobbyEntry?.name ?? mySeat?.name ?? "Invitado"}
      seed={myLobbyEntry?.seed ?? mySeat?.seed ?? mySeed}
      onOpenSettings={() => setOptionsOpen(true)}
      away={myLobbyEntry?.sittingOut === true}
      onToggleAway={inLobby ? handleToggleSitOut : undefined}
      onLeave={handleLeave}
      leaveLabel={spectating ? "Dejar de observar" : "Salir de la sala"}
    />
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
        ownHole={inLobby ? (hole?.cards ?? null) : null}
        isSpectator={!inLobby && spectating}
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
          inLobby ? (
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
          ) : null
        }
        centerOverlay={centerOverlay}
      />


      {optionsOpen && (
        <PlayerSettings
          code={code}
          joinUrl={
            typeof window !== "undefined" && code
              ? `${window.location.origin}/play/normal/${code}`
              : ""
          }
          lobby={lobby}
          selfUid={uid}
          onClose={() => setOptionsOpen(false)}
        />
      )}
    </>
  );
}

// Shown when the room is full: spectate now, or take a numbered spot in the
// wait queue (the host auto-seats the head when a seat frees).
function FullRoomPanel({
  code,
  playerCount,
  maxPlayers,
  queuePos,
  onSpectate,
  onJoinQueue,
  onLeaveQueue,
}: {
  code: string;
  playerCount: number;
  maxPlayers: number;
  queuePos: number;
  onSpectate: () => void;
  onJoinQueue: (name: string) => void;
  onLeaveQueue: () => void;
}) {
  const [name, setName] = useState("");
  const queued = queuePos > 0;
  return (
    <div className="fixed inset-0 bg-[#0b0b0b] flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="w-full max-w-sm flex flex-col gap-6 text-center">
        {code && (
          <div className="mx-auto px-4 py-1.5 rounded-full bg-white/5 ring-1 ring-white/10 text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">
            Sala {code}
          </div>
        )}

        <div className="flex flex-col items-center gap-2">
          <div className="p-3 rounded-2xl bg-white/[0.06] ring-1 ring-white/10 text-zinc-300">
            <Users className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-zinc-50">Sala llena</h2>
          <p className="text-sm text-zinc-500 tabular-nums">
            {playerCount}/{maxPlayers} jugadores
          </p>
        </div>

        {queued ? (
          <div className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
            <Hourglass className="w-5 h-5 text-zinc-300 animate-pulse" />
            <p className="text-sm text-zinc-300">
              Estás en el puesto{" "}
              <span className="text-zinc-50 font-black text-lg">#{queuePos}</span>
            </p>
            <p className="text-[11px] text-zinc-500">
              Te sentaremos automáticamente cuando se libere un asiento.
            </p>
            <button
              type="button"
              onClick={onLeaveQueue}
              className="mt-1 text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-200 transition"
            >
              Salir de la fila
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 20))}
              placeholder="Tu nombre"
              className="w-full px-4 py-3 rounded-xl bg-white/[0.04] ring-1 ring-white/10 focus:ring-white/40 outline-none text-zinc-100 placeholder:text-zinc-600 text-center transition"
            />
            <button
              type="button"
              disabled={!name.trim()}
              onClick={() => onJoinQueue(name.trim())}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-white text-black font-bold text-sm uppercase tracking-widest hover:bg-zinc-200 disabled:opacity-40 transition btn-press"
            >
              <Hourglass className="w-4 h-4" />
              Hacer fila
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onSpectate}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-white/[0.05] hover:bg-white/[0.1] ring-1 ring-white/10 text-zinc-200 font-bold text-sm uppercase tracking-widest transition btn-press"
        >
          <Eye className="w-4 h-4" />
          Observar la mesa
        </button>
      </div>
    </div>
  );
}
