"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NormalGameState, RoomConfig } from "@/lib/betting";
import { DEFAULT_CONFIG, handleAction, startHand } from "@/lib/betting";
import type { NormalRoomDoc, PendingAction, NormalLobbyPlayer } from "@/lib/normalRooms";
import {
  commitNormalSettle,
  consumePendingRebuysPatch,
  kickFromLobby,
  patchNormalRoom,
  syncLobbyChips,
  writeNormalDealt,
} from "@/lib/normalRooms";
import { showdown, bestHand, categoryFor, compareScore } from "@/lib/handEval";
import type { Category } from "@/lib/handEval";
import { writeHandRecord } from "@/lib/handHistory";
import type { Card } from "@/lib/poker";
import { makeDeck, shuffle } from "@/lib/poker";
import {
  chooseRunCount,
  maxRunCountForState,
  resolveRunItN,
  runOptionsForState,
  type RunItRun,
} from "@/lib/runIt";
import { isInHand, settleShowdown } from "@/lib/showdownPayout";
import {
  countDealable,
  detachSeats,
  indexLobby,
  isBettingPhase,
  isDetached,
  lobbyChipsUpdates,
  nextHandSeats,
  settleSeats,
  voidHand,
  withTurnDeadline,
  type LobbyById,
} from "@/lib/normalSeats";
import { configForHand, knockoutsFromHand, recordKnockout } from "@/lib/tournament";
import { callEconomy } from "@/lib/economyClient";

export type RunRecord = {
  community: Card[];
  winners: string[];
  category: Category;
} & Partial<RunItRun>;

const ALL_IN_VOTE_TIMEOUT_MS = 8_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toPublicState(gs: NormalGameState) {
  const { deck, ...rest } = gs;
  return { ...rest, deckCount: deck.length };
}

// Stack a seat started the current hand with (chips behind + committed). This
// is what lobby/{uid}.chips mirrors, so a voided hand and the lobby agree.
function stackOf(seat: { chips: number; totalBet: number }): number {
  return seat.chips + seat.totalBet;
}

