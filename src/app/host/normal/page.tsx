"use client";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  Copy,
  Palette,
  Settings,
  Users,
  Play,
  SkipForward,
  Trophy,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNormalLobby, useNormalRoom } from "@/hooks/useNormalRoom";
import { useNormalGame } from "@/hooks/useNormalGame";
import {
  createNormalRoom,
  setNormalRoomTheme,
  postPlayerAction,
} from "@/lib/normalRooms";
import { TableThemePicker } from "@/components/themes/TableThemePicker";
import { Avatar } from "@/components/players/Avatar";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { PotDisplay } from "@/components/betting/PotDisplay";
import { TurnTimer } from "@/components/betting/TurnTimer";
import type { TableThemeId } from "@/lib/themes";
import { getTableTheme } from "@/lib/themes";
import { formatChips, type NormalSeat } from "@/lib/betting";
import { CATEGORY_LABEL } from "@/lib/handEval";
import type { Card } from "@/lib/poker";
import { DEFAULT_CONFIG } from "@/lib/betting";
import type { RoomConfig } from "@/lib/betting";
import { NormalConfigPanel } from "@/components/betting/NormalConfigPanel";

export default function HostNormalPage() {
  const { uid, loading } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<RoomConfig>(DEFAULT_CONFIG);
  const [holeCards] = useState<Record<string, [Card, Card]>>({});

  const room = useNormalRoom(code);
  const lobby = useNormalLobby(code);
  const { gameState, startNewHand, resolveShowdown, isProcessing } =
    useNormalGame(code, room ?? null, lobby, uid, holeCards);

  useEffect(() => {
    if (loading || !uid || code || creating) return;
    setCreating(true);
    createNormalRoom(uid, { ...DEFAULT_CONFIG, mode: "normal" })
      .then(setCode)
      .catch(() => {})
      .finally(() => setCreating(false));
  }, [loading, uid, code, creating]);

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

  const theme = (room?.theme as TableThemeId) ?? "emerald";
  const t = getTableTheme(theme);

  if (loading || !code) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 py-10 text-center text-zinc-500 text-sm">
        Creando sala…
      </div>
    );
  }

  const canDeal =
    !gameState && lobby.length >= 2 && lobby.length <= 9;
  const gs = gameState;
  const result = room?.result;
  const isShowdown = gs?.phase === "showdown";

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
              Sala Normal
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
              {lobby.length} en sala
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => { setShowConfig((v) => !v); setShowTheme(false); }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass ring-white/10 text-xs text-zinc-200 hover:bg-white/10 btn-press transition"
          >
            <Settings className="w-3.5 h-3.5" /> Config
          </button>
          <button
            type="button"
            onClick={() => { setShowTheme((v) => !v); setShowConfig(false); }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass ring-white/10 text-xs text-zinc-200 hover:bg-white/10 btn-press transition"
          >
            <Palette className="w-3.5 h-3.5" /> Tema
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

      {/* Game area */}
      {!gs ? (
        /* Lobby */
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-300">
                Jugadores en sala ({lobby.length})
              </span>
            </div>
            <button
              type="button"
              disabled={!canDeal || isProcessing}
              onClick={startNewHand}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500/90 hover:bg-emerald-400 disabled:opacity-30 text-emerald-950 font-medium text-sm btn-press transition"
            >
              <Play className="w-4 h-4" /> Repartir
            </button>
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {lobby.map((p) => (
              <li
                key={p.uid}
                className="flex items-center gap-2 p-3 rounded-2xl glass"
              >
                <Avatar seed={p.seed} size={32} />
                <span className="text-sm text-zinc-100 truncate">{p.name}</span>
              </li>
            ))}
          </ul>
          {lobby.length < 2 && (
            <p className="text-xs text-zinc-500 text-center">
              Esperando jugadores…
            </p>
          )}
        </div>
      ) : (
        /* Game */
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Table */}
          <div className="flex-1 flex flex-col gap-4 items-center">
            {/* Community */}
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
                  <PlayingCard key={`empty-${i}`} faceUp={false} size="md" dealIn={false} />
                ))}
              </div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                {gs.street} · {gs.phase}
              </div>
            </div>

            {/* Players */}
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

            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap justify-center">
              {isShowdown && !result && (
                <button
                  type="button"
                  onClick={resolveShowdown}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-500/90 hover:bg-amber-400 text-amber-950 font-medium text-sm btn-press transition"
                >
                  <Trophy className="w-4 h-4" /> Resolver
                </button>
              )}
              {result && (
                <button
                  type="button"
                  onClick={startNewHand}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500/90 hover:bg-emerald-400 text-emerald-950 font-medium text-sm btn-press transition"
                >
                  <SkipForward className="w-4 h-4" /> Nueva mano
                </button>
              )}
            </div>

            {result && (
              <div className="px-5 py-3 rounded-2xl bg-amber-300/10 ring-1 ring-amber-300/40 text-amber-100 text-sm text-center">
                <Trophy className="inline w-4 h-4 text-amber-300 mr-1" />
                {result.winners
                  .map(
                    (id) => gs.seats.find((s) => s.id === id)?.name ?? id,
                  )
                  .join(" · ")} — {CATEGORY_LABEL[result.category]}
              </div>
            )}
          </div>

          {/* Sidebar: host can see all hole cards (presencial-style) */}
          <aside className="w-full lg:w-64 flex flex-col gap-3">
            <h3 className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Botes
            </h3>
            <div className="p-3 rounded-2xl glass text-center">
              <span className="text-2xl font-semibold text-amber-200 tabular-nums">
                {formatChips(gs.betting.pot)}
              </span>
            </div>
            <h3 className="text-xs uppercase tracking-[0.2em] text-zinc-500 mt-2">
              Chips
            </h3>
            <ul className="flex flex-col gap-1.5">
              {gs.seats.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between px-3 py-2 rounded-xl glass text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Avatar seed={s.seed} size={20} />
                    <span className="text-zinc-100">{s.name}</span>
                  </div>
                  <span
                    className={`tabular-nums font-medium ${
                      s.status === "folded"
                        ? "text-zinc-500"
                        : s.status === "all-in"
                        ? "text-amber-300"
                        : "text-emerald-300"
                    }`}
                  >
                    {s.status === "folded"
                      ? "Fold"
                      : s.status === "all-in"
                      ? `All-in (${formatChips(s.chips)})`
                      : formatChips(s.chips)}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
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
          : seat.status === "folded"
          ? "bg-white/[0.01] ring-white/5 opacity-50"
          : "glass ring-white/8"
      }`}
    >
      <Avatar seed={seat.seed} size={32} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-100 truncate">{seat.name}</span>
          {isToAct && (
            <span className="text-[10px] uppercase tracking-[0.15em] text-emerald-300 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
              Turno
            </span>
          )}
          {seat.status === "all-in" && (
            <span className="text-[10px] uppercase tracking-[0.15em] text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded-full">
              All-in
            </span>
          )}
        </div>
        {isToAct && seat.turnDeadline && (
          <TurnTimer
            deadline={seat.turnDeadline}
            turnTime={turnTime}
            timeBank={seat.timeBank}
          />
        )}
      </div>
      <div className="flex flex-col items-end text-right">
        <span className="text-sm font-medium text-zinc-100 tabular-nums">
          {formatChips(seat.chips)}
        </span>
        {seat.bet > 0 && (
          <span className="text-[11px] text-zinc-500 tabular-nums">
            +{formatChips(seat.bet)}
          </span>
        )}
      </div>
    </li>
  );
}

void postPlayerAction; // imported for phone actions
