"use client";
import { DesktopOnlyGate } from "@/components/ui/DesktopOnlyGate";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { Clock, Trophy, Eye, Hourglass, Users, LogIn } from "lucide-react";

// Importar con ssr:false porque VoicePanel usa navigator.mediaDevices,
// RTCPeerConnection y AudioContext que no existen en Node.
const VoicePanel = dynamic(() => import("@/components/voice/VoicePanel"), {
  ssr: false,
});
import { useAuth } from "@/hooks/useAuth";
import { usePresence } from "@/hooks/usePresence";
import { usePresenceMap } from "@/hooks/usePresenceMap";
import {
  useNormalRoom,
  useNormalLobby,
  useNormalHole,
  useQueue,
  useStackRequests,
} from "@/hooks/useNormalRoom";
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
import { buyIn, cashOut, recordSession, refundBuyIn } from "@/lib/users";
import { sessionXp } from "@/lib/progression";
import { availableCoins } from "@/lib/economy";
import { formatChips } from "@/lib/betting";
import type {
  BettingAction,
  BettingRound,
  NormalGameState,
  NormalSeat,
} from "@/lib/betting";
import type { TableThemeId } from "@/lib/themes";
import { TableShell } from "@/components/table/TableShell";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { BettingDock } from "@/components/betting/BettingDock";
import { OptionsMenu } from "@/components/settings/OptionsMenu";
import { PlayerSettings } from "@/components/settings/PlayerSettings";
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

export default function PlayNormalPage() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() ?? null;
  return (
    <DesktopOnlyGate roomCode={code ?? undefined}>
      <PlayNormalPageInner />
    </DesktopOnlyGate>
  );
}

