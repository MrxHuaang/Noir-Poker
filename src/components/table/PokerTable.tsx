"use client";
import { useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import confetti from "canvas-confetti";
import { Trophy } from "lucide-react";
import type { GameState, Player } from "@/lib/poker";
import { advance, deal } from "@/lib/poker";
import {
  CATEGORY_LABEL,
  type Category,
  showdown,
  type Showdown,
} from "@/lib/handEval";
import { usePlayers } from "@/hooks/usePlayers";
import { useStats } from "@/hooks/useStats";
import { useEquity, type RunOne } from "@/hooks/useEquity";
import { useHistory } from "@/hooks/useHistory";
import { PlayerPicker } from "./PlayerPicker";
import { PlayerSeat } from "./PlayerSeat";
import { CommunityRow } from "./CommunityRow";
import { DealControls } from "./DealControls";
import { AllInModal } from "./AllInModal";
import { RunResults } from "./RunResults";
import { StatsPanel } from "@/components/StatsPanel";

export function PokerTable() {
  const { players, hydrated } = usePlayers();
  const { addWins } = useStats();
  const { record, recordMany } = useHistory();
  const [state, setState] = useState<GameState | null>(null);
  const [result, setResult] = useState<Showdown | null>(null);
  const [allInOpen, setAllInOpen] = useState(false);
  const [runs, setRuns] = useState<RunOne[] | null>(null);
  const [running, setRunning] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const { equity, outs, runMany } = useEquity(result ? null : state);

  useGSAP(
    () => {
      if (!state) return;
      gsap.from(".player-seat", {
        y: -40,
        opacity: 0,
        duration: 0.6,
        ease: "power3.out",
        stagger: 0.07,
      });
      gsap.from(".hole-cards .playing-card", {
        y: -260,
        rotateZ: -18,
        opacity: 0,
        duration: 0.55,
        ease: "power2.out",
        stagger: 0.05,
      });
      gsap.from(".community-slot", {
        y: -120,
        opacity: 0,
        duration: 0.5,
        ease: "power2.out",
        stagger: 0.08,
      });
    },
    {
      scope: rootRef,
      dependencies: [
        state?.seats.length,
        state?.street,
        state?.community.length,
      ],
    },
  );

  function startDeal(selected: Player[]) {
    setResult(null);
    setRuns(null);
    setState(deal(selected));
  }

  function reshuffle() {
    if (!state) return;
    setResult(null);
    setRuns(null);
    setState(deal(state.seats.map((s) => s.player)));
  }

  function nextStreet() {
    if (!state) return;
    if (state.street === "river") return;
    setState(advance(state));
  }

  function reset() {
    setResult(null);
    setRuns(null);
    setState(null);
  }

  function toggleSeat(id: string) {
    if (!state) return;
    setState({
      ...state,
      seats: state.seats.map((s) =>
        s.player.id === id ? { ...s, revealed: !s.revealed } : s,
      ),
    });
  }

  function toggleFold(id: string) {
    if (!state || result) return;
    setState({
      ...state,
      seats: state.seats.map((s) =>
        s.player.id === id ? { ...s, folded: !s.folded } : s,
      ),
    });
  }

  function doShowdown() {
    if (!state || result) return;
    const r = showdown(state.seats, state.community);
    if (!r) return;
    setState({
      ...state,
      seats: state.seats.map((s) => ({
        ...s,
        revealed: s.folded ? s.revealed : true,
      })),
    });
    setResult(r);
    addWins(r.winners);
    record({
      players: state.seats.map((s) => ({
        id: s.player.id,
        name: s.player.name,
        seed: s.player.seed,
      })),
      community: state.community,
      winners: r.winners,
      category: r.category,
    });
    fireConfetti();
  }

  async function doAllIn(N: number) {
    if (!state || running) return;
    setAllInOpen(false);
    setRunning(true);
    const got = await runMany(N, state);
    setRunning(false);
    setRuns(got);
    const allWinners: string[] = [];
    for (const r of got) allWinners.push(...r.winners);
    addWins(allWinners);
    recordMany(
      got.map((r, i) => ({
        players: state.seats.map((s) => ({
          id: s.player.id,
          name: s.player.name,
          seed: s.player.seed,
        })),
        community: r.community,
        winners: r.winners,
        category: r.category as Category,
        runIndex: i,
        runTotal: got.length,
      })),
    );
    // reveal all unfolded
    setState({
      ...state,
      community: got[got.length - 1]?.community ?? state.community,
      street: "river",
      seats: state.seats.map((s) => ({
        ...s,
        revealed: s.folded ? s.revealed : true,
      })),
    });
    fireConfetti();
  }

  function fireConfetti() {
    const opts = {
      spread: 70,
      ticks: 120,
      gravity: 1,
      decay: 0.92,
      colors: ["#fcd34d", "#34d399", "#f4f4f5", "#0f3d2e"],
    };
    confetti({ ...opts, particleCount: 80, origin: { x: 0.2, y: 0.4 } });
    confetti({ ...opts, particleCount: 80, origin: { x: 0.8, y: 0.4 } });
    confetti({
      ...opts,
      particleCount: 120,
      origin: { x: 0.5, y: 0.3 },
      startVelocity: 55,
    });
  }

  const activeCount = useMemo(
    () => state?.seats.filter((s) => !s.folded).length ?? 0,
    [state],
  );

  const winnerIds = result?.winners ?? [];
  const winnerNames =
    result && state
      ? state.seats
          .filter((s) => winnerIds.includes(s.player.id))
          .map((s) => s.player.name)
      : [];

  const unseenCount = state
    ? 52 -
      state.seats.length * 2 -
      state.community.length -
      state.burns.length
    : 0;

  if (!hydrated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-zinc-500 text-sm">
        Cargando…
      </div>
    );
  }

  if (!state) {
    return (
      <div
        ref={rootRef}
        className="w-full flex flex-col lg:flex-row gap-6 items-start"
      >
        <div className="flex-1 min-w-0">
          <PlayerPicker players={players} onDeal={startDeal} />
        </div>
        <StatsPanel players={players} />
      </div>
    );
  }

  const canShowdown =
    !result &&
    !running &&
    activeCount >= 1 &&
    (state.street === "river" || activeCount === 1);
  const canAdvance =
    !result && !running && state.street !== "river" && activeCount > 1;
  const canAllIn =
    !result && !running && activeCount >= 2 && state.street !== "river";

  return (
    <div
      ref={rootRef}
      className="w-full flex flex-col lg:flex-row gap-6 items-start"
    >
      <div className="flex-1 min-w-0 flex flex-col items-center gap-6">
        <Felt
          state={state}
          winners={winnerIds}
          showdownDone={!!result || !!runs}
          equity={equity}
          outs={outs}
          unseenCount={unseenCount}
          onToggle={toggleSeat}
          onFoldToggle={toggleFold}
        />
        {result ? (
          <WinnerBanner
            names={winnerNames}
            category={CATEGORY_LABEL[result.category]}
          />
        ) : null}
        {running ? (
          <div className="text-sm text-zinc-400 animate-pulse">
            Corriendo runs…
          </div>
        ) : null}
        <DealControls
          street={state.street}
          canAdvance={canAdvance}
          canShowdown={canShowdown}
          canAllIn={canAllIn}
          onAdvance={nextStreet}
          onShowdown={doShowdown}
          onAllIn={() => setAllInOpen(true)}
          onReshuffle={reshuffle}
          onReset={reset}
        />
        <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
          Calle: {state.street} · Activos: {activeCount} · Mazo: {unseenCount}
        </div>
      </div>
      <StatsPanel players={players} highlightIds={winnerIds} />
      {allInOpen ? (
        <AllInModal
          onCancel={() => setAllInOpen(false)}
          onConfirm={doAllIn}
        />
      ) : null}
      {runs ? (
        <RunResults
          runs={runs}
          players={state.seats.map((s) => s.player)}
          onClose={() => setRuns(null)}
        />
      ) : null}
    </div>
  );
}

