"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Pause,
  Play,
  SkipForward,
  Trophy,
  ChevronDown,
  ChevronUp,
  Crown,
} from "lucide-react";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { Avatar } from "@/components/players/Avatar";
import { PotDisplay } from "@/components/betting/PotDisplay";
import { useNormalRoom, useNormalLobby } from "@/hooks/useNormalRoom";
import { patchNormalRoom } from "@/lib/normalRooms";
import { formatChips } from "@/lib/betting";
import { getTableTheme } from "@/lib/themes";
import type { TableThemeId } from "@/lib/themes";
import {
  getLevel,
  levelTimeRemaining,
  advanceLevel,
  pauseTournament,
  resumeTournament,
} from "@/lib/tournament";
import { formatDuration } from "@/lib/tournament";
import { TOURNAMENT_LEVELS } from "@/lib/betting";
import { useCountdown } from "@/hooks/useTimer";

function LevelCountdown({
  levelDeadline,
}: {
  levelDeadline: number;
}) {
  const remaining = useCountdown(levelDeadline);
  const urgent = remaining < 60_000;
  return (
    <span
      className={`tabular-nums font-semibold text-2xl ${urgent ? "text-rose-300" : "text-zinc-100"}`}
    >
      {formatDuration(remaining)}
    </span>
  );
}

