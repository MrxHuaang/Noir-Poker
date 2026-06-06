"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { SkipForward, Trophy } from "lucide-react";
import { fireConfetti } from "@/lib/confetti";
import type { Card, GameState, Player } from "@/lib/poker";
import {
  gameToPublic,
  patchRoom,
  subscribeRoom,
  writeDealedRoom,
} from "@/lib/rooms";
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
import { useSound } from "@/hooks/useSound";
import { PlayerPicker } from "./PlayerPicker";
import { PlayerSeat } from "./PlayerSeat";
import { CommunityRow } from "./CommunityRow";
import { DealControls } from "./DealControls";
import { AllInModal } from "./AllInModal";
import { RunResults } from "./RunResults";
import { StatsPanel } from "@/components/StatsPanel";
import { EquityPanel } from "@/components/EquityPanel";
import { Avatar } from "@/components/players/Avatar";
import { getTableTheme, type TableThemeId, type CardBackId, type CardFaceId } from "@/lib/themes";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function PokerTable({
  sync,
  playersOverride,
  theme,
  cardBack,
  cardFace,
}: {
  sync?: {
    roomCode: string;
    ownersMap: Record<string, string | null>;
  };
  playersOverride?: Player[];
  theme?: TableThemeId;
  cardBack?: string;
  cardFace?: string;
} = {}) {
  const local = usePlayers();
  const players = playersOverride ?? local.players;
  const hydrated = playersOverride ? true : local.hydrated;
  const { addWins } = useStats();
  const { play: playSound } = useSound();
  const { record, recordMany } = useHistory();
  const [state, setState] = useState<GameState | null>(null);
  const [result, setResult] = useState<Showdown | null>(null);
  const [allInOpen, setAllInOpen] = useState(false);
  const [runs, setRuns] = useState<RunOne[] | null>(null);
  const [running, setRunning] = useState(false);
  const [playback, setPlayback] = useState<{
    runs: RunOne[];
    idx: number;
  } | null>(null);
  const [runHighlight, setRunHighlight] = useState<string[]>([]);
  const skipRef = useRef(false);

  const { equity, outs, runMany } = useEquity(
    sync || result || playback ? null : state,
  );

  // Merge inbound fold/reveal flags from phones via Firestore.
  // Phones write to state.seats directly; without this, the host's own
  // write-back would clobber those flags on the next state change.
  useEffect(() => {
    if (!sync) return;
    const unsub = subscribeRoom(sync.roomCode, (room) => {
      const incoming = room?.state?.seats;
      if (!incoming) return;
      setState((prev) => {
        if (!prev) return prev;
        let dirty = false;
        const seats = prev.seats.map((s) => {
          const r = incoming.find((rs) => rs.id === s.player.id);
          if (!r) return s;
          if (
            r.folded !== s.folded ||
            r.revealedCards[0] !== s.revealedCards[0] ||
            r.revealedCards[1] !== s.revealedCards[1]
          ) {
            dirty = true;
            return { ...s, folded: r.folded, revealedCards: r.revealedCards };
          }
          return s;
        });
        return dirty ? { ...prev, seats } : prev;
      });
    });
    return () => unsub();
  }, [sync?.roomCode]);

  const lastDealIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sync || !state) return;
    const ownersMap = sync.ownersMap;
    const code = sync.roomCode;
    (async () => {
      try {
        if (state.dealId !== lastDealIdRef.current) {
          lastDealIdRef.current = state.dealId;
          await writeDealedRoom(code, state, ownersMap);
        } else {
          await patchRoom(code, {
            state: gameToPublic(state, ownersMap),
            result,
            playback: playback
              ? {
                  idx: playback.idx,
                  total: playback.runs.length,
                  community: state.community,
                }
              : null,
            runHighlight,
          });
        }
      } catch {
        /* swallow FS errors */
      }
    })();
  }, [state, result, playback, runHighlight, sync]);

  function startDeal(selected: Player[]) {
    setResult(null);
    setRuns(null);
    setPlayback(null);
    setRunHighlight([]);
    setState(deal(selected));
  }

  function reshuffle() {
    if (!state) return;
    setResult(null);
    setRuns(null);
    setPlayback(null);
    setRunHighlight([]);
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
    setPlayback(null);
    setRunHighlight([]);
    setState(null);
  }

  function toggleSeat(id: string) {
    if (!state) return;
    setState({
      ...state,
      seats: state.seats.map((s) => {
        if (s.player.id !== id) return s;
        const both = s.revealedCards[0] && s.revealedCards[1];
        return { ...s, revealedCards: [!both, !both] as [boolean, boolean] };
      }),
    });
  }

  function toggleFold(id: string) {
    if (!state || result || playback) return;
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
        revealedCards: s.folded ? s.revealedCards : [true, true],
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
    playSound("winner");
  }

  async function doAllIn(N: number) {
    if (!state || running) return;
    setAllInOpen(false);
    setRunning(true);
    const got = await runMany(N, state);
    setRunning(false);
    if (got.length === 0) return;
    const baselineCommunity = state.community;
    // reveal all unfolded hole cards
    setState((s) =>
      s
        ? {
            ...s,
            seats: s.seats.map((seat) => ({
              ...seat,
              revealedCards: seat.folded ? seat.revealedCards : ([true, true] as [boolean, boolean]),
            })),
          }
        : s,
    );
    skipRef.current = false;
    await playRuns(got, baselineCommunity);
  }

  function skipPlayback() {
    skipRef.current = true;
  }

  async function playRuns(rs: RunOne[], baselineCommunity: Card[]) {
    const missing = 5 - baselineCommunity.length;
    for (let i = 0; i < rs.length; i++) {
      setPlayback({ runs: rs, idx: i });
      setRunHighlight([]);
      setState((s) =>
        s ? { ...s, community: baselineCommunity, street: "preflop" } : s,
      );
      await sleep(skipRef.current ? 50 : 500);

      const run = rs[i];
      for (let step = 1; step <= missing; step++) {
        const next = run.community.slice(
          0,
          baselineCommunity.length + step,
        );
        setState((s) => (s ? { ...s, community: next } : s));
        // Dramatic pause: shorter for subsequent cards in flop, longer for turn/river
        const isFlop = baselineCommunity.length === 0 && step <= 3;
        const delay = skipRef.current ? 60 : isFlop ? 550 : 950;
        await sleep(delay);
      }
      setRunHighlight(run.winners);
      await sleep(skipRef.current ? 200 : 1800);
    }
    setRunHighlight([]);
    setPlayback(null);

    const allWinners: string[] = [];
    for (const r of rs) allWinners.push(...r.winners);
    addWins(allWinners);
    if (state) {
      recordMany(
        rs.map((r, i) => ({
          players: state.seats.map((s) => ({
            id: s.player.id,
            name: s.player.name,
            seed: s.player.seed,
          })),
          community: r.community,
          winners: r.winners,
          category: r.category as Category,
          runIndex: i,
          runTotal: rs.length,
        })),
      );
    }
    setRuns(rs);
    fireConfetti();
    playSound("winner");
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
      <div className="w-full flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0">
          {sync ? (
            <HostLobby players={players} onDeal={startDeal} />
          ) : (
            <PlayerPicker players={players} onDeal={startDeal} />
          )}
        </div>
        <div className="flex flex-col gap-4 w-full lg:w-auto">
          <StatsPanel players={players} />
        </div>
      </div>
    );
  }

  const canShowdown =
    !result &&
    !running &&
    !playback &&
    activeCount >= 1 &&
    (state.street === "river" || activeCount === 1);
  const canAdvance =
    !result &&
    !running &&
    !playback &&
    state.street !== "river" &&
    activeCount > 1;
  const canAllIn =
    !result &&
    !running &&
    !playback &&
    activeCount >= 2 &&
    state.street !== "river";

  const highlightForFelt = playback ? runHighlight : winnerIds;

  const feltNode = (
    <Felt
      key={state.dealId}
      state={state}
      winners={highlightForFelt}
      showdownDone={!!result || !!runs}
      onToggle={toggleSeat}
      onFoldToggle={toggleFold}
      theme={theme}
      presencial={!!sync}
      cardBack={cardBack as CardBackId | undefined}
      cardFace={cardFace as CardFaceId | undefined}
    />
  );

  const controlsNode = (
    <>
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
      {!playback ? (
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
      ) : null}
      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
        Calle: {state.street} · Activos: {activeCount} · Mazo: {unseenCount}
      </div>
    </>
  );

  const modals = (
    <>
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
    </>
  );

  if (sync) {
    return (
      <div className="w-full h-full flex flex-col lg:flex-row gap-3 overflow-hidden">
        <div className="flex-1 min-h-0 min-w-0 flex flex-col gap-1.5 overflow-hidden">
          {playback ? (
            <PlaybackBanner
              current={playback.idx + 1}
              total={playback.runs.length}
              winners={
                runHighlight.length > 0
                  ? state.seats
                      .filter((s) => runHighlight.includes(s.player.id))
                      .map((s) => s.player.name)
                  : null
              }
              category={
                runHighlight.length > 0
                  ? CATEGORY_LABEL[
                      playback.runs[playback.idx].category as Category
                    ]
                  : null
              }
              onSkip={skipPlayback}
            />
          ) : null}
          <div className="flex-1 min-h-0 w-full [container-type:size] flex items-center justify-center">
            {feltNode}
          </div>
          <div className="shrink-0 flex flex-col items-center gap-1.5 pb-1">
            {controlsNode}
          </div>
        </div>
        <div className="shrink-0 flex flex-col gap-4 w-full lg:w-60">
          <StatsPanel players={players} highlightIds={winnerIds} />
        </div>
        {modals}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex-1 min-w-0 flex flex-col items-center gap-6">
        {playback ? (
          <PlaybackBanner
            current={playback.idx + 1}
            total={playback.runs.length}
            winners={
              runHighlight.length > 0
                ? state.seats
                    .filter((s) => runHighlight.includes(s.player.id))
                    .map((s) => s.player.name)
                : null
            }
            category={
              runHighlight.length > 0
                ? CATEGORY_LABEL[
                    playback.runs[playback.idx].category as Category
                  ]
                : null
            }
            onSkip={skipPlayback}
          />
        ) : null}
        {feltNode}
        {controlsNode}
      </div>
      <div className="flex flex-col gap-4 w-full lg:w-auto">
        <EquityPanel
          seats={state.seats}
          community={state.community}
          equity={equity}
          outs={outs}
          unseenCount={unseenCount}
          showdownDone={!!result || !!playback || !!runs}
        />
        <StatsPanel players={players} highlightIds={winnerIds} />
      </div>
      {modals}
    </div>
  );
}