function WinnerBanner({
  names,
  category,
}: {
  names: string[];
  category: string;
}) {
  const tie = names.length > 1;
  return (
    <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-amber-300/10 ring-1 ring-amber-300/40 text-amber-100 shadow-[0_20px_60px_-20px_rgba(252,211,77,0.4)]">
      <Trophy className="w-5 h-5 text-amber-300" />
      <div className="flex flex-col">
        <span className="text-sm">
          {tie ? "Empate: " : "Gana "}
          <span className="font-semibold text-amber-50">
            {names.join(" · ")}
          </span>
        </span>
        <span className="text-[11px] text-amber-200/80">{category}</span>
      </div>
    </div>
  );
}

function Felt({
  state,
  winners,
  showdownDone,
  equity,
  outs,
  unseenCount,
  onToggle,
  onFoldToggle,
}: {
  state: GameState;
  winners: string[];
  showdownDone: boolean;
  equity: Record<string, number>;
  outs: Record<string, number>;
  unseenCount: number;
  onToggle: (id: string) => void;
  onFoldToggle: (id: string) => void;
}) {
  const n = state.seats.length;
  return (
    <div className="relative w-full max-w-4xl aspect-[16/10] my-2">
      <div
        className="absolute inset-0 rounded-[50%] ring-1 ring-white/10 shadow-[inset_0_0_120px_rgba(0,0,0,0.6),0_30px_80px_-30px_rgba(0,0,0,0.7)]"
        style={{
          background:
            "radial-gradient(ellipse at center, #0f3d2e 0%, #0a2a20 55%, #06140f 100%)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <CommunityRow community={state.community} />
      </div>
      {state.seats.map((seat, i) => {
        const angle = (i / n) * Math.PI * 2 + Math.PI / 2;
        const rx = 46;
        const ry = 44;
        const x = 50 + Math.cos(angle) * rx;
        const y = 50 + Math.sin(angle) * ry;
        return (
          <PlayerSeat
            key={seat.player.id}
            seat={seat}
            isWinner={winners.includes(seat.player.id)}
            showdownDone={showdownDone}
            equity={equity[seat.player.id]}
            outs={outs[seat.player.id]}
            unseenCount={unseenCount}
            community={state.community}
            onToggle={() => onToggle(seat.player.id)}
            onFoldToggle={() => onFoldToggle(seat.player.id)}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
        );
      })}
    </div>
  );
}
