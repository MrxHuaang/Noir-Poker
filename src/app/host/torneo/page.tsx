"use client";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  Copy,
  Palette,
  Play,
  SkipForward,
  Trophy,
  Timer,
  ChevronUp,
  Pause,
  Settings,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNormalLobby, useNormalRoom } from "@/hooks/useNormalRoom";
import { useNormalGame } from "@/hooks/useNormalGame";
import {
  createNormalRoom,
  setNormalRoomTheme,
} from "@/lib/normalRooms";
import { TableThemePicker } from "@/components/themes/TableThemePicker";
import { Avatar } from "@/components/players/Avatar";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { PotDisplay } from "@/components/betting/PotDisplay";
import { TurnTimer } from "@/components/betting/TurnTimer";
import { NormalConfigPanel } from "@/components/betting/NormalConfigPanel";
import type { TableThemeId } from "@/lib/themes";
import { getTableTheme } from "@/lib/themes";
import { formatChips, type NormalSeat } from "@/lib/betting";
import { CATEGORY_LABEL } from "@/lib/handEval";
import type { Card } from "@/lib/poker";
import { TOURNAMENT_LEVELS } from "@/lib/betting";
import type { RoomConfig } from "@/lib/betting";
import {
  advanceLevel,
  formatDuration,
  getLevel,
  initTournamentState,
  levelTimeRemaining,
  pauseTournament,
  resumeTournament,
  type TournamentState,
} from "@/lib/tournament";
import { useCountdown } from "@/hooks/useTimer";
import { patchNormalRoom } from "@/lib/normalRooms";

const DEFAULT_TORNEO_CONFIG: RoomConfig = {
  mode: "torneo",
  startingStack: 5000,
  smallBlind: TOURNAMENT_LEVELS[0].sb,
  bigBlind: TOURNAMENT_LEVELS[0].bb,
  ante: TOURNAMENT_LEVELS[0].ante,
  turnTime: 30_000,
  timeBankInit: 60_000,
  blindLevels: TOURNAMENT_LEVELS,
  blindLevelDuration: 15 * 60_000,
};

