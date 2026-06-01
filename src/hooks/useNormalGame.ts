"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NormalGameState, RoomConfig } from "@/lib/betting";
import {
  handleAction,
  startHand,
  computeSidePots,
} from "@/lib/betting";
import type { NormalRoomDoc, PendingAction, NormalLobbyPlayer } from "@/lib/normalRooms";
import {
  lobbyToSeats,
  patchNormalRoom,
  patchLobbyPlayer,
  kickFromLobby,
  writeNormalDealt,
} from "@/lib/normalRooms";
import { showdown, bestHand, compareScore, categoryFor } from "@/lib/handEval";
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

export type RunRecord = {
  community: Card[];
  winners: string[];
  category: Category;
} & Partial<RunItRun>;

const ALL_IN_VOTE_TIMEOUT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toPublicState(gs: NormalGameState) {
  const { deck, ...rest } = gs;
  return { ...rest, deckCount: deck.length };
}

function dealAllInStreet(s: NormalGameState): NormalGameState {
  const newDeck = [...s.deck];
  const newBurns = [...s.burns];
  const newCommunity = [...s.community];
  newBurns.push(newDeck.shift()!);
  let newStreet: NormalGameState["street"];
  let newPhase: NormalGameState["phase"];
  if (s.street === "preflop") {
    newCommunity.push(newDeck.shift()!, newDeck.shift()!, newDeck.shift()!);
    newStreet = "flop"; newPhase = "flop";
  } else if (s.street === "flop") {
    newCommunity.push(newDeck.shift()!);
    newStreet = "turn"; newPhase = "turn";
  } else {
    newCommunity.push(newDeck.shift()!);
    newStreet = "river"; newPhase = "river";
  }
  return { ...s, deck: newDeck, burns: newBurns, community: newCommunity, street: newStreet, phase: newPhase };
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

type UseNormalGameReturn = {
  gameState: NormalGameState | null;
  startNewHand: () => Promise<void>;
  resolveShowdown: () => Promise<void>;
  adjustPlayerChips: (uid: string, delta: number) => void;
  setAllChips: (amount: number) => void;
  kickPlayer: (uid: string) => Promise<void>;
  isProcessing: boolean;
  runs: RunRecord[] | null;
  dismissRuns: () => void;
};

export function useNormalGame(
  code: string | null,
  room: NormalRoomDoc | null,
  lobby: NormalLobbyPlayer[],
  uid: string | null,
  holeCards: Record<string, [Card, Card]>,
): UseNormalGameReturn {
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

  const dismissRuns = useCallback(() => setRuns(null), []);

  const startNewHand = useCallback(async () => {
    if (!code || !isAdminRef.current) return;
    const ownersMap: Record<string, string | null> = {};
    const pubKeyByOwner: Record<string, string | undefined> = {};
    for (const p of lobby) {
      ownersMap[p.uid] = p.uid;
      pubKeyByOwner[p.uid] = p.pubKey;
    }

    const cfgFallback: RoomConfig = {
      mode: "normal", startingStack: 1000, smallBlind: 5, bigBlind: 10,
      ante: 0, turnTime: 30000, timeBankInit: 60000,
    };
    const cfg = room?.config ?? cfgFallback;

    // Reset existing seats AND merge in any new lobby members not yet seated.
    // This fixes: players who joined mid-game weren't being seated next hand.
    let seats;
    if (gameState) {
      const existingIds = new Set(gameState.seats.map((s) => s.id));
      const existing = gameState.seats.map((s) => ({
        ...s,
        bet: 0,
        totalBet: 0,
        revealed: false,
        turnDeadline: null,
      }));
      const newcomers = lobby
        .filter((p) => !existingIds.has(p.uid))
        .map((p) => ({
          id: p.uid,
          name: p.name,
          seed: p.seed,
          ownerUid: ownersMap[p.uid] ?? null,
          chips: p.chips > 0 ? p.chips : cfg.startingStack,
          bet: 0,
          totalBet: 0,
          revealed: false,
          status: p.sittingOut ? ("sitting-out" as const) : ("active" as const),
          timeBank: cfg.timeBankInit,
          turnDeadline: null,
        }));
      seats = [...existing, ...newcomers];
    } else {
      seats = lobbyToSeats(lobby, cfg, ownersMap);
    }

    const config: RoomConfig = cfg;

    // Apply pending rebuys from approved requests
    const pendingRebuys = room?.pendingRebuys ?? {};
    const seatsWithRebuys = seats.map((s) => {
      const rebuy = pendingRebuys[s.id];
      if (rebuy && rebuy > 0) return { ...s, chips: s.chips + rebuy, status: "active" as const };
      return s;
    });
    if (Object.keys(pendingRebuys).length > 0) {
      patchNormalRoom(code, { pendingRebuys: {} }).catch(() => {});
    }

    handNumRef.current += 1;
    const newState = startHand(
      seatsWithRebuys,
      config,
      handNumRef.current,
      dealerIdxRef.current,
    );
    dealerIdxRef.current = newState.betting.dealerIdx;

    // Deal hole cards from the new deck
    const newHoleCards: Record<string, [Card, Card]> = {};
    const deck = newState.deck.slice();
    for (const seat of newState.seats) {
      if (seat.status === "active" || seat.status === "all-in") {
        newHoleCards[seat.id] = [deck.shift()!, deck.shift()!];
      }
    }
    const finalState: NormalGameState = {
      ...newState,
      deck,
    };

    dealtHolesRef.current = newHoleCards;
    setGameState(finalState);
    await writeNormalDealt(code, finalState, newHoleCards, ownersMap, pubKeyByOwner);
  }, [code, gameState, lobby, room?.config, room?.pendingRebuys]);

  const resolveShowdown = useCallback(async () => {
    if (!gameState || !code) return;

    const activeSeatIds = gameState.seats
      .filter((s) => s.status !== "folded" && s.status !== "out")
      .map((s) => s.id);

    const allHoles = { ...dealtHolesRef.current, ...holeCards };
    const handShodownSeats = activeSeatIds
      .map((id) => {
        const seat = gameState.seats.find((s) => s.id === id)!;
        const cards = allHoles[id];
        if (!cards) return null;
        return { player: { id }, hole: cards, folded: seat.status === "folded" };
      })
      .filter(Boolean) as { player: { id: string }; hole: [Card, Card]; folded: boolean }[];

    const result = showdown(handShodownSeats, gameState.community);
    if (!result) return;

    // Distribute pots
    const sidePots = computeSidePots(
      gameState.seats,
      gameState.betting.pot,
    );
    const newChips: Record<string, number> = {};
    for (const seat of gameState.seats) {
      newChips[seat.id] = seat.chips;
    }

    for (const pot of sidePots) {
      const eligibleWinners = result.winners.filter((w) =>
        pot.eligibleIds.includes(w),
      );
      if (eligibleWinners.length === 0) {
        // Fallback: give to best hand among eligible
        const bestEligible = pot.eligibleIds.find((id) =>
          result.winners.includes(id),
        );
        if (bestEligible) {
          newChips[bestEligible] = (newChips[bestEligible] ?? 0) + pot.amount;
        }
      } else {
        const share = Math.floor(pot.amount / eligibleWinners.length);
        const remainder = pot.amount - share * eligibleWinners.length;
        for (let i = 0; i < eligibleWinners.length; i++) {
          newChips[eligibleWinners[i]] =
            (newChips[eligibleWinners[i]] ?? 0) + share + (i === 0 ? remainder : 0);
        }
      }
    }

    // Reveal all non-folded seats
    const newSeats = gameState.seats.map((s) => ({
      ...s,
      chips: newChips[s.id] ?? s.chips,
      revealed: s.status !== "folded",
      bet: 0,
      totalBet: 0,
      status: (newChips[s.id] ?? s.chips) === 0 ? ("out" as const) : ("waiting" as const),
    }));

    const newState: NormalGameState = {
      ...gameState,
      seats: newSeats,
      phase: "showdown",
    };
    setGameState(newState);

    const revealedHoles: Record<string, [Card, Card]> = {};
    if (activeSeatIds.length > 1) {
      for (const id of activeSeatIds) {
        const seat = gameState.seats.find((s) => s.id === id);
        if (!seat || seat.status === "folded") continue;
        const cards = allHoles[id];
        if (cards) revealedHoles[id] = cards;
      }
    }

    await patchNormalRoom(code, {
      state: toPublicState(newState),
      result: { ...result, chips: newChips },
      revealedHoles,
    });

    // Record hand for history
    const winnerInfo = result.winners.map((id) => {
      const before = gameState.seats.find((s) => s.id === id)?.chips ?? 0;
      const after = newChips[id] ?? before;
      return {
        id,
        name: newSeats.find((s) => s.id === id)?.name ?? id,
        amount: Math.max(0, after - before),
      };
    });
    writeHandRecord(code, {
      handNum: gameState.betting.handNum,
      winners: winnerInfo,
      category: result.category,
      pot: gameState.betting.pot,
      community: gameState.community.map((c) => c.id),
    }).catch(() => {});
  }, [gameState, code, holeCards]);

  const adjustPlayerChips = useCallback(
    (playerId: string, delta: number) => {
      if (!code) return;
      setGameState((prev) => {
        if (!prev) return prev;
        const seats = prev.seats.map((s) =>
          s.id === playerId
            ? { ...s, chips: Math.max(0, s.chips + delta) }
            : s,
        );
        const next = { ...prev, seats };
        patchNormalRoom(code, { state: toPublicState(next) }).catch(() => {});
        return next;
      });
    },
    [code],
  );

  const setAllChips = useCallback(
    (amount: number) => {
      if (!code) return;
      // Update game seats when a hand is active
      setGameState((prev) => {
        if (!prev) return prev;
        const seats = prev.seats.map((s) =>
          s.status !== "out" && s.status !== "sitting-out"
            ? { ...s, chips: amount }
            : s,
        );
        const next = { ...prev, seats };
        patchNormalRoom(code, { state: toPublicState(next) }).catch(() => {});
        return next;
      });
      // Always also update lobby chips so pre-game players and the lobby list
      // both reflect the change immediately (fixes BUG-004: no game state yet).
      for (const p of lobby) {
        patchLobbyPlayer(code, p.uid, { chips: amount }).catch(() => {});
      }
    },
    [code, lobby],
  );

  const kickPlayer = useCallback(
    async (playerId: string) => {
      if (!code) return;
      setGameState((prev) => {
        if (!prev) return prev;
        const seats = prev.seats.map((s) =>
          s.id === playerId ? { ...s, status: "out" as const } : s,
        );
        const next = { ...prev, seats };
        patchNormalRoom(code, { state: toPublicState(next) }).catch(() => {});
        return next;
      });
      await kickFromLobby(code, playerId).catch(() => {});
    },
    [code],
  );

  useEffect(() => {
    isAdminRef.current = !!(uid && room?.adminUid === uid);
  }, [uid, room?.adminUid]);

  // Sync state from Firestore → local (non-admin clients just read)
  useEffect(() => {
    if (!room?.state) return;
    if (isAdminRef.current) return; // admin owns local state
    const { deckCount: _dc, ...rest } = room.state;
    void _dc;
    setGameState({ ...rest, deck: [] } as NormalGameState);
  }, [room?.state]);

  const remoteRunVotes = room?.state?.allInNegotiation?.votes;
  const remoteRunVotesKey = remoteRunVotes ? JSON.stringify(remoteRunVotes) : "";

  // The admin owns the local deck, but players write run-it-N votes directly to
  // Firestore. Merge only the vote map back into the admin state.
  useEffect(() => {
    if (!isAdminRef.current || !remoteRunVotes || !room?.state?.allInNegotiation) return;
    setGameState((prev) => {
      if (!prev?.allInNegotiation) return prev;
      if (prev.betting.handNum !== room.state?.betting.handNum) return prev;
      const mergedVotes = { ...prev.allInNegotiation.votes, ...remoteRunVotes };
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
    if (!isAdminRef.current || !code || !room?.pendingAction || !gameState)
      return;
    const pa: PendingAction = room.pendingAction;
    if (Date.now() - pa.ts > 30_000) {
      patchNormalRoom(code, { pendingAction: null }).catch(() => {});
      return;
    }

    if (pa.action === "vote-run") {
      setTimeout(() => {
        setGameState((prev) => {
          if (!prev || prev.phase !== "all-in-negotiation" || !prev.allInNegotiation) return prev;
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
    if (pa.seatId !== gameState.betting.toActId) {
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
      let newState = handleAction(
        gameState,
        pa.seatId,
        pa.action,
        pa.amount ?? 0,
      );

      // Set turnDeadline on the next actor
      const nextActorId = newState.betting.toActId;
      const cfg = room?.config;
      if (nextActorId && cfg) {
        newState = {
          ...newState,
          seats: newState.seats.map((s) =>
            s.id === nextActorId
              ? { ...s, turnDeadline: Date.now() + cfg.turnTime }
              : s,
          ),
        };
      }

      setGameState(newState);
      patchNormalRoom(code, {
        state: toPublicState(newState),
        pendingAction: null,
      })
        .catch(() => {})
        .finally(() => setIsProcessing(false));
    }, 0);
  }, [room?.pendingAction, code, gameState, room?.config, room?.revealedHoles]);

  // Admin: auto-resolve when phase reaches showdown.
  // Guard: skip if this hand was resolved via run-it-N — Firestore snapshot with
  // the result may not have arrived yet, so room?.result is momentarily null even
  // though the result was already written.  Without this guard, resolveShowdown()
  // fires and overwrites the run-it-N result (race condition).
  useEffect(() => {
    if (!isAdminRef.current || !gameState || !code || isProcessing) return;
    if (gameState.phase !== "showdown") return;
    if (room?.result) return;
    if (runItNResolvedHandRef.current === gameState.betting.handNum) return;
    const t = setTimeout(() => {
      void resolveShowdown();
    }, 1500);
    return () => clearTimeout(t);
  }, [gameState, code, isProcessing, room?.result, resolveShowdown]);

  // Admin: auto-deal next hand after showing the result for 5 s.
  // Skips if fewer than 2 players remain (tournament over) or if already processing.
  useEffect(() => {
    if (!isAdminRef.current || !code) return;
    if (!room?.result) return;
    if (isProcessing) return;
    const remainingPlayers = (room.state?.seats ?? []).filter(
      (s) => s.status !== "out" && s.chips > 0,
    ).length;
    if (remainingPlayers < 2) return;
    const t = setTimeout(() => {
      void startNewHand();
    }, 5000);
    return () => clearTimeout(t);
  }, [room?.result, room?.state?.seats, code, isProcessing, startNewHand]);

  // Admin: negotiate and execute run-it-N when all remaining players are all-in
  // or no player has further betting action.
  useEffect(() => {
    if (!isAdminRef.current || !gameState || !code) return;
    if (gameState.phase === "showdown" || gameState.phase === "between-hands") return;

    const unfolded = gameState.seats.filter((s) => s.status !== "folded" && s.status !== "out");
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
            revealed: seat.status !== "folded" && seat.status !== "out",
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

          await sleep(800);

          const resolution = resolveRunItN(s, allHoles, runCount);
          setRuns(resolution.runs);

          for (let idx = 0; idx < resolution.runs.length; idx++) {
            const run = resolution.runs[idx];
            for (const step of run.steps) {
              await sleep(idx === 0 && step.street === "flop" ? 900 : 650);
              s = {
                ...s,
                community: step.community,
                street: step.street,
                phase: step.street,
              };
              setGameState(s);
              await patchNormalRoom(code, { state: toPublicState(s) });
            }
            await sleep(500);
          }

          const newChips: Record<string, number> = {};
          for (const seat of gameState.seats) {
            newChips[seat.id] = seat.chips + (resolution.winningsByPlayer[seat.id] ?? 0);
          }

          const finalSeats = gameState.seats.map((seat) => ({
            ...seat,
            chips: newChips[seat.id] ?? seat.chips,
            revealed: seat.status !== "folded",
            bet: 0,
            totalBet: 0,
            status: (newChips[seat.id] ?? seat.chips) === 0 ? ("out" as const) : ("waiting" as const),
          }));

          const winnerInfo = Object.entries(resolution.winningsByPlayer)
            .filter(([, amount]) => amount > 0)
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
          };
          setGameState(finalState);

          await patchNormalRoom(code, {
            state: toPublicState(finalState),
            result: {
              scores: {},
              winners: resolution.winners,
              category: resolution.category,
              chips: newChips,
            },
            runResults: resolution.runs,
          });

          // Mark this hand as resolved via run-it-N BEFORE releasing isProcessing.
          // This prevents the auto-resolve-showdown effect from racing in while
          // the Firestore snapshot with room?.result hasn't arrived yet.
          runItNResolvedHandRef.current = thisHand;

          writeHandRecord(code, {
            handNum: gameState.betting.handNum,
            winners: winnerInfo,
            category: resolution.category,
            pot: gameState.betting.pot,
            community: resolution.runs.map((run) => run.community.map((c) => c.id).join(" ")),
          }).catch(() => {});
        } catch {
          allInRanHandRef.current = -1;
          runItNResolvedHandRef.current = -1;
        } finally {
          setIsProcessing(false);
        }
      })();
    }, 0);
  }, [gameState, code, isProcessing, resolveShowdown, holeCards, negotiationTick]);

  // Admin: Auto-resolve when only one player remains.
  useEffect(() => {
    if (!isAdminRef.current || !gameState || !code) return;
    if (gameState.phase === "showdown" || gameState.phase === "between-hands") return;

    const unfolded = gameState.seats.filter(s => s.status !== "folded" && s.status !== "out");

    if (unfolded.length <= 1) {
      // Single remaining player: resolve once any in-flight action settles.
      if (!isProcessing) void resolveShowdown();
      return;
    }
  }, [gameState, code, isProcessing, resolveShowdown, holeCards]);

  // Admin: auto-fold on turn timer expiry.
  // Respects each player's useTimeBank preference (lobby field). If disabled,
  // auto-fold fires when the normal turnDeadline elapses.
  useEffect(() => {
    if (!isAdminRef.current || !gameState || !code) return;
    const toActId = gameState.betting.toActId;
    if (!toActId) return;
    const seat = gameState.seats.find((s) => s.id === toActId);
    if (!seat?.turnDeadline) return;

    const playerLobby = lobby.find((p) => p.uid === toActId);
    const useBank = playerLobby?.useTimeBank !== false; // default true
    const bankExtra = useBank ? seat.timeBank : 0;
    const delay = seat.turnDeadline - Date.now() + bankExtra;
    if (delay <= 0) {
      // Fire immediately on next tick
      const timer = setTimeout(() => {
        const newState = handleAction(gameState, toActId, "fold");
        setGameState(newState);
        patchNormalRoom(code, {
          state: toPublicState(newState),
          pendingAction: null,
        }).catch(() => {});
      }, 0);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      const newState = handleAction(gameState, toActId, "fold");
      setGameState(newState);
      patchNormalRoom(code, {
        state: toPublicState(newState),
        pendingAction: null,
      }).catch(() => {});
    }, delay);

    return () => clearTimeout(timer);
  }, [gameState, code, lobby]);

  // Admin: write state to Firestore when it changes
  const lastStateRef = useRef<NormalGameState | null>(null);
  useEffect(() => {
    if (!isAdminRef.current || !code || !gameState) return;
    if (lastStateRef.current === gameState) return;
    lastStateRef.current = gameState;
    patchNormalRoom(code, { state: toPublicState(gameState) }).catch(() => {});
  }, [gameState, code]);

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
  };
}
