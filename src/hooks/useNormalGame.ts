"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NormalGameState, RoomConfig } from "@/lib/betting";
import {
  handleAction,
  startHand,
  computeSidePots,
  distributeRunPot,
} from "@/lib/betting";
import type { NormalRoomDoc, PendingAction, NormalLobbyPlayer } from "@/lib/normalRooms";
import {
  lobbyToSeats,
  patchNormalRoom,
  kickFromLobby,
  writeNormalDealt,
} from "@/lib/normalRooms";
import { showdown, bestHand, compareScore, categoryFor } from "@/lib/handEval";
import type { Category } from "@/lib/handEval";
import { writeHandRecord } from "@/lib/handHistory";
import type { Card, GameState } from "@/lib/poker";
import { advance } from "@/lib/poker";

export type RunRecord = {
  community: Card[];
  winners: string[];
  category: Category;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toPublicState(gs: NormalGameState) {
  const { deck, ...rest } = gs;
  return { ...rest, deckCount: deck.length };
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
  const handNumRef = useRef(0);
  const dealerIdxRef = useRef(-1);
  const isAdminRef = useRef(false);
  const dealtHolesRef = useRef<Record<string, [Card, Card]>>({});
  // Tracks which hand had all-in negotiation triggered, so the auto-advance
  // effect doesn't re-fire after the run starts and clears allInNegotiation.
  const allInTriggeredHandRef = useRef<number>(-1);
  // Tracks which hand's all-in run was already started, prevents finalize re-entry.
  const allInRanHandRef = useRef<number>(-1);

  const dismissRuns = useCallback(() => setRuns(null), []);

  const startNewHand = useCallback(async () => {
    if (!code || !isAdminRef.current) return;
    const ownersMap: Record<string, string | null> = {};
    for (const p of lobby) ownersMap[p.uid] = p.uid;

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
    await writeNormalDealt(code, finalState, newHoleCards, ownersMap);
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
    },
    [code],
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

  // Admin: auto-resolve when phase reaches showdown
  useEffect(() => {
    if (!isAdminRef.current || !gameState || !code || isProcessing) return;
    if (gameState.phase !== "showdown") return;
    if (room?.result) return;
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

  // Admin: Auto-advance street if round is complete or all-in
  useEffect(() => {
    if (!isAdminRef.current || !gameState || !code || isProcessing) return;
    if (gameState.phase === "showdown" || gameState.phase === "between-hands") return;

    // Check if everyone is all-in or folded except one
    const unfolded = gameState.seats.filter(s => s.status !== "folded" && s.status !== "out");

    if (unfolded.length <= 1) {
      // Auto-showdown
      void resolveShowdown();
      return;
    }

    const isAllInRunout = gameState.betting.toActId === null && unfolded.length >= 2;

    if (isAllInRunout) {
      const thisHand = gameState.betting.handNum;
      // Guard: don't re-trigger all-in negotiation for the same hand after run started.
      if (allInRanHandRef.current === thisHand) return;
      if (allInTriggeredHandRef.current === thisHand) return;

      if (gameState.phase !== "all-in-negotiation") {
        const revealedHoles: Record<string, [Card, Card]> = { ...(room?.revealedHoles ?? {}) };
        for (const u of unfolded) {
           const cards = dealtHolesRef.current[u.id];
           if (cards) revealedHoles[u.id] = cards;
        }

        const newState: NormalGameState = {
          ...gameState,
          phase: "all-in-negotiation",
          allInNegotiation: {
            playerIds: unfolded.map(u => u.id),
            votes: {},
          }
        };
        allInTriggeredHandRef.current = thisHand;
        setTimeout(() => {
          setGameState(newState);
          patchNormalRoom(code, { state: toPublicState(newState), revealedHoles }).catch(() => {});
        }, 0);
      }
      return;
    }
  }, [gameState, code, isProcessing, resolveShowdown, room?.revealedHoles]);

  // Admin: sync all-in votes from Firestore.
  // Use a JSON diff (not just count comparison) so simultaneous votes from
  // multiple players are always merged even when the count doesn't increase
  // monotonically in the local render cycle.
  useEffect(() => {
    if (!isAdminRef.current || !gameState || !room?.state) return;
    if (gameState.phase !== "all-in-negotiation") return;

    const firestoreVotes = room.state.allInNegotiation?.votes;
    if (!firestoreVotes || Object.keys(firestoreVotes).length === 0) return;

    const localVotes = gameState.allInNegotiation?.votes ?? {};
    // Merge: always apply remote votes on top of local so nothing is lost.
    const merged = { ...localVotes, ...firestoreVotes };
    if (JSON.stringify(merged) !== JSON.stringify(localVotes)) {
      setTimeout(() => {
        setGameState((prev) => {
          if (prev?.phase !== "all-in-negotiation" || !prev.allInNegotiation) return prev;
          return {
            ...prev,
            allInNegotiation: {
              ...prev.allInNegotiation,
              votes: { ...prev.allInNegotiation.votes, ...firestoreVotes },
            },
          };
        });
      }, 0);
    }
  }, [room?.state, gameState]);

  // Admin: Finalize all-in negotiation and run board
  useEffect(() => {
    if (!isAdminRef.current || !gameState || !code || isProcessing) return;
    if (gameState.phase !== "all-in-negotiation" || !gameState.allInNegotiation) return;
    // Guard: only run once per hand
    if (allInRanHandRef.current === gameState.betting.handNum) return;

    const { playerIds, votes } = gameState.allInNegotiation;
    const votedIds = Object.keys(votes);

    if (votedIds.length >= playerIds.length && playerIds.length >= 2) {
      // Mark this hand as "all-in started" immediately to prevent re-entry.
      allInRanHandRef.current = gameState.betting.handNum;
      // All votes are in
      // For now, let's take the most common vote or minimum to be safe
      const voteCounts: Record<number, number> = {};
      votedIds.forEach(id => {
        const v = votes[id];
        voteCounts[v] = (voteCounts[v] || 0) + 1;
      });

      // Find the vote with most supporters, tie-break to lower N
      let bestN = 1;
      let maxVotes = 0;
      [1, 2, 3].forEach(n => {
        if ((voteCounts[n] || 0) > maxVotes) {
          maxVotes = voteCounts[n];
          bestN = n;
        }
      });

      // Execute run out — clear allInNegotiation immediately so the vote modal dismisses
      setTimeout(() => {
        setIsProcessing(true);
        (async () => {
          try {
            // Reveal all hole cards and clear allInNegotiation (closes the vote modal)
            const revealedSeats = gameState.seats.map(s => ({
              ...s,
              revealed: s.status !== "folded" && s.status !== "out",
            }));
            const baselineCommunity = gameState.community.slice();
            const baselineStreet = gameState.street;
            const baseState: NormalGameState = {
              ...gameState,
              seats: revealedSeats,
              phase: baselineStreet,
              allInNegotiation: undefined,
            };
            setGameState(baseState);
            await patchNormalRoom(code, { state: toPublicState(baseState) });

            // Pause so players can see the equity %
            await sleep(2500);

            const allHoles = { ...dealtHolesRef.current, ...holeCards };
            const unfoldedHoles = revealedSeats
              .filter((s) => s.status !== "folded" && s.status !== "out")
              .map((s) => ({ id: s.id, hole: allHoles[s.id] }))
              .filter((x) => !!x.hole) as { id: string; hole: [Card, Card] }[];

            const runRecords: RunRecord[] = [];

            for (let r = 0; r < bestN; r++) {
              // Restore baseline community for each run
              let s: NormalGameState = {
                ...baseState,
                community: baselineCommunity.slice(),
                street: baselineStreet,
              };
              if (r > 0) {
                setGameState(s);
                await patchNormalRoom(code, { state: toPublicState(s) });
                await sleep(900);
              }

              while (s.street !== "river") {
                await sleep(1400);
                s = advance(s as unknown as GameState) as unknown as NormalGameState;
                setGameState(s);
                await patchNormalRoom(code, { state: toPublicState(s) });
              }

              // Evaluate this run
              const knownIds = new Set<string>();
              const scored = unfoldedHoles.map(({ id, hole }) => {
                knownIds.add(id);
                const score = bestHand([...hole, ...s.community]);
                return { id, score };
              });
              if (scored.length > 0) {
                let best = scored[0];
                const winners: string[] = [best.id];
                for (let i = 1; i < scored.length; i++) {
                  const cmp = compareScore(scored[i].score, best.score);
                  if (cmp > 0) {
                    best = scored[i];
                    winners.length = 0;
                    winners.push(scored[i].id);
                  } else if (cmp === 0) {
                    winners.push(scored[i].id);
                  }
                }
                runRecords.push({
                  community: s.community.slice(),
                  winners,
                  category: categoryFor(best.score),
                });
              }

              await sleep(1600);
            }

            // Distribute pot across runs with zero chip leakage: per-run pots
            // sum to totalPot and uneven splits give the remainder to the first
            // winner. Divides by actual runRecords (not bestN) so a run that
            // produced no record never strands chips.
            const totalPot = gameState.betting.pot;
            const { winningsByPlayer, perRunPot } = distributeRunPot(
              totalPot,
              runRecords,
            );

            // Build new chips + final state
            const newChips: Record<string, number> = {};
            for (const seat of gameState.seats) newChips[seat.id] = seat.chips;
            for (const [pid, amt] of Object.entries(winningsByPlayer)) {
              newChips[pid] = (newChips[pid] ?? 0) + amt;
            }

            const finalSeats = gameState.seats.map((s) => ({
              ...s,
              chips: newChips[s.id] ?? s.chips,
              revealed: s.status !== "folded",
              bet: 0,
              totalBet: 0,
              status:
                (newChips[s.id] ?? s.chips) === 0
                  ? ("out" as const)
                  : ("waiting" as const),
            }));

            // Use the last run as the displayed final result
            const finalRun = runRecords[runRecords.length - 1];
            const finalCommunity = finalRun?.community ?? gameState.community;

            const finalState: NormalGameState = {
              ...gameState,
              seats: finalSeats,
              community: finalCommunity,
              phase: "showdown",
            };
            setGameState(finalState);

            const tallyWinners: Set<string> = new Set();
            for (const rec of runRecords) for (const w of rec.winners) tallyWinners.add(w);

            await patchNormalRoom(code, {
              state: toPublicState(finalState),
              result: {
                scores: {},
                winners: [...tallyWinners],
                category: finalRun?.category ?? "high",
                chips: newChips,
              },
            });

            // History: write one record per run
            for (let i = 0; i < runRecords.length; i++) {
              const rec = runRecords[i];
              const runPot = perRunPot[i] ?? 0;
              const share = Math.floor(runPot / rec.winners.length);
              const rem = runPot - share * rec.winners.length;
              const winnerInfo = rec.winners.map((wid, wi) => ({
                id: wid,
                name: finalSeats.find((s) => s.id === wid)?.name ?? wid,
                amount: share + (wi === 0 ? rem : 0),
              }));
              writeHandRecord(code, {
                handNum: gameState.betting.handNum,
                winners: winnerInfo,
                category: rec.category,
                pot: runPot,
                community: rec.community.map((c) => c.id),
                runIndex: bestN > 1 ? i : undefined,
                runTotal: bestN > 1 ? bestN : undefined,
              }).catch(() => {});
            }

            // Show RunResults modal if multiple runs
            if (bestN > 1) setRuns(runRecords);
          } finally {
            setIsProcessing(false);
          }
        })();
      }, 0);
    }
  }, [gameState, code, isProcessing, resolveShowdown]);

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