export default function HostTorneoPage() {
  const { uid, loading } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<RoomConfig>(DEFAULT_TORNEO_CONFIG);
  const [holeCards] = useState<Record<string, [Card, Card]>>({});
  const [tournament, setTournament] = useState<TournamentState>(
    initTournamentState(),
  );

  const room = useNormalRoom(code);
  const lobby = useNormalLobby(code);
  const { gameState, startNewHand, resolveShowdown, isProcessing } =
    useNormalGame(code, room ?? null, lobby, uid, holeCards);

  useEffect(() => {
    if (loading || !uid || code || creating) return;
    setCreating(true);
    createNormalRoom(uid, { ...DEFAULT_TORNEO_CONFIG, mode: "torneo" })
      .then(setCode)
      .catch(() => {})
      .finally(() => setCreating(false));
  }, [loading, uid, code, creating]);

  // Sync tournament state from room
  useEffect(() => {
    if (room?.tournament) setTournament(room.tournament as TournamentState);
  }, [room?.tournament]);

  // Blind level timer
  const currentLevel = getLevel(tournament, config);
  const levelDeadline = tournament.paused
    ? null
    : tournament.levelStartedAt + (config.blindLevelDuration ?? 15 * 60_000);
  const levelRemaining = useCountdown(levelDeadline);

  // Auto-advance blind levels
  useEffect(() => {
    if (levelRemaining === 0 && !tournament.paused && code) {
      const next = advanceLevel(tournament);
      setTournament(next);
      patchNormalRoom(code, { tournament: next }).catch(() => {});
    }
  }, [levelRemaining, tournament, code]);

  const joinUrl =
    typeof window !== "undefined" && code
      ? `${window.location.origin}/play/normal/${code}`
      : "";

  function copy() {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function togglePause() {
    if (!code) return;
    const next = tournament.paused
      ? resumeTournament(tournament)
      : pauseTournament(tournament, config);
    setTournament(next);
    patchNormalRoom(code, { tournament: next }).catch(() => {});
  }

  function manualAdvanceLevel() {
    if (!code) return;
    const next = advanceLevel(tournament);
    setTournament(next);
    patchNormalRoom(code, { tournament: next }).catch(() => {});
  }

  const theme = (room?.theme as TableThemeId) ?? "sapphire";
  const t = getTableTheme(theme);
  const gs = gameState;
  const result = room?.result;
  const canDeal = !gs && lobby.length >= 2 && lobby.length <= 9;
  const isShowdown = gs?.phase === "showdown";

  const activePlayers = useMemo(
    () => gs?.seats.filter((s) => s.status !== "out").length ?? lobby.length,
    [gs, lobby],
  );

  if (loading || !code) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 py-10 text-center text-zinc-500 text-sm">
        Creando torneo…
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl glass elevate">
        <div className="flex items-center gap-4">
          <div className="p-2 rounded-xl bg-white">
            {joinUrl ? <QRCodeSVG value={joinUrl} size={80} /> : null}
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
              Torneo
            </span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-2 text-3xl tracking-[0.25em] font-semibold text-zinc-100 btn-press"
            >
              {code}
              {copied ? (
                <Check className="w-5 h-5 text-emerald-300" />
              ) : (
                <Copy className="w-5 h-5 text-zinc-400" />
              )}
            </button>
            <span className="text-[11px] text-zinc-500 mt-1">
              {activePlayers} jugadores activos
            </span>
          </div>
        </div>

        {/* Blind level display */}
        <div className="flex flex-col items-center gap-1 px-4 py-3 rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Nivel {tournament.currentLevel + 1}
          </div>
          <div className="text-lg font-semibold text-zinc-100">
            {formatChips(currentLevel.sb)} / {formatChips(currentLevel.bb)}
            {currentLevel.ante > 0 && (
              <span className="text-sm text-zinc-400 ml-1">
                +{formatChips(currentLevel.ante)}
              </span>
            )}
          </div>
          <div
            className={`text-xs tabular-nums ${
              tournament.paused ? "text-amber-300" : "text-zinc-400"
            }`}
          >
            {tournament.paused
              ? "Pausado"
              : levelDeadline
              ? formatDuration(levelTimeRemaining(tournament, config))
              : "—"}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={togglePause}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-xs text-zinc-200 hover:bg-white/10 btn-press"
          >
            {tournament.paused ? (
              <><Play className="w-3.5 h-3.5" /> Reanudar</>
            ) : (
              <><Pause className="w-3.5 h-3.5" /> Pausar</>
            )}
          </button>
          <button
            type="button"
            onClick={manualAdvanceLevel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-xs text-zinc-200 hover:bg-white/10 btn-press"
          >
            <ChevronUp className="w-3.5 h-3.5" /> Subir nivel
          </button>
          <button
            type="button"
            onClick={() => { setShowConfig((v) => !v); setShowTheme(false); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-xs text-zinc-200 hover:bg-white/10 btn-press"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => { setShowTheme((v) => !v); setShowConfig(false); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-xs text-zinc-200 hover:bg-white/10 btn-press"
          >
            <Palette className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {showConfig && (
        <NormalConfigPanel
          config={config}
          onChange={setConfig}
          onClose={() => setShowConfig(false)}
        />
      )}
      {showTheme && (
        <div className="p-4 rounded-2xl glass">
          <TableThemePicker
            value={theme}
            onChange={(id) => {
              if (code) setNormalRoomTheme(code, id).catch(() => {});
            }}
          />
        </div>
      )}

      {/* Blind structure */}
      <BlindStructure
        levels={config.blindLevels ?? []}
        currentLevel={tournament.currentLevel}
        duration={config.blindLevelDuration ?? 15 * 60_000}
      />

      {/* Game area */}
      {!gs ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-300">
              Jugadores ({lobby.length})
            </span>
            <button
              type="button"
              disabled={!canDeal || isProcessing}
              onClick={startNewHand}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500/90 hover:bg-emerald-400 disabled:opacity-30 text-emerald-950 font-medium text-sm btn-press transition"
            >
              <Play className="w-4 h-4" /> Iniciar torneo
            </button>
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {lobby.map((p) => (
              <li key={p.uid} className="flex items-center gap-2 p-3 rounded-2xl glass">
                <Avatar seed={p.seed} size={32} />
                <span className="text-sm text-zinc-100 truncate">{p.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-4 items-center">
          <div
            className="w-full rounded-3xl p-6 flex flex-col items-center gap-4"
            style={{ background: t.feltGradient }}
          >
            <PotDisplay
              pot={gs.betting.pot}
              sidePots={gs.betting.sidePots}
              currentBet={gs.betting.currentBet}
            />
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {gs.community.map((c, i) => (
                <PlayingCard key={c.id + i} card={c} faceUp size="md" dealIn={false} />
              ))}
              {Array.from({ length: 5 - gs.community.length }).map((_, i) => (
                <PlayingCard key={`e${i}`} faceUp={false} size="md" dealIn={false} />
              ))}
            </div>
          </div>

          <ul className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
            {gs.seats.map((seat) => (
              <SeatRow
                key={seat.id}
                seat={seat}
                isToAct={gs.betting.toActId === seat.id}
                isWinner={result?.winners?.includes(seat.id) ?? false}
                turnTime={config.turnTime}
              />
            ))}
          </ul>

          <div className="flex items-center gap-3 flex-wrap justify-center">
            {isShowdown && !result && (
              <button
                type="button"
                onClick={resolveShowdown}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-500/90 hover:bg-amber-400 text-amber-950 font-medium text-sm btn-press"
              >
                <Trophy className="w-4 h-4" /> Resolver
              </button>
            )}
            {result && (
              <button
                type="button"
                onClick={startNewHand}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500/90 hover:bg-emerald-400 text-emerald-950 font-medium text-sm btn-press"
              >
                <SkipForward className="w-4 h-4" /> Siguiente mano
              </button>
            )}
          </div>

          {result && (
            <div className="px-5 py-3 rounded-2xl bg-amber-300/10 ring-1 ring-amber-300/40 text-amber-100 text-sm text-center">
              <Trophy className="inline w-4 h-4 text-amber-300 mr-1" />
              {result.winners
                .map((id) => gs.seats.find((s) => s.id === id)?.name ?? id)
                .join(" · ")} — {CATEGORY_LABEL[result.category]}
            </div>
          )}

          {/* Knockout tracker */}
          {tournament.knockouts.length > 0 && (
            <div className="w-full p-4 rounded-2xl glass">
              <h3 className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-3">
                Eliminados
              </h3>
              <ol className="flex flex-col gap-1">
                {[...tournament.knockouts].reverse().map((id, i) => {
                  const name = gs.seats.find((s) => s.id === id)?.name ?? id;
                  const pos = tournament.knockouts.length - i;
                  return (
                    <li key={id} className="flex items-center gap-2 text-sm text-zinc-400">
                      <span className="w-6 text-center text-zinc-600">#{pos}</span>
                      <span>{name}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SeatRow({
  seat,
  isToAct,
  isWinner,
  turnTime,
}: {
  seat: NormalSeat;
  isToAct: boolean;
  isWinner: boolean;
  turnTime: number;
}) {
  return (
    <li
      className={`flex items-center gap-3 p-3 rounded-2xl ring-1 transition ${
        isWinner
          ? "bg-amber-300/10 ring-amber-300/40"
          : isToAct
          ? "bg-emerald-500/10 ring-emerald-400/40"
          : seat.status === "folded" || seat.status === "out"
          ? "bg-white/[0.01] ring-white/5 opacity-50"
          : "glass ring-white/8"
      }`}
    >
      <Avatar seed={seat.seed} size={32} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-100 truncate">{seat.name}</span>
          {seat.status === "all-in" && (
            <span className="text-[10px] text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded-full">
              All-in
            </span>
          )}
          {seat.status === "out" && (
            <span className="text-[10px] text-zinc-500 bg-white/5 px-1.5 py-0.5 rounded-full">
              Eliminado
            </span>
          )}
          {isToAct && (
            <span className="text-[10px] text-emerald-300 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
              Turno
            </span>
          )}
        </div>
        {isToAct && seat.turnDeadline && (
          <TurnTimer deadline={seat.turnDeadline} turnTime={turnTime} timeBank={seat.timeBank} />
        )}
      </div>
      <span className={`text-sm font-semibold tabular-nums ${seat.status === "out" ? "text-zinc-600" : "text-emerald-300"}`}>
        {formatChips(seat.chips)}
      </span>
    </li>
  );
}

function BlindStructure({
  levels,
  currentLevel,
  duration,
}: {
  levels: { sb: number; bb: number; ante: number }[];
  currentLevel: number;
  duration: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (levels.length === 0) return null;
  const visible = expanded ? levels : levels.slice(currentLevel, currentLevel + 3);

  return (
    <div className="p-4 rounded-2xl glass">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-200 transition w-full"
      >
        <Timer className="w-3.5 h-3.5" />
        Estructura de ciegas
        <span className="ml-auto">{expanded ? "▲" : "▼"}</span>
      </button>
      <div className="mt-3 grid grid-cols-4 gap-1 text-[10px] text-zinc-500 uppercase tracking-[0.1em] border-b border-white/5 pb-1">
        <span>Nivel</span><span>SB</span><span>BB</span><span>{duration > 0 ? `${Math.round(duration / 60000)}min` : "Ante"}</span>
      </div>
      <ul className="mt-1">
        {visible.map((lvl, i) => {
          const idx = expanded ? i : currentLevel + i;
          const isCurrent = idx === currentLevel;
          return (
            <li
              key={idx}
              className={`grid grid-cols-4 gap-1 py-1 text-xs ${
                isCurrent ? "text-emerald-300 font-medium" : "text-zinc-400"
              }`}
            >
              <span>{idx + 1}</span>
              <span>{formatChips(lvl.sb)}</span>
              <span>{formatChips(lvl.bb)}</span>
              <span>{lvl.ante > 0 ? formatChips(lvl.ante) : "—"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