function withRunoutDeck(
  state: NormalGameState,
  holeCards: Record<string, [Card, Card]>,
  runCount: number,
): NormalGameState {
  const needed = runCount * (state.street === "preflop" ? 8 : state.street === "flop" ? 4 : state.street === "turn" ? 2 : 0);
  if (needed === 0 || state.deck.length >= needed) return state;

  const known = new Set<string>();
  for (const c of state.community) known.add(c.id);
  for (const c of state.burns) known.add(c.id);
  for (const h of Object.values(holeCards)) {
    known.add(h[0].id);
    known.add(h[1].id);
  }

  return {
    ...state,
    deck: shuffle(makeDeck()).filter((c) => !known.has(c.id)),
  };
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function estimateAllInEquity(
  state: NormalGameState,
  playerIds: string[],
  holeCards: Record<string, [Card, Card]>,
  trials = 700,
): Record<string, number> {
  const equity: Record<string, number> = {};
  for (const id of playerIds) equity[id] = 0;

  const knownIds = new Set(state.community.map((c) => c.id));
  for (const id of playerIds) {
    const hole = holeCards[id];
    if (!hole) continue;
    knownIds.add(hole[0].id);
    knownIds.add(hole[1].id);
  }

  const deck = state.deck.filter((c) => !knownIds.has(c.id));
  const missing = Math.max(0, 5 - state.community.length);
  const runnableTrials = Math.max(1, trials);

  for (let i = 0; i < runnableTrials; i++) {
    const board = [...state.community, ...shuffled(deck).slice(0, missing)];
    const scores: Record<string, number[]> = {};
    for (const id of playerIds) {
      const hole = holeCards[id];
      if (hole) scores[id] = bestHand([...hole, ...board]);
    }
    const scored = playerIds.filter((id) => scores[id]);
    if (scored.length === 0) continue;
    let best = scores[scored[0]];
    for (const id of scored) {
      if (compareScore(scores[id], best) > 0) best = scores[id];
    }
    const winners = scored.filter((id) => compareScore(scores[id], best) === 0);
    const share = 1 / winners.length;
    for (const id of winners) equity[id] += share;
  }

  for (const id of playerIds) {
    equity[id] = Math.round((equity[id] / runnableTrials) * 100);
  }
  return equity;
}

type UseNormalGameOptions = {
  // True once the lobby subscription delivered a real snapshot. A missing lobby
  // entry means "that player left the table" only while this is true.
  lobbyReady?: boolean;
  // Firebase ID token of the host (economy calls: host-cash-out on kick).
  getToken?: () => Promise<string | null>;
};

type UseNormalGameReturn = {
  gameState: NormalGameState | null;
  startNewHand: () => Promise<boolean>;
  resolveShowdown: () => Promise<void>;
  adjustPlayerChips: (uid: string, delta: number) => void;
  setAllChips: (amount: number) => void;
  kickPlayer: (uid: string) => Promise<void>;
  isProcessing: boolean;
  runs: RunRecord[] | null;
  dismissRuns: () => void;
  // No hand in progress and at least two players would be dealt in.
  canStartHand: boolean;
};

export function useNormalGame(
  code: string | null,
  room: NormalRoomDoc | null,
  lobby: NormalLobbyPlayer[],
  uid: string | null,
  holeCards: Record<string, [Card, Card]>,
  options: UseNormalGameOptions = {},
): UseNormalGameReturn {
  const { lobbyReady = true, getToken } = options;
  const [gameState, setGameState] = useState<NormalGameState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [negotiationTick, setNegotiationTick] = useState(0);
  const handNumRef = useRef(0);
  const dealerIdxRef = useRef(-1);
  const isAdminRef = useRef(false);
  const dealtHolesRef = useRef<Record<string, [Card, Card]>>({});
  // Tracks which hand had all-in negotiation triggered, so the auto-advance
  // effect doesn't re-fire after the run starts and clears allInNegotiation.
  const allInTriggeredHandRef = useRef<number>(-1);
  // Tracks which hand's all-in run was already started, prevents finalize re-entry.
  const allInRanHandRef = useRef<number>(-1);
  // Tracks which hand was fully resolved via run-it-N.
  // Prevents the auto-resolve-showdown effect from firing before room?.result
  // arrives from Firestore (race condition: isProcessing=false but Firestore
  // snapshot not yet delivered → resolveShowdown() would overwrite run result).
  const runItNResolvedHandRef = useRef<number>(-1);
  const resolvingShowdownHandRef = useRef<number>(-1);
  const resolvedShowdownHandRef = useRef<number>(-1);
  const autoStartedAfterResultHandRef = useRef<number>(-1);
  // Last pendingAction consumed. The pending-action effect re-runs with the
  // same (stale) room.pendingAction after setGameState, before the clearing
  // write lands; without this guard a BB check preflop was re-applied as a
  // flop check.
  const lastPendingKeyRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const dealingRef = useRef(false);
  // Latest lobby for the async run-it driver (its closure is from the start).
  const lobbyRef = useRef<{ byId: LobbyById; ready: boolean }>({ byId: {}, ready: false });

  const isAdmin = !!(uid && room?.adminUid === uid);
  const lobbyById = useMemo(() => indexLobby(lobby), [lobby]);
  const freeStack = (room?.economy ?? "coins") === "casual";
  const roomConfig: RoomConfig = room?.config ?? DEFAULT_CONFIG;
  const turnTime = roomConfig.turnTime;
  const isTorneo = room?.mode === "torneo";
  const tournament = room?.tournament ?? null;
  // Torneo: blinds/ante follow the current level of the structure.
  const handConfig = useMemo(
    () =>
      isTorneo ? configForHand({ ...roomConfig, mode: "torneo" }, tournament) : roomConfig,
    [isTorneo, tournament, roomConfig],
  );
  const pendingRebuys = room?.pendingRebuys;
  // Boolean on purpose: room.result is a fresh object on every room snapshot
  // and would needlessly restart the timers that depend on it.
  const hasResult = !!room?.result;

  const dismissRuns = useCallback(() => setRuns(null), []);

  // A hand is settled once its pot has been paid (or it never started).
  const isSettled = useCallback(
    (gs: NormalGameState) =>
      gs.phase === "between-hands" ||
      gs.phase === "lobby" ||
      (gs.phase === "showdown" &&
        (hasResult || resolvedShowdownHandRef.current === gs.betting.handNum)),
    [hasResult],
  );

  // Seats that would be dealt into the next hand (dry run of startNewHand).
  const dealablePreview = useMemo(() => {
    if (!lobbyReady) return 0;
    const plan = nextHandSeats({
      prevSeats: gameState?.seats ?? null,
      prevDealerIdx: -1,
      lobby,
      config: handConfig,
      pendingRebuys: pendingRebuys ?? {},
      freeStack,
    });
    return countDealable(plan.seats);
  }, [gameState?.seats, lobby, lobbyReady, handConfig, pendingRebuys, freeStack]);

  // Render-time view of "settled" (no refs): the room result is written in the
  // same batch as the settled state.
  const settledForUi =
    !gameState ||
    gameState.phase === "between-hands" ||
    gameState.phase === "lobby" ||
    (gameState.phase === "showdown" && hasResult);
  const canStartHand = isAdmin && lobbyReady && dealablePreview >= 2 && settledForUi;

  const hasRoomState = !!room?.state;
  const startNewHand = useCallback(async (): Promise<boolean> => {
    if (!code || !isAdminRef.current || !lobbyReady || dealingRef.current) return false;
    // After a reload the stored table must be restored first (hand numbering,
    // button, stacks), never rebuilt from lobby chips.
    if (!gameState && hasRoomState && !hydratedRef.current) return false;
    // Never deal over a hand whose pot has not been paid yet.
    if (gameState && !isSettled(gameState)) return false;
    dealingRef.current = true;
    // A hand dealt by this tab never needs hydrating: the deal write echoes
    // back as room.state before this tab's own gameState is set.
    hydratedRef.current = true;
    try {
      setRuns(null);
      const ownersMap: Record<string, string | null> = {};
      const pubKeyByOwner: Record<string, string | undefined> = {};
      for (const p of lobby) {
        ownersMap[p.uid] = p.uid;
        pubKeyByOwner[p.uid] = p.pubKey;
      }

      // Membership comes from the lobby: departed players are dropped, a
      // re-approved player gets a fresh seat from the NEW entry, newcomers
      // keep their preferred slot, sit-out is honoured and approved rebuys are
      // credited.
      const plan = nextHandSeats({
        prevSeats: gameState?.seats ?? null,
        prevDealerIdx: dealerIdxRef.current,
        lobby,
        config: handConfig,
        pendingRebuys: pendingRebuys ?? {},
        freeStack,
      });
      if (plan.overflow.length > 0) {
        console.warn(
          `[mesa] ${plan.overflow.length} jugador(es) sin asiento: la mesa admite ${plan.seats.length}`,
        );
      }
      if (countDealable(plan.seats) < 2) return false;

      const handNum = handNumRef.current + 1;
      const newState = startHand(plan.seats, handConfig, handNum, plan.dealerIdx);

      // Deal hole cards from the new deck
      const newHoleCards: Record<string, [Card, Card]> = {};
      const deck = newState.deck.slice();
      for (const seat of newState.seats) {
        if (seat.status === "active" || seat.status === "all-in") {
          newHoleCards[seat.id] = [deck.shift()!, deck.shift()!];
        }
      }
      const finalState: NormalGameState = { ...newState, deck };

      // lobby chips = the stack each player starts this hand with. Every
      // applied rebuy gets a lobby write so the whole batch (and with it the
      // rebuy consumption) fails if that player cashed out in the meantime.
      const lobbyChips = lobbyChipsUpdates(finalState.seats, lobbyById, stackOf);
      for (const id of Object.keys(plan.appliedRebuys)) {
        const s = finalState.seats.find((x) => x.id === id);
        if (s) lobbyChips[id] = stackOf(s);
      }

      await writeNormalDealt(code, finalState, newHoleCards, ownersMap, pubKeyByOwner, {
        roomPatch: consumePendingRebuysPatch(plan.appliedRebuys),
        lobbyChips,
      });

      handNumRef.current = handNum;
      dealerIdxRef.current = finalState.betting.dealerIdx;
      dealtHolesRef.current = newHoleCards;
      setGameState(finalState);
      return true;
    } catch {
      // Typically a lobby doc vanished between the snapshot and the write (a
      // player cashed out). Nothing was written; the next attempt re-plans.
      return false;
    } finally {
      dealingRef.current = false;
    }
  }, [code, gameState, hasRoomState, isSettled, lobby, lobbyById, lobbyReady, handConfig, pendingRebuys, freeStack]);

  // Tournament knockouts produced by a settle, as a room patch.
  const knockoutPatch = useCallback(
    (
      seatsBefore: NormalGameState["seats"],
      chipsAfter: Record<string, number>,
      departed: ReadonlySet<string>,
    ): Record<string, unknown> => {
      if (!isTorneo || !tournament) return {};
      const busted = knockoutsFromHand(seatsBefore, chipsAfter, departed);
      if (busted.length === 0) return {};
      const next = busted.reduce(recordKnockout, tournament);
      if (next.knockouts.length === tournament.knockouts.length) return {};
      return { "tournament.knockouts": next.knockouts };
    },
    [isTorneo, tournament],
  );

  const resolveShowdown = useCallback(async () => {
    if (!gameState || !code) return;
    const handNum = gameState.betting.handNum;
    if (
      resolvingShowdownHandRef.current === handNum ||
      resolvedShowdownHandRef.current === handNum ||
      runItNResolvedHandRef.current === handNum
    ) {
      return;
    }
    resolvingShowdownHandRef.current = handNum;

    // Players whose lobby entry is gone forfeit what they committed.
    const lobbyNow = lobbyRef.current;
    const gs = lobbyNow.ready ? detachSeats(gameState, lobbyNow.byId, true).state : gameState;
    const byId = lobbyNow.ready ? lobbyNow.byId : lobbyById;
    const departed = new Set(gs.seats.filter((s) => isDetached(s, byId)).map((s) => s.id));

    const live = gs.seats.filter(isInHand);
    const allHoles = { ...dealtHolesRef.current, ...holeCards };
    const contested = live.length > 1;

    let result: ReturnType<typeof showdown>;
    try {
      result = showdown(
        live
          .filter((s) => allHoles[s.id])
          .map((s) => ({ player: { id: s.id }, hole: allHoles[s.id], folded: false })),
        gs.community,
      );
    } catch {
      // A contested board short of 5 cards is resolved by the run-it path.
      resolvingShowdownHandRef.current = -1;
      return;
    }
    if (!result && live.length > 0) {
      resolvingShowdownHandRef.current = -1;
      return;
    }

    // Every pot is paid to the best hand among ITS eligible seats (a pot the
    // overall best hand is not in no longer vanishes; uncalled chips go back).
    const settlement = settleShowdown(gs.seats, result?.scores ?? {}, gs.betting.dealerIdx);
    const newSeats = settleSeats(gs.seats, settlement.payouts, byId, contested);
    const newChips: Record<string, number> = {};
    for (const s of newSeats) newChips[s.id] = s.chips;

    const winners = settlement.winners.length > 0 ? settlement.winners : (result?.winners ?? []);
    let category: Category = 0;
    if (contested && result) {
      for (const id of winners) {
        const score = result.scores[id];
        if (score) {
          const c = categoryFor(score);
          if (c > category) category = c;
        }
      }
    }

    const newState: NormalGameState = {
      ...gs,
      seats: newSeats,
      phase: "showdown",
      allInNegotiation: undefined,
      // Pot a 0 al repartirlo: si este settle se re-ejecuta (write fallido,
      // efecto re-disparado) la redistribución suma 0 en vez de duplicar fichas.
      betting: { ...gs.betting, pot: 0, sidePots: [], toActId: null },
    };

    const revealedHoles: Record<string, [Card, Card]> = {};
    if (contested) {
      for (const s of live) {
        const cards = allHoles[s.id];
        if (cards) revealedHoles[s.id] = cards;
      }
    }

    try {
      await commitNormalSettle(
        code,
        {
          state: toPublicState(newState),
          result: {
            scores: result?.scores ?? {},
            winners,
            category,
            chips: newChips,
          },
          revealedHoles,
          runResults: null,
          ...knockoutPatch(gs.seats, newChips, departed),
        },
        lobbyChipsUpdates(newSeats, byId),
      );
      resolvedShowdownHandRef.current = handNum;
    } catch {
      resolvingShowdownHandRef.current = -1;
      return;
    }
    setGameState(newState);

    // Record hand for history
    const winnerInfo = winners.map((id) => {
      const won = settlement.awards
        .filter((a) => !a.refund)
        .reduce((sum, a) => sum + (a.payouts[id] ?? 0), 0);
      return {
        id,
        name: newSeats.find((s) => s.id === id)?.name ?? id,
        amount: won,
      };
    });
    const participated = gameState.seats.filter((s) =>
      s.status === "active" || s.status === "all-in" || s.status === "folded",
    );
    writeHandRecord(code, {
      handNum: gameState.betting.handNum,
      winners: winnerInfo,
      category,
      pot: gameState.betting.pot,
      community: gameState.community.map((c) => c.id),
      dealtIds: participated.map((s) => s.id),
      showdownIds: Object.keys(revealedHoles),
    }).catch(() => {});
  }, [gameState, code, holeCards, lobbyById, knockoutPatch]);

  const adjustPlayerChips = useCallback(
    (playerId: string, delta: number) => {
      if (!code) return;
      setGameState((prev) => {
        if (!prev) return prev;
        const seats = prev.seats.map((s) => {
          if (s.id !== playerId || isDetached(s, lobbyById)) return s;
          const chips = Math.max(0, s.chips + delta);
          // Darle fichas a un jugador eliminado lo revive: entra a la
          // siguiente mano como "waiting" (clave para recompras en casual).
          const status = s.status === "out" && chips > 0 ? ("waiting" as const) : s.status;
          return { ...s, chips, status };
        });
        const next = { ...prev, seats };
        patchNormalRoom(code, { state: toPublicState(next) }).catch(() => {});
        syncLobbyChips(
          code,
          lobbyChipsUpdates(next.seats.filter((s) => s.id === playerId), lobbyById, stackOf),
        ).catch(() => {});
        return next;
      });
    },
    [code, lobbyById],
  );

  const setAllChips = useCallback(
    (amount: number) => {
      if (!code) return;
      const seatedIds = new Set(gameState?.seats.map((s) => s.id) ?? []);
      // Update game seats when a hand is active
      setGameState((prev) => {
        if (!prev) return prev;
        const seats = prev.seats.map((s) => {
          if (s.status === "sitting-out" || isDetached(s, lobbyById)) return s;
          // "Igualar stack" tambien revive a los eliminados (out -> waiting):
          // en casual el host resetea la mesa completa con un solo boton.
          if (s.status === "out") {
            return amount > 0 ? { ...s, chips: amount, status: "waiting" as const } : s;
          }
          return { ...s, chips: amount };
        });
        const next = { ...prev, seats };
        patchNormalRoom(code, { state: toPublicState(next) }).catch(() => {});
        syncLobbyChips(code, lobbyChipsUpdates(next.seats, lobbyById, stackOf)).catch(() => {});
        return next;
      });
      // Players without a seat yet (pre-game or waiting for the next hand):
      // lobby chips are their stack (fixes BUG-004: no game state yet).
      const unseated: Record<string, number> = {};
      for (const p of lobby) {
        if (!seatedIds.has(p.uid) && p.chips !== amount) unseated[p.uid] = amount;
      }
      syncLobbyChips(code, unseated).catch(() => {});
    },
    [code, gameState?.seats, lobby, lobbyById],
  );

  // Expulsar. En salas con monedas el servidor liquida al jugador (le paga su
  // stack y borra su entrada del lobby, host-cash-out); en casual basta con
  // borrar la entrada. Luego el asiento se retira: fold si la mano esta viva,
  // "out" si no. Lanza si el servidor rechaza la liquidacion.
  const kickPlayer = useCallback(
    async (playerId: string) => {
      if (!code) return;
      if (freeStack) {
        await kickFromLobby(code, playerId);
      } else {
        const token = getToken ? await getToken() : null;
        if (!token) throw new Error("Sesion no disponible");
        await callEconomy(token, "host-cash-out", { code, uid: playerId });
      }
      setGameState((prev) => {
        if (!prev) return prev;
        const byId = { ...lobbyById };
        delete byId[playerId];
        const { state, detached } = detachSeats(prev, byId, !isSettled(prev));
        return detached.length > 0 ? withTurnDeadline(state, turnTime) : prev;
      });
    },
    [code, freeStack, getToken, lobbyById, isSettled, turnTime],
  );

  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  useEffect(() => {
    lobbyRef.current = { byId: lobbyById, ready: lobbyReady };
  }, [lobbyById, lobbyReady]);

  // Non-admin viewers just mirror the public state.
  useEffect(() => {
    if (!room?.state || !uid || !room.adminUid || room.adminUid === uid) return;
    const { deckCount: _dc, ...rest } = room.state;
    void _dc;
    setGameState({ ...rest, deck: [] } as NormalGameState);
  }, [room?.state, room?.adminUid, uid]);

  // Admin reload: the room has a state but this tab has none. The deck and the
  // hole cards are not public (deckCount only), so an unfinished hand cannot be
  // continued: it is voided (every seat gets its committed chips back) and the
  // table goes between hands. Hand numbering and the button continue.
  useEffect(() => {
    if (!isAdmin || !code || !room?.state || gameState || hydratedRef.current) return;
    if (!lobbyReady || dealingRef.current) return;
    hydratedRef.current = true;
    const { deckCount: _dc, ...rest } = room.state;
    void _dc;
    const pub = { ...rest, deck: [] } as NormalGameState;
    handNumRef.current = Math.max(handNumRef.current, pub.betting.handNum);
    dealerIdxRef.current = pub.betting.dealerIdx;

    const settled =
      pub.phase === "between-hands" ||
      pub.phase === "lobby" ||
      (pub.phase === "showdown" && !!room.result);
    if (settled) {
      resolvedShowdownHandRef.current = pub.betting.handNum;
      setGameState(pub);
      return;
    }

    const voided = voidHand(pub);
    const next: NormalGameState = {
      ...voided,
      seats: settleSeats(voided.seats, {}, lobbyById, false),
    };
    resolvedShowdownHandRef.current = pub.betting.handNum;
    setGameState(next);
    commitNormalSettle(
      code,
      {
        state: toPublicState(next),
        result: null,
        revealedHoles: null,
        runResults: null,
        pendingAction: null,
      },
      lobbyChipsUpdates(next.seats, lobbyById),
    ).catch(() => {});
  }, [isAdmin, code, room?.state, room?.result, gameState, lobbyReady, lobbyById]);

  // Admin: a seat whose lobby entry disappeared (cash-out, kick) stops being
  // dealt in. In a live hand it is folded (all-in included: it forfeits);
  // between hands it goes "out" with 0 chips and is dropped at the next deal.
  useEffect(() => {
    if (!isAdmin || !code || !lobbyReady || !gameState) return;
    const handNum = gameState.betting.handNum;
    // A run-it or settle in flight re-reads the lobby itself before paying.
    if (isProcessing && allInRanHandRef.current === handNum) return;
    if (
      resolvingShowdownHandRef.current === handNum &&
      resolvedShowdownHandRef.current !== handNum
    ) {
      return;
    }
    const { state, detached } = detachSeats(gameState, lobbyById, !isSettled(gameState));
    if (detached.length === 0) return;
    setGameState(withTurnDeadline(state, turnTime));
  }, [isAdmin, code, lobbyReady, lobbyById, gameState, isProcessing, isSettled, turnTime]);

  const remoteRunVotes = room?.state?.allInNegotiation?.votes;
  const remoteRunVotesKey = remoteRunVotes ? JSON.stringify(remoteRunVotes) : "";

  // The admin owns the local deck, but players write run-it-N votes directly to
  // Firestore. Merge only the vote map back into the admin state.
  useEffect(() => {
    if (!isAdminRef.current || !remoteRunVotes || !room?.state?.allInNegotiation) return;
    setGameState((prev) => {
      if (!prev?.allInNegotiation) return prev;
      if (prev.betting.handNum !== room.state?.betting.handNum) return prev;
      const eligible = new Set(prev.allInNegotiation.playerIds);
      const mergedVotes = { ...prev.allInNegotiation.votes };
      for (const [playerId, vote] of Object.entries(remoteRunVotes)) {
        if (eligible.has(playerId)) mergedVotes[playerId] = vote;
      }
      const changed =
        Object.keys(mergedVotes).length !== Object.keys(prev.allInNegotiation.votes).length ||
        Object.entries(mergedVotes).some(
          ([playerId, vote]) => prev.allInNegotiation?.votes[playerId] !== vote,
        );
      if (!changed) return prev;
      return {
        ...prev,
        allInNegotiation: {
          ...prev.allInNegotiation,
          votes: mergedVotes,
        },
      };
    });
  }, [remoteRunVotes, remoteRunVotesKey, room?.state?.allInNegotiation, room?.state?.betting.handNum]);

  // Admin: process pending actions from players
  useEffect(() => {
    if (!isAdmin || !code || !room?.pendingAction || !gameState) return;
    const pa: PendingAction = room.pendingAction;
    const key = `${pa.seatId}:${pa.action}:${pa.amount ?? ""}:${pa.ts}`;
    if (lastPendingKeyRef.current === key) return;
    lastPendingKeyRef.current = key;

    if (Date.now() - pa.ts > 30_000) {
      patchNormalRoom(code, { pendingAction: null }).catch(() => {});
      return;
    }

    if (pa.action === "vote-run") {
      setTimeout(() => {
        setGameState((prev) => {
          if (!prev || prev.phase !== "all-in-negotiation" || !prev.allInNegotiation) return prev;
          if (!prev.allInNegotiation.playerIds.includes(pa.seatId)) return prev;
          const next = {
            ...prev,
            allInNegotiation: {
              ...prev.allInNegotiation,
              votes: {
                ...prev.allInNegotiation.votes,
                [pa.seatId]: pa.amount ?? 1,
              }
            }
          };
          patchNormalRoom(code, { state: toPublicState(next), pendingAction: null }).catch(() => {});
          return next;
        });
      }, 0);
      return;
    }

    if (pa.action === "show-card") {
      setTimeout(() => {
        const pId = pa.seatId;
        const myHoles = dealtHolesRef.current[pId];
        if (myHoles) {
          const newRevealed = { ...(room?.revealedHoles ?? {}) };
          const existing = newRevealed[pId] ? [...newRevealed[pId]] : [null, null];
          if (pa.amount === 0) existing[0] = myHoles[0];
          if (pa.amount === 1) existing[1] = myHoles[1];
          if (pa.amount === 2) { existing[0] = myHoles[0]; existing[1] = myHoles[1]; }
          newRevealed[pId] = existing as [Card, Card];
          patchNormalRoom(code, { revealedHoles: newRevealed, pendingAction: null }).catch(() => {});
        } else {
          patchNormalRoom(code, { pendingAction: null }).catch(() => {});
        }
      }, 0);
      return;
    }

    // Authorization: only the player whose turn it is can act for betting actions
    if (!isBettingPhase(gameState.phase) || pa.seatId !== gameState.betting.toActId) {
      patchNormalRoom(code, { pendingAction: null }).catch(() => {});
      return;
    }
    const actorSeat = gameState.seats.find((s) => s.id === pa.seatId);
    if (!actorSeat || actorSeat.status !== "active") {
      patchNormalRoom(code, { pendingAction: null }).catch(() => {});
      return;
    }

    setTimeout(() => {
      setIsProcessing(true);
      const acted = handleAction(gameState, pa.seatId, pa.action, pa.amount ?? 0);
      // Start the clock of whoever acts next.
      const newState = withTurnDeadline(acted, turnTime);
      setGameState(newState);
      patchNormalRoom(code, {
        state: toPublicState(newState),
        pendingAction: null,
      })
        .catch(() => {})
        .finally(() => setIsProcessing(false));
    }, 0);
  }, [isAdmin, room?.pendingAction, code, gameState, turnTime, room?.revealedHoles]);

  // Admin: auto-resolve when phase reaches showdown.
  // Guard: skip if this hand was resolved via run-it-N — Firestore snapshot with
  // the result may not have arrived yet, so room?.result is momentarily null even
  // though the result was already written.  Without this guard, resolveShowdown()
  // fires and overwrites the run-it-N result (race condition).
  useEffect(() => {
    if (!isAdmin || !gameState || !code || isProcessing) return;
    if (gameState.phase !== "showdown") return;
    if (hasResult) return;
    if (runItNResolvedHandRef.current === gameState.betting.handNum) return;
    if (resolvedShowdownHandRef.current === gameState.betting.handNum) return;
    const t = setTimeout(() => {
      void resolveShowdown();
    }, 1500);
    return () => clearTimeout(t);
  }, [isAdmin, gameState, code, isProcessing, hasResult, resolveShowdown]);

  // Admin: auto-deal next hand after showing the result for 5 s.
  // Counts the players that would really be dealt in: approved rebuys and
  // approved newcomers included (a heads-up bust + approved rebuy used to stop
  // the table for good), departed and sitting-out players excluded.
  const tournamentPaused = !!(isTorneo && tournament?.paused);
  const startNewHandRef = useRef(startNewHand);
  useEffect(() => {
    startNewHandRef.current = startNewHand;
  }, [startNewHand]);
  useEffect(() => {
    if (!isAdmin || !code || !lobbyReady) return;
    if (!hasResult) return;
    if (isProcessing || tournamentPaused) return;
    const handNum = room?.state?.betting.handNum;
    if (!handNum || autoStartedAfterResultHandRef.current === handNum) return;
    if (dealablePreview < 2) return;
    const t = setTimeout(() => {
      if (autoStartedAfterResultHandRef.current === handNum) return;
      autoStartedAfterResultHandRef.current = handNum;
      void startNewHandRef.current().then((ok) => {
        if (!ok) autoStartedAfterResultHandRef.current = -1;
      });
    }, 5000);
    return () => clearTimeout(t);
  }, [isAdmin, hasResult, room?.state?.betting.handNum, code, lobbyReady, isProcessing, tournamentPaused, dealablePreview]);

  // Admin: negotiate and execute run-it-N when all remaining players are all-in
  // or no player has further betting action.
  useEffect(() => {
    if (!isAdmin || !gameState || !code) return;
    if (gameState.phase === "showdown" || gameState.phase === "between-hands") return;

    // Sitting-out / waiting seats were never dealt in: they are not opponents.
    const unfolded = gameState.seats.filter(isInHand);
    if (unfolded.length <= 1) return;
    if (gameState.betting.toActId !== null) return;

    if (gameState.street === "river") {
      if (!isProcessing) void resolveShowdown();
      return;
    }

    const thisHand = gameState.betting.handNum;
    const allHoles = { ...dealtHolesRef.current, ...holeCards };

    if (gameState.phase !== "all-in-negotiation" || !gameState.allInNegotiation) {
      if (allInTriggeredHandRef.current === thisHand) return;
      allInTriggeredHandRef.current = thisHand;
      const runState = withRunoutDeck(gameState, allHoles, 1);
      const next: NormalGameState = {
        ...runState,
        phase: "all-in-negotiation",
        allInNegotiation: {
          playerIds: unfolded.map((s) => s.id),
          votes: {},
          options: runOptionsForState(runState),
          createdAt: Date.now(),
          equity: estimateAllInEquity(runState, unfolded.map((s) => s.id), allHoles),
        },
      };
      setGameState(next);
      patchNormalRoom(code, { state: toPublicState(next) }).catch(() => {
        allInTriggeredHandRef.current = -1;
      });
      return;
    }

    const neg = gameState.allInNegotiation;
    const maxRuns = maxRunCountForState(withRunoutDeck(gameState, allHoles, 1));
    const allVoted = neg.playerIds.every((id) => typeof neg.votes[id] === "number");
    const createdAt = neg.createdAt ?? Date.now();
    const elapsed = Date.now() - createdAt;
    if (!allVoted && elapsed < ALL_IN_VOTE_TIMEOUT_MS) {
      const t = setTimeout(
        () => setNegotiationTick(Date.now()),
        Math.max(250, ALL_IN_VOTE_TIMEOUT_MS - elapsed),
      );
      return () => clearTimeout(t);
    }

    if (allInRanHandRef.current === thisHand) return;
    allInRanHandRef.current = thisHand;

    setTimeout(() => {
      setIsProcessing(true);
      (async () => {
        try {
          const runCount = chooseRunCount(neg.votes, neg.playerIds, maxRuns);
          const revealedHoles: Record<string, [Card, Card]> = {};
          for (const u of unfolded) {
            const cards = allHoles[u.id];
            if (cards) revealedHoles[u.id] = cards;
          }

          const revealedSeats = gameState.seats.map((seat) => ({
            ...seat,
            revealed: isInHand(seat),
          }));
          let s = withRunoutDeck(
            {
              ...gameState,
              seats: revealedSeats,
              allInNegotiation: { ...neg, agreedN: runCount },
            },
            allHoles,
            runCount,
          );

          setGameState(s);
          await patchNormalRoom(code, {
            state: toPublicState(s),
            revealedHoles,
          });

          await sleep(1100);

          // Players who left while the run was being set up forfeit.
          const lobbyNow = lobbyRef.current;
          if (lobbyNow.ready) s = detachSeats(s, lobbyNow.byId, true).state;
          const byId = lobbyNow.ready ? lobbyNow.byId : lobbyById;
          const departed = new Set(s.seats.filter((x) => isDetached(x, byId)).map((x) => x.id));
          const seatsAtResolution = s.seats;

          const resolution = resolveRunItN(s, allHoles, runCount);

          for (let idx = 0; idx < resolution.runs.length; idx++) {
            const run = resolution.runs[idx];
            for (const step of run.steps) {
              await sleep(step.street === "flop" ? 1100 : 1250);
              s = {
                ...s,
                community: step.community,
                street: step.street,
                phase: step.street,
              };
              setGameState(s);
              await patchNormalRoom(code, { state: toPublicState(s) });
            }
            await sleep(900);
          }

          const finalSeats = settleSeats(seatsAtResolution, resolution.winningsByPlayer, byId, true);
          const newChips: Record<string, number> = {};
          for (const seat of finalSeats) newChips[seat.id] = seat.chips;

          const winnerInfo = Object.entries(resolution.winningsByPlayer)
            .filter(([id, amount]) => amount > 0 && resolution.winners.includes(id))
            .map(([id, amount]) => ({
              id,
              name: finalSeats.find((seat) => seat.id === id)?.name ?? id,
              amount,
            }));

          const finalState: NormalGameState = {
            ...s,
            deck: resolution.finalDeck,
            burns: resolution.finalBurns,
            seats: finalSeats,
            phase: "showdown",
            allInNegotiation: undefined,
            // Pot repartido: a 0 para que un settle repetido no duplique fichas.
            betting: { ...s.betting, pot: 0, sidePots: [], toActId: null },
          };

          await commitNormalSettle(
            code,
            {
              state: toPublicState(finalState),
              result: {
                scores: {},
                winners: resolution.winners,
                category: resolution.category,
                chips: newChips,
              },
              runResults: resolution.runs,
              ...knockoutPatch(seatsAtResolution, newChips, departed),
            },
            lobbyChipsUpdates(finalSeats, byId),
          );
          runItNResolvedHandRef.current = thisHand;
          resolvedShowdownHandRef.current = thisHand;
          setGameState(finalState);
          setRuns(resolution.runs);

          const runParticipated = gameState.seats.filter((x) =>
            x.status === "active" || x.status === "all-in" || x.status === "folded",
          );
          const runUnfolded = seatsAtResolution.filter(isInHand).map((x) => x.id);
          writeHandRecord(code, {
            handNum: gameState.betting.handNum,
            winners: winnerInfo,
            category: resolution.category,
            pot: gameState.betting.pot,
            community: resolution.runs.map((run) => run.community.map((c) => c.id).join(" ")),
            dealtIds: runParticipated.map((x) => x.id),
            showdownIds: runUnfolded.length > 1 ? runUnfolded : [],
          }).catch(() => {});
        } catch {
          allInRanHandRef.current = -1;
          runItNResolvedHandRef.current = -1;
          resolvedShowdownHandRef.current = -1;
        } finally {
          setIsProcessing(false);
        }
      })();
    }, 0);
  }, [isAdmin, gameState, code, isProcessing, resolveShowdown, holeCards, negotiationTick, lobbyById, knockoutPatch]);

  // Admin: Auto-resolve when only one player remains.
  useEffect(() => {
    if (!isAdmin || !gameState || !code) return;
    if (gameState.phase === "showdown" || gameState.phase === "between-hands") return;

    const unfolded = gameState.seats.filter(isInHand);

    if (unfolded.length <= 1) {
      // Single remaining player: resolve once any in-flight action settles.
      if (!isProcessing) void resolveShowdown();
      return;
    }
  }, [isAdmin, gameState, code, isProcessing, resolveShowdown]);

  // Admin: auto-fold on turn timer expiry.
  // Respects each player's useTimeBank preference (lobby field). If disabled,
  // auto-fold fires when the normal turnDeadline elapses.
  useEffect(() => {
    if (!isAdmin || !gameState || !code) return;
    if (!isBettingPhase(gameState.phase)) return;
    const toActId = gameState.betting.toActId;
    if (!toActId) return;
    const seat = gameState.seats.find((s) => s.id === toActId);
    if (!seat?.turnDeadline || seat.status !== "active") return;

    const playerLobby = lobby.find((p) => p.uid === toActId);
    const useBank = playerLobby?.useTimeBank !== false; // default true
    const bankExtra = useBank ? seat.timeBank : 0;
    const delay = Math.max(0, seat.turnDeadline - Date.now() + bankExtra);

    const timer = setTimeout(() => {
      const folded = handleAction(gameState, toActId, "fold");
      if (folded === gameState) return;
      // The next actor gets its clock too (it used to stall with none).
      const newState = withTurnDeadline(folded, turnTime);
      setGameState(newState);
      patchNormalRoom(code, {
        state: toPublicState(newState),
        pendingAction: null,
      }).catch(() => {});
    }, delay);

    return () => clearTimeout(timer);
  }, [isAdmin, gameState, code, lobby, turnTime]);

  // Admin: write state to Firestore when it changes
  const lastStateRef = useRef<NormalGameState | null>(null);
  useEffect(() => {
    if (!isAdmin || !code || !gameState) return;
    if (lastStateRef.current === gameState) return;
    lastStateRef.current = gameState;
    patchNormalRoom(code, { state: toPublicState(gameState) }).catch(() => {});
  }, [isAdmin, gameState, code]);

  return {
    gameState,
    startNewHand,
    resolveShowdown,
    adjustPlayerChips,
    setAllChips,
    kickPlayer,
    isProcessing,
    runs,
    dismissRuns,
    canStartHand,
  };
}