export default function AdminTorneoPage() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() ?? null;
  const room = useNormalRoom(code);
  const lobby = useNormalLobby(code);
  const [showLevels, setShowLevels] = useState(false);

  const gs = room?.state ?? null;
  const tournament = room?.tournament ?? null;
  const config = room?.config;
  const theme = (room?.theme as TableThemeId) ?? "noir";
  const t = getTableTheme(theme);

  // Auto-advance blind level when timer expires
  useEffect(() => {
    if (!tournament || !config || !code) return;
    if (tournament.paused) return;
    const remaining = levelTimeRemaining(tournament, config);
    if (remaining > 0) return;

    const next = advanceLevel(tournament);
    patchNormalRoom(code, { tournament: next }).catch(() => {});
  });

  if (!room) {
    return (
      <div className="p-8 text-center text-zinc-500 text-sm">
        Cargando sala…
      </div>
    );
  }

  if (room.mode !== "torneo") {
    return (
      <div className="p-8 text-center text-zinc-500 text-sm">
        Esta sala no es un torneo.
      </div>
    );
  }

  const level = tournament && config ? getLevel(tournament, config) : null;
  const levelMs =
    tournament && config ? levelTimeRemaining(tournament, config) : 0;
  const levelDeadline = tournament?.paused
    ? Date.now() + levelMs
    : Date.now() + levelMs;

  const levels = config?.blindLevels ?? TOURNAMENT_LEVELS;
  const currentLevelIdx = tournament?.currentLevel ?? 0;

  // Sorted seats by chips descending
  const sortedSeats = gs
    ? [...gs.seats]
        .filter((s) => s.status !== "out")
        .sort((a, b) => b.chips - a.chips)
    : lobby.map((p) => ({
        id: p.uid,
        name: p.name,
        seed: p.seed,
        chips: config?.startingStack ?? 1000,
        status: "waiting" as const,
        bet: 0,
        totalBet: 0,
        revealed: false,
        timeBank: config?.timeBankInit ?? 60000,
        turnDeadline: null,
        ownerUid: p.uid,
      }));

  const knockouts = tournament?.knockouts ?? [];
  const knockedOutNames = knockouts.map(
    (id) =>
      gs?.seats.find((s) => s.id === id)?.name ??
      lobby.find((p) => p.uid === id)?.name ??
      id,
  );

  async function handlePause() {
    if (!tournament || !config || !code) return;
    const next = tournament.paused
      ? resumeTournament(tournament)
      : pauseTournament(tournament, config);
    await patchNormalRoom(code, { tournament: next });
  }

  async function handleAdvance() {
    if (!tournament || !code) return;
    const next = advanceLevel(tournament);
    await patchNormalRoom(code, { tournament: next });
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl glass elevate">
        <div>
          <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            Admin · Torneo
          </span>
          <h1 className="text-2xl tracking-[0.2em] font-semibold text-zinc-100 mt-0.5">
            {code}
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {sortedSeats.length} jugadores activos · {knockouts.length} eliminados
          </p>
        </div>

        {/* Blind level controls */}
        {tournament && level && (
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Nivel {currentLevelIdx + 1}
                </div>
                <div className="text-sm text-zinc-300">
                  {formatChips(level.sb)}/{formatChips(level.bb)}
                  {level.ante > 0 && (
                    <span className="text-zinc-500 ml-1">
                      ante {formatChips(level.ante)}
                    </span>
                  )}
                </div>
              </div>
              {!tournament.paused ? (
                <LevelCountdown levelDeadline={levelDeadline} />
              ) : (
                <span className="tabular-nums font-semibold text-2xl text-amber-300">
                  {formatDuration(levelMs)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePause}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass ring-white/10 text-xs text-zinc-200 hover:bg-white/10 btn-press transition"
              >
                {tournament.paused ? (
                  <>
                    <Play className="w-3.5 h-3.5" /> Reanudar
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5" /> Pausar
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleAdvance}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass ring-white/10 text-xs text-zinc-200 hover:bg-white/10 btn-press transition"
              >
                <SkipForward className="w-3.5 h-3.5" /> Avanzar nivel
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: game state */}
        <div className="flex-1 flex flex-col gap-4">
          {gs ? (
            <>
              {/* Community */}
              <div
                className="rounded-3xl p-5 flex flex-col items-center gap-3"
                style={{ background: t.feltGradient }}
              >
                <PotDisplay
                  pot={gs.betting.pot}
                  sidePots={gs.betting.sidePots}
                  currentBet={gs.betting.currentBet}
                />
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {gs.community.map((c, i) => (
                    <PlayingCard
                      key={c.id + i}
                      card={c}
                      faceUp
                      size="md"
                      dealIn={false}
                    />
                  ))}
                  {Array.from({ length: 5 - gs.community.length }).map(
                    (_, i) => (
                      <PlayingCard
                        key={`e${i}`}
                        faceUp={false}
                        size="md"
                        dealIn={false}
                      />
                    ),
                  )}
                </div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                  {gs.street} · {gs.phase}
                </div>
              </div>

              {/* Seats */}
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {gs.seats.map((seat) => (
                  <li
                    key={seat.id}
                    className={`flex items-center gap-3 p-3 rounded-2xl ring-1 transition ${
                      gs.betting.toActId === seat.id
                        ? "bg-emerald-500/10 ring-emerald-400/40"
                        : seat.status === "folded"
                          ? "glass ring-white/5 opacity-50"
                          : seat.status === "out"
                            ? "glass ring-white/5 opacity-30"
                            : "glass ring-white/8"
                    }`}
                  >
                    <Avatar seed={seat.seed} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-100 truncate">
                          {seat.name}
                        </span>
                        {gs.betting.toActId === seat.id && (
                          <span className="text-[9px] uppercase tracking-widest text-emerald-300 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
                            Turno
                          </span>
                        )}
                        {seat.status === "all-in" && (
                          <span className="text-[9px] uppercase tracking-widest text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded-full">
                            All-in
                          </span>
                        )}
                        {seat.status === "folded" && (
                          <span className="text-[9px] uppercase tracking-widest text-zinc-500 bg-white/5 px-1.5 py-0.5 rounded-full">
                            Fold
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium tabular-nums text-zinc-100">
                        {formatChips(seat.chips)}
                      </div>
                      {seat.bet > 0 && (
                        <div className="text-[11px] text-zinc-500 tabular-nums">
                          +{formatChips(seat.bet)}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="py-10 text-center text-zinc-500 text-sm glass rounded-2xl">
              Esperando primera mano…
            </div>
          )}

          {/* Blind structure collapsible */}
          <button
            type="button"
            onClick={() => setShowLevels((v) => !v)}
            className="flex items-center justify-between w-full px-4 py-3 rounded-2xl glass ring-1 ring-white/8 text-sm text-zinc-300 hover:bg-white/5 transition"
          >
            <span>Estructura de ciegas</span>
            {showLevels ? (
              <ChevronUp className="w-4 h-4 text-zinc-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            )}
          </button>
          {showLevels && (
            <div className="rounded-2xl glass overflow-hidden">
              <table className="w-full text-xs text-zinc-400">
                <thead>
                  <tr className="border-b border-white/8">
                    <th className="px-4 py-2 text-left font-medium text-zinc-500 uppercase tracking-widest">
                      Nv
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-zinc-500 uppercase tracking-widest">
                      SB
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-zinc-500 uppercase tracking-widest">
                      BB
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-zinc-500 uppercase tracking-widest">
                      Ante
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-zinc-500 uppercase tracking-widest">
                      Min
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {levels.map((lv, i) => (
                    <tr
                      key={i}
                      className={`border-b border-white/5 ${
                        i === currentLevelIdx
                          ? "bg-emerald-500/10 text-zinc-100"
                          : i < currentLevelIdx
                            ? "opacity-40"
                            : ""
                      }`}
                    >
                      <td className="px-4 py-2 font-medium">{i + 1}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatChips(lv.sb)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatChips(lv.bb)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {lv.ante > 0 ? formatChips(lv.ante) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {config?.blindLevelDuration
                          ? Math.round(config.blindLevelDuration / 60_000)
                          : 15}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right sidebar: leaderboard + knockouts */}
        <aside className="w-full lg:w-64 flex flex-col gap-4">
          {/* Leaderboard */}
          <div className="flex flex-col gap-2">
            <h3 className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Clasificación
            </h3>
            <ul className="flex flex-col gap-1.5">
              {sortedSeats.map((seat, i) => (
                <li
                  key={seat.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl glass ring-1 ring-white/8 text-xs"
                >
                  <span className="w-5 text-center tabular-nums text-zinc-500 font-medium">
                    {i + 1}
                  </span>
                  <Avatar seed={seat.seed} size={20} />
                  <span className="flex-1 text-zinc-100 truncate">
                    {seat.name}
                  </span>
                  {i === 0 && (
                    <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  )}
                  <span className="tabular-nums font-medium text-emerald-300">
                    {formatChips(seat.chips)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Knockouts */}
          {knockedOutNames.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                Eliminados
              </h3>
              <ul className="flex flex-col gap-1.5">
                {knockedOutNames.map((name, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl glass ring-1 ring-rose-400/10 text-xs text-zinc-500"
                  >
                    <Trophy className="w-3.5 h-3.5 text-rose-400/60 shrink-0" />
                    <span className="flex-1 truncate">{name}</span>
                    <span className="tabular-nums text-zinc-600">
                      #{knockedOutNames.length - i}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Final ranking */}
          {tournament?.finalRanking && tournament.finalRanking.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                Ranking final
              </h3>
              <ul className="flex flex-col gap-1.5">
                {tournament.finalRanking.map((id, i) => {
                  const name =
                    gs?.seats.find((s) => s.id === id)?.name ??
                    lobby.find((p) => p.uid === id)?.name ??
                    id;
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl glass ring-1 ring-amber-400/10 text-xs"
                    >
                      <span
                        className={`w-5 text-center font-semibold tabular-nums ${
                          i === 0
                            ? "text-amber-300"
                            : i === 1
                              ? "text-zinc-300"
                              : i === 2
                                ? "text-amber-600"
                                : "text-zinc-500"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1 text-zinc-200 truncate">
                        {name}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Tournament stats */}
          <div className="p-3 rounded-2xl glass flex flex-col gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">Total fichas</span>
              <span className="tabular-nums text-zinc-200">
                {formatChips(
                  sortedSeats.reduce((sum, s) => sum + s.chips, 0),
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Fichas promedio</span>
              <span className="tabular-nums text-zinc-200">
                {sortedSeats.length > 0
                  ? formatChips(
                      Math.round(
                        sortedSeats.reduce((sum, s) => sum + s.chips, 0) /
                          sortedSeats.length,
                      ),
                    )
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Lider</span>
              <span className="text-zinc-200 truncate max-w-[100px] text-right">
                {sortedSeats[0]?.name ?? "—"}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