function PlaybackBanner({
  current,
  total,
  winners,
  category,
  onSkip,
}: {
  current: number;
  total: number;
  winners: string[] | null;
  category: string | null;
  onSkip: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-rose-500/10 ring-1 ring-rose-300/30 text-rose-100">
      <span className="text-xs uppercase tracking-[0.2em] tabular-nums">
        Run {current}/{total}
      </span>
      {winners ? (
        <span className="text-sm">
          {winners.length > 1 ? "Empate: " : "Gana "}
          <span className="font-semibold">{winners.join(" · ")}</span>
          {category ? (
            <span className="ml-2 text-[11px] text-rose-200/80">
              {category}
            </span>
          ) : null}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onSkip}
        className="inline-flex items-center gap-1 ml-2 px-2 py-1 rounded-full bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-[11px] text-zinc-200 transition"
        title="Saltar al resumen"
      >
        <SkipForward className="w-3 h-3" />
        Saltar
      </button>
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
    <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-accent/12 ring-1 ring-accent/35 text-accent shadow-[0_20px_60px_-20px_var(--shadow-warm)]">
      <Trophy className="w-5 h-5 text-accent" />
      <div className="flex flex-col">
        <span className="text-sm">
          {tie ? "Empate: " : "Gana "}
          <span className="font-semibold text-zinc-50">
            {names.join(" · ")}
          </span>
        </span>
        <span className="text-[11px] text-accent/80">{category}</span>
      </div>
    </div>
  );
}

function HostLobby({
  players,
  onDeal,
}: {
  players: Player[];
  onDeal: (selected: Player[]) => void;
}) {
  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-6 py-8">
      <header className="text-center">
        <h2 className="text-xl tracking-tight text-zinc-100">
          Jugadores conectados
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          {players.length} en la sala. Esperando para repartir.
        </p>
      </header>
      {players.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-8">
          Aún nadie. Comparte el código.
        </p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 p-3 rounded-2xl bg-white/[0.03] ring-1 ring-white/10"
            >
              <Avatar seed={p.seed} size={32} />
              <span className="text-sm text-zinc-100 truncate">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-center">
        <button
          type="button"
          disabled={players.length < 2 || players.length > 9}
          onClick={() => onDeal(players)}
          title={players.length < 2 ? "Se necesitan al menos 2 jugadores" : undefined}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-accent/85 hover:bg-accent disabled:bg-zinc-800 disabled:text-zinc-400 disabled:ring-1 disabled:ring-white/10 disabled:cursor-not-allowed text-accent-contrast font-medium text-sm transition"
        >
          Repartir ({players.length})
        </button>
      </div>
      <p className={`text-[11px] text-center ${players.length < 2 || players.length > 9 ? "text-rose-400/70" : "text-zinc-500"}`}>
        {players.length < 2
          ? `Faltan ${2 - players.length} jugador${2 - players.length === 1 ? "" : "es"} para repartir.`
          : players.length > 9
            ? "Máximo 9 jugadores."
            : "Requiere 2 a 9 jugadores."}
      </p>
    </div>
  );
}

function Felt({
  state,
  winners,
  showdownDone,
  onToggle,
  onFoldToggle,
  theme,
  presencial,
  cardBack,
  cardFace,
}: {
  state: GameState;
  winners: string[];
  showdownDone: boolean;
  onToggle: (id: string) => void;
  onFoldToggle: (id: string) => void;
  theme?: TableThemeId;
  presencial?: boolean;
  cardBack?: CardBackId;
  cardFace?: CardFaceId;
}) {
  const n = state.seats.length;
  const t = getTableTheme(theme);
  return (
    <div
      className="relative aspect-[16/11]"
      style={
        presencial
          ? { width: "min(100cqw, calc(100cqh * 16 / 11))", maxWidth: "896px" }
          : { width: "100%", maxWidth: "896px", margin: "8px 0" }
      }
    >
      <div
        className="absolute inset-0 rounded-[50%] shadow-[inset_0_0_120px_rgba(0,0,0,0.6),0_30px_80px_-30px_rgba(0,0,0,0.7)]"
        style={{
          background: t.feltGradient,
          boxShadow: `inset 0 0 120px rgba(0,0,0,0.6), 0 30px 80px -30px rgba(0,0,0,0.7), 0 0 0 1px ${t.ringColor}`,
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <CommunityRow community={state.community} cardFace={cardFace} />
      </div>
      {state.seats.map((seat, i) => {
        const angle = (i / n) * Math.PI * 2 + Math.PI / 2;
        const rx = 43;
        const ry = 41;
        const x = 50 + Math.cos(angle) * rx;
        const y = 50 + Math.sin(angle) * ry;
        return (
          <PlayerSeat
            key={seat.player.id}
            seat={seat}
            isWinner={winners.includes(seat.player.id)}
            showdownDone={showdownDone}
            onToggle={() => onToggle(seat.player.id)}
            onFoldToggle={() => onFoldToggle(seat.player.id)}
            cardBack={cardBack}
            cardFace={cardFace}
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