function PlayNormalPageInner() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code?.toUpperCase() ?? null;
  const { uid, loading, profile, isGuest } = useAuth();
  const [mySeed, setMySeed] = useState(() => Math.random().toString(36).slice(2));

  // Contadores de sesion para XP / historial + total comprado para el neto.
  const handsPlayedRef = useRef(0);
  const handsWonRef = useRef(0);
  const biggestPotRef = useRef(0);
  const boughtInRef = useRef(0);
  const countedHandRef = useRef(-1);
  const settledRef = useRef(false);
  // Snapshot del estado vivo para el cleanup de desmontaje (navegacion SPA).
  // Un effect con deps vacias captura valores stale, por eso leemos un ref.
  const liveRef = useRef({ inLobby: false, spectating: false, finalChips: 0, escrow: 0, isCasual: false });

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [openAllInVoteHand, setOpenAllInVoteHand] = useState<number | null>(null);
  const [closedRunResultsHand, setClosedRunResultsHand] = useState<number | null>(null);
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
  const { queue, position: queuePos } = useQueue(code, uid);
  const stackRequests = useStackRequests(code);
  const [spectating, setSpectating] = useState(false);

  // Register/unregister spectator presence while watching.
  useEffect(() => {
    if (!code || !uid || !spectating) return;
    joinSpectators(code, uid, profile?.nickname ?? "Espectador", mySeed).catch(() => {});
    return () => {
      leaveSpectators(code, uid).catch(() => {});
    };
  }, [code, uid, spectating, profile?.nickname, mySeed]);

  useEffect(() => {
    if (!code || !uid) return;
    return subscribeMyStackRequest(code, uid, setMyRequest);
  }, [code, uid]);

  const gs = room?.state ?? null;
  const config = room?.config;
  const mySeat = gs?.seats.find((s) => s.id === uid) ?? null;

  // Vibrate once when it becomes the player's turn (mobile UX).
  const isMyTurn = !!(gs && mySeat && gs.betting.toActId === mySeat.id);
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
  // Modo casual: stacks libres del host, sin tocar wallet/monedas/XP.
  const isCasual = (room?.economy ?? "coins") === "casual";

  const inLobby = uid ? lobby.some((p) => p.uid === uid) : false;
  const maxPlayers = room?.maxPlayers ?? 9;
  // Pending join requests from others already claim a free seat.
  const pendingJoinsOthers = stackRequests.filter(
    (r) => r.type === "join" && r.status === "pending" && r.uid !== uid,
  ).length;
  const roomFull = lobby.length + pendingJoinsOthers >= maxPlayers;
  // A freed seat belongs to the head of the wait queue first.
  const queueAhead = queue.length > 0 && queuePos !== 1;
  const seatBlocked = roomFull || queueAhead;
  const isQueueHead = queuePos === 1;
  const myLobbyEntry = uid ? lobby.find((p) => p.uid === uid) : null;
  const result = room?.result ?? null;
  const currentHandNum = gs?.betting.handNum ?? EMPTY_BETTING.handNum;
  const visibleRunResults =
    closedRunResultsHand === currentHandNum ? null : (room?.runResults ?? null);
  const allInVoteOpen =
    gs?.phase === "all-in-negotiation" && openAllInVoteHand === currentHandNum;

  // Mantener el snapshot al dia para el cleanup de desmontaje.
  useEffect(() => {
    liveRef.current = {
      inLobby,
      spectating,
      finalChips: mySeat?.chips ?? myLobbyEntry?.chips ?? 0,
      escrow: (code && profile?.escrows?.[code]) || 0,
      isCasual,
    };
  }, [code, inLobby, spectating, mySeat?.chips, myLobbyEntry?.chips, profile?.escrows, isCasual]);

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

  // Cuenta manos jugadas/ganadas y el bote mayor para XP + historial.
  // El guard por handNum evita contar dos veces el mismo showdown.
  useEffect(() => {
    if (!result || !gs || !uid || !inLobby) return;
    const hn = gs.betting.handNum;
    if (countedHandRef.current === hn) return;
    countedHandRef.current = hn;
    handsPlayedRef.current += 1;
    if (result.winners.includes(uid)) handsWonRef.current += 1;
    const pot = gs.betting.pot ?? 0;
    if (pot > biggestPotRef.current) biggestPotRef.current = pot;
  }, [result, gs, uid, inLobby]);

  // Liquidacion al desmontar (navegacion SPA): evita que el escrow quede
  // bloqueado si el jugador se va sin pulsar "Salir". El cierre de pestana no
  // garantiza writes async, pero la navegacion interna del SPA si. Usa el
  // snapshot de liveRef (no closures stale) y se salta si ya se liquido.
  useEffect(() => {
    return () => {
      if (!uid || !code) return;
      const s = liveRef.current;
      if (s.spectating) {
        leaveSpectators(code, uid).catch(() => {});
        return;
      }
      if (settledRef.current) return;
      settledRef.current = true;
      // Casual: sin wallet ni XP — solo la salida del lobby (la maneja el host/heartbeat).
      if (s.isCasual) return;
      if (s.inLobby) {
        cashOut(uid, code, s.finalChips).catch(() => {});
        const handsPlayed = handsPlayedRef.current;
        if (handsPlayed > 0) {
          recordSession(uid, {
            code,
            roomName: room?.roomName ?? `Sala ${code}`,
            handsPlayed,
            handsWon: handsWonRef.current,
            net: s.finalChips - boughtInRef.current,
            biggestPot: biggestPotRef.current,
            xpGained: sessionXp(handsPlayed, handsWonRef.current),
          }).catch(() => {});
        }
      } else if (s.escrow > 0) {
        // Solicitud pendiente nunca aprobada: devolver el escrow exacto.
        refundBuyIn(uid, code, s.escrow).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, code]);

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

  // Mensaje legible para los errores de negocio del buy-in.
  function buyInErrorMessage(err: unknown, fallback: string): string {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "Cuenta de invitado") return "Inicia sesion para jugar en una mesa con monedas.";
    if (msg === "Saldo insuficiente") return fallback;
    return msg || fallback;
  }

  async function handleJoinRequest(name: string, stack: number, seed: string) {
    if (!uid || !code) return;
    setMySeed(seed);
    if (isCasual) {
      // Modo casual: no se toca el wallet — el host define/aprueba el stack libre.
      await submitStackRequest(code, {
        uid,
        name,
        seed,
        requestedStack: stack,
        type: "join",
        ts: Date.now(),
      });
    } else {
      // El servidor descuenta el escrow y crea la solicitud en la MISMA
      // transaccion: no hay solicitud sin monedas ni monedas sin solicitud.
      try {
        await buyIn(uid, code, stack, { type: "join", name, seed });
        boughtInRef.current += stack;
        settledRef.current = false;
      } catch (err) {
        alert(buyInErrorMessage(err, "No tienes monedas suficientes para esa entrada."));
        return;
      }
    }
    // La solicitud ya ocupa el asiento libre: salir de la fila.
    if (queuePos > 0) leaveQueue(code, uid).catch(() => {});
  }

  async function handleRebuyRequest(stack: number) {
    if (!uid || !code || !myLobbyEntry) return;
    if (isCasual) {
      await submitStackRequest(code, {
        uid,
        name: myLobbyEntry.name,
        seed: myLobbyEntry.seed,
        requestedStack: stack,
        type: "rebuy",
        ts: Date.now(),
      });
      return;
    }
    try {
      await buyIn(uid, code, stack, {
        type: "rebuy",
        name: myLobbyEntry.name,
        seed: myLobbyEntry.seed,
      });
      boughtInRef.current += stack;
    } catch (err) {
      alert(buyInErrorMessage(err, "No tienes monedas suficientes para ese rebuy."));
    }
  }

  // Cancela una solicitud pendiente. Con monedas el servidor devuelve el
  // escrow de esa solicitud y la borra (ya no se puede aprobar).
  async function handleCancelRequest() {
    if (!uid || !code || !myRequest) return;
    const amt = myRequest.requestedStack ?? 0;
    if (!isCasual) {
      try {
        await refundBuyIn(uid, code, amt);
        boughtInRef.current = Math.max(0, boughtInRef.current - amt);
      } catch {
        alert("No se pudo cancelar la solicitud.");
        return;
      }
    }
    await dismissStackRequest(code, uid).catch(() => {});
    setMyRequest(null);
  }

  async function handleAction(action: BettingAction, amount?: number) {
    const seatId = mySeat?.id ?? uid;
    if (!seatId || !code) return;
    await postPlayerAction(code, seatId, action, amount);
  }

  async function handleRunVote(n: number) {
    if (!uid || !code) return;
    await postPlayerVote(code, uid, n).catch(() => {});
    setOpenAllInVoteHand(null);
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

  // Rebuy rechazado por el host: el jugador sigue sentado y no hay pantalla de
  // rechazo dedicada, asi que devolvemos el escrow automaticamente y descartamos.
  // (El rechazo de "join" se maneja en handleRetry con su pantalla propia.)
  useEffect(() => {
    if (!uid || !code) return;
    if (myRequest?.status !== "rejected" || myRequest.type !== "rebuy") return;
    const amt = myRequest.requestedStack ?? 0;
    (async () => {
      // En casual no hay escrow que devolver. Con monedas el servidor devuelve
      // el escrow de la solicitud rechazada y borra el doc.
      if (!isCasual && amt > 0) {
        await refundBuyIn(uid, code, amt).catch(() => {});
        boughtInRef.current = Math.max(0, boughtInRef.current - amt);
      }
      await dismissStackRequest(code, uid).catch(() => {});
      setMyRequest(null);
    })();
  }, [myRequest?.status, myRequest?.type, myRequest?.requestedStack, uid, code, isCasual]);

  async function handleRetry() {
    if (!uid || !code) return;
    // El host rechazo la solicitud: devolver el escrow comprometido en el buy-in
    // antes de descartar la solicitud (si no, las monedas quedan bloqueadas).
    // En casual no hay escrow.
    const amt = myRequest?.requestedStack ?? 0;
    if (!isCasual && amt > 0) {
      await refundBuyIn(uid, code, amt).catch(() => {});
      boughtInRef.current = Math.max(0, boughtInRef.current - amt);
    }
    await dismissStackRequest(code, uid);
    setMyRequest(null);
  }

  // Liquida la sesion: devuelve las fichas finales al wallet (cash-out) y
  // registra XP + historial. lobby.chips es la verdad del host (no falsificable).
  async function settleSession() {
    if (!uid || !code || settledRef.current) return;
    settledRef.current = true;
    // Casual: sin wallet ni XP — no hay nada que liquidar.
    if (isCasual) return;
    const finalChips = mySeat?.chips ?? myLobbyEntry?.chips ?? 0;
    await cashOut(uid, code, finalChips).catch(() => {});
    const handsPlayed = handsPlayedRef.current;
    if (handsPlayed > 0 || boughtInRef.current > 0) {
      const xpGained = sessionXp(handsPlayed, handsWonRef.current);
      await recordSession(uid, {
        code,
        roomName: room?.roomName ?? `Sala ${code}`,
        handsPlayed,
        handsWon: handsWonRef.current,
        net: finalChips - boughtInRef.current,
        biggestPot: biggestPotRef.current,
        xpGained,
      }).catch(() => {});
    }
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
    // Con monedas el cash-out del servidor paga el stack Y retira la entrada
    // del lobby en la misma transaccion (no se borra desde el cliente).
    await settleSession();
    if (isCasual) {
      // Casual: no hay cash-out; el jugador retira su propia entrada.
      await kickFromLobby(code, uid).catch(() => {});
    }
    router.push("/lobby");
  }

  if (loading || room === undefined) {
    return (
      <div className="fixed inset-0 flex items-center justify-center text-muted text-sm bg-ink-900">
        Conectando…
      </div>
    );
  }
  if (!room) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 text-sm bg-ink-900">
        <p className="text-secondary">Sala no encontrada.</p>
        <p className="text-xs text-muted">Código: {code}</p>
        <a
          href="/join"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-bone/[0.04] hover:bg-bone/[0.07] ring-1 ring-line text-primary transition"
        >
          Intentar con otro código
        </a>
      </div>
    );
  }

  if (!inLobby && !spectating) {
    return (
      <div className="fixed inset-0 bg-ink-900 flex items-center justify-center p-4">
        {myRequest?.status === "pending" ? (
          <div className="fixed inset-0 bg-ink-900 flex flex-col items-center justify-center gap-0 p-6 animate-in fade-in duration-500">
            {/* Ambient glow */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-accent-500/5 blur-[80px]" />
            </div>

            {/* Room code chip */}
            {code && (
              <div className="eyebrow text-[11px] mb-8 px-4 py-1.5 rounded-full bg-bone/[0.04] ring-1 ring-line font-mono">
                Sala {code}
              </div>
            )}

            {/* Avatar */}
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full overflow-hidden ring-1 ring-line-strong">
                <Avatar seed={mySeed} size={96} className="ring-0 rounded-none" />
              </div>
              {/* Pulsing ring */}
              <div className="absolute inset-0 rounded-full ring-2 ring-accent-400/20 animate-ping" />
            </div>

            {/* Name */}
            <h2 className="text-2xl font-semibold text-primary tracking-tight mb-1">
              {myRequest.name}
            </h2>

            {/* Stack badge */}
            <div className="flex items-center gap-2 px-5 py-2 rounded-full bg-accent-500/8 ring-1 ring-accent-400/18 mb-8">
              <div className="w-3 h-3 rounded-full bg-accent-400" />
              <span className="text-accent-300 font-mono font-semibold tabular-nums">
                {formatChips(myRequest.requestedStack)} fichas
              </span>
            </div>

            {/* Status */}
            <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-ink-850/80 ring-1 ring-line">
              <Clock className="w-4 h-4 text-accent-400 animate-pulse flex-shrink-0" />
              <p className="text-sm text-secondary">
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

            <button
              type="button"
              onClick={handleCancelRequest}
              className="text-xs font-semibold mt-8 px-4 py-2 rounded-full bg-bone/[0.04] hover:bg-bone/[0.07] ring-1 ring-line transition btn-press"
            >
              Cancelar solicitud
            </button>
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
              className="px-6 py-3 rounded-2xl bg-bone/[0.04] hover:bg-bone/[0.07] ring-1 ring-line text-primary text-sm font-bold transition btn-press"
            >
              Intentar de nuevo
            </button>
          </div>
        ) : !isCasual && isGuest ? (
          <GuestCoinsPanel
            code={code ?? ""}
            onSpectate={() => setSpectating(true)}
          />
        ) : seatBlocked ? (
          <FullRoomPanel
            code={code ?? ""}
            playerCount={lobby.length}
            maxPlayers={maxPlayers}
            queuePos={queuePos}
            onSpectate={() => setSpectating(true)}
            onJoinQueue={(name) => {
              if (uid && code) joinQueue(code, uid, name, mySeed).catch(() => {});
            }}
            onLeaveQueue={() => {
              if (uid && code) leaveQueue(code, uid).catch(() => {});
            }}
          />
        ) : (
          <div className="fixed inset-0 bg-ink-900 overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            {isQueueHead && (
              <div className="eyebrow text-[11px] mx-auto mt-6 w-fit rounded-full bg-accent-500/10 px-4 py-1.5 text-accent-300 ring-1 ring-accent-400/25">
                Se libero un asiento: elige tu entrada
              </div>
            )}
            <JoinWithStack
              defaultName={profile?.nickname ?? ""}
              suggestedStack={config?.startingStack ?? 1000}
              locked={locked}
              showAvatar
              roomCode={code ?? undefined}
              maxStack={isCasual ? undefined : profile ? availableCoins(profile) : undefined}
              onSubmit={handleJoinRequest}
            />
          </div>
        )}
      </div>
    );
  }

  const isOut = mySeat?.status === "out";
  // Rebuy aprobado por el host pero aun no aplicado (entra la proxima mano).
  const approvedRebuy = (uid && room?.pendingRebuys?.[uid]) || 0;
  // `myRequest === undefined` = la suscripcion aun no respondio: no ofrecer el
  // formulario todavia (evita pedir dos rebuys seguidos).
  const needsRebuy = isOut && myRequest === null && approvedRebuy <= 0;
  const rebuyPending = myRequest?.status === "pending" && myRequest.type === "rebuy";

  const isShowdown = gs?.phase === "showdown";
  const canMuckOrShow = isShowdown && mySeat?.status !== "sitting-out" && hole?.cards;
  const hasRevealedLeft = room?.revealedHoles?.[uid ?? ""]?.[0] != null;
  const hasRevealedRight = room?.revealedHoles?.[uid ?? ""]?.[1] != null;
  const hasRevealedBoth = hasRevealedLeft && hasRevealedRight;

  const showMuckUI = canMuckOrShow ? (
    <div className="glass-panel mt-3 flex items-center justify-center gap-2 rounded-[24px] p-3">
      <span className="eyebrow text-[11px] mr-2">Cartas</span>
      <button
        onClick={() => postPlayerAction(code!, uid!, "show-card", 0)}
        disabled={hasRevealedLeft}
        className={`text-xs font-semibold btn-press rounded-xl px-4 py-2 ${hasRevealedLeft ? "glass-button glass-button-accent opacity-50" : "glass-button glass-button-ghost"}`}
      >
        Izq
      </button>
      <button
        onClick={() => postPlayerAction(code!, uid!, "show-card", 1)}
        disabled={hasRevealedRight}
        className={`text-xs font-semibold btn-press rounded-xl px-4 py-2 ${hasRevealedRight ? "glass-button glass-button-accent opacity-50" : "glass-button glass-button-ghost"}`}
      >
        Der
      </button>
      <button
        onClick={() => postPlayerAction(code!, uid!, "show-card", 2)}
        disabled={hasRevealedBoth}
        className={`text-xs font-semibold btn-press rounded-xl px-4 py-2 ${hasRevealedBoth ? "glass-button glass-button-accent opacity-50" : "glass-button glass-button-accent"}`}
      >
        Ambas
      </button>
    </div>
  ) : null;

  const playerExtra =
    isShowdown && showMuckUI ? showMuckUI :
    needsRebuy || rebuyPending || (isOut && approvedRebuy > 0) ? (
      <div className="mt-3">
        {needsRebuy && (
          <JoinWithStack
            defaultName={myLobbyEntry?.name ?? ""}
            suggestedStack={config?.startingStack ?? 1000}
            mode="rebuy"
            maxStack={isCasual ? undefined : profile ? availableCoins(profile) : undefined}
            onSubmit={async (_, stack) => handleRebuyRequest(stack) as unknown as Promise<void>}
          />
        )}
        {rebuyPending && (
          <div className="eyebrow text-[11px] glass-panel rounded-2xl py-3 text-center text-accent-200">
            Rebuy pendiente ({formatChips(myRequest!.requestedStack)})
          </div>
        )}
        {!rebuyPending && isOut && approvedRebuy > 0 && (
          <div className="eyebrow text-[11px] glass-panel rounded-2xl py-3 text-center text-accent-200">
            Rebuy aprobado ({formatChips(approvedRebuy)}): entras la proxima mano
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
        <div className="glass-panel flex flex-col items-center gap-4 rounded-[28px] px-4 py-5">
          <SeatPicker
            myUid={uid ?? ""}
            myPreferredSlot={myPreferredSlot}
            occupants={seatOccupants}
            onPick={handlePickSeat}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="eyebrow text-[11px] flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-accent-500 animate-pulse" />
              Esperando al host…
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-xs font-semibold glass-chip btn-press px-3 py-1"
            >
              ¿Sin actualizaciones? Refrescar
            </button>
          </div>
        </div>
      )}
      {result && gs && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in duration-500">
          <div className="glass-panel flex flex-col items-center rounded-[30px] px-8 py-4 ring-1 ring-accent-400/40">
            <span className="eyebrow text-[11px] text-accent-400 mb-1">
              Mano terminada
            </span>
            <h4 className="text-xl font-semibold text-primary flex items-center gap-2">
              {result.winners.includes(uid ?? "") && (
                <Trophy className="w-5 h-5 text-accent-400" />
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
              canLeave={false}
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
      <AllInVoteModal
        gameState={gs as NormalGameState | null}
        selfUid={uid}
        onVote={handleRunVote}
        open={allInVoteOpen}
        onClose={() => setOpenAllInVoteHand(null)}
      />
      {!allInVoteOpen && (
        <AllInVoteChip
          gameState={gs as NormalGameState | null}
          selfUid={uid}
          onClick={() => setOpenAllInVoteHand(currentHandNum)}
          onVote={handleRunVote}
        />
      )}
      {visibleRunResults ? (
        <RunResults
          runs={visibleRunResults}
          players={(gs?.seats ?? placeholderSeats).map((s) => ({
            id: s.id,
            name: s.name,
            seed: s.seed,
            createdAt: 0,
          }))}
          onClose={() => setClosedRunResultsHand(currentHandNum)}
        />
      ) : null}
    </>
  );
}

// Mesas con monedas: los invitados (cuenta anonima) no pueden comprar entrada.
function GuestCoinsPanel({
  code,
  onSpectate,
}: {
  code: string;
  onSpectate: () => void;
}) {
  const next = encodeURIComponent(`/play/normal/${code}`);
  return (
    <div className="fixed inset-0 bg-ink-900 flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="glass-panel flex w-full max-w-sm flex-col gap-5 rounded-[30px] p-6 text-center">
        {code && (
          <div className="text-xs font-semibold glass-chip mx-auto px-4 py-1.5 font-mono">
            Sala {code}
          </div>
        )}
        <h2 className="text-xl font-bold text-primary">Mesa con monedas</h2>
        <p className="text-sm text-secondary">
          Para sentarte necesitas una cuenta. Como invitado puedes observar la mesa.
        </p>
        <a
          href={`/login?next=${next}`}
          className="font-semibold glass-button glass-button-accent btn-press inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm"
        >
          <LogIn className="w-4 h-4" />
          Iniciar sesion
        </a>
        <button
          type="button"
          onClick={onSpectate}
          className="font-semibold glass-button glass-button-ghost btn-press inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm"
        >
          <Eye className="w-4 h-4" />
          Observar la mesa
        </button>
      </div>
    </div>
  );
}

// Shown when the room is full: spectate now, or take a numbered spot in the
// wait queue. When a seat frees, the head of the queue gets the join form
// (coins: normal buy-in + approval; casual: the host seats it directly).
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
    <div className="fixed inset-0 bg-ink-900 flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="glass-panel flex w-full max-w-sm flex-col gap-6 rounded-[30px] p-6 text-center">
        {code && (
          <div className="text-xs font-semibold glass-chip mx-auto px-4 py-1.5 font-mono">
            Sala {code}
          </div>
        )}

        <div className="flex flex-col items-center gap-2">
          <div className="glass-icon-button rounded-2xl p-3 text-secondary">
            <Users className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-primary">Sala llena</h2>
          <p className="text-sm text-muted tabular-nums">
            {playerCount}/{maxPlayers} jugadores
          </p>
        </div>

        {queued ? (
          <div className="glass flex flex-col items-center gap-3 rounded-2xl p-5">
            <Hourglass className="w-5 h-5 text-secondary animate-pulse" />
            <p className="text-sm text-secondary">
              Estás en el puesto{" "}
              <span className="text-primary font-semibold text-lg">#{queuePos}</span>
            </p>
            <p className="text-[11px] text-muted">
              Cuando se libere un asiento te toca a ti primero.
            </p>
            <button
              type="button"
              onClick={onLeaveQueue}
              className="text-xs font-semibold glass-chip btn-press mt-1 px-3 py-1"
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
              className="w-full px-4 py-3 rounded-xl bg-white/[0.04] ring-1 ring-line focus:ring-white/40 outline-none text-primary placeholder:text-muted text-center transition"
            />
            <button
              type="button"
              disabled={!name.trim()}
              onClick={() => onJoinQueue(name.trim())}
              className="font-semibold glass-button glass-button-accent btn-press inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm disabled:opacity-40"
            >
              <Hourglass className="w-4 h-4" />
              Hacer fila
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onSpectate}
          className="font-semibold glass-button glass-button-ghost btn-press inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm"
        >
          <Eye className="w-4 h-4" />
          Observar la mesa
        </button>
      </div>
    </div>
  );
}
