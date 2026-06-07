"use client";
// Presentational table for the server-backed online mode. Renders public state
// from the Go server (board, pot, seats, turn) + your private hole, and emits
// actions. No game logic here — the server is authoritative. Reuses PlayingCard.
// Desktop-first (landscape) layout: felt on the left, seats + betting dock right.
import type { ReactNode } from "react";
import { MessageCircle, Pause, Play, RefreshCw, Trophy, Users, Wifi, WifiOff } from "lucide-react";
import { cardFromId } from "@/lib/poker";
import { formatChips } from "@/lib/betting";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { OnlineBettingControls } from "@/components/online/OnlineBettingControls";
import { OnlineTurnTimer } from "@/components/online/OnlineTurnTimer";
import type { ConnStatus, PublicState, RunResult } from "@/hooks/useGameSocket";
import type { OnlineHandRecord } from "@/hooks/useOnlineHistory";
import { categoryLabel } from "@/hooks/useOnlineHistory";
import { useTableChat, CANNED_PHRASES } from "@/hooks/useTableChat";

// ---------------------------------------------------------------------------
// Small reusable pieces
// ---------------------------------------------------------------------------

function Cards({ ids }: { ids: string[] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {ids.map((id, i) => {
        const c = cardFromId(id);
        return c ? (
          <PlayingCard key={`${id}-${i}`} card={c} faceUp size="sm" dealIn={false} />
        ) : null;
      })}
    </div>
  );
}

// Hole cards for the current player in the online table.
// Face-down by default; squeezable to peek. Revealed at showdown.
function SqueezableHole({ ids, revealed }: { ids: string[]; revealed: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ids.map((id, i) => {
        const c = cardFromId(id);
        return c ? (
          <PlayingCard
            key={`hole-${id}-${i}`}
            card={c}
            faceUp={revealed}
            size="md"
            dealIn={false}
            squeezable={!revealed}
          />
        ) : null;
      })}
    </div>
  );
}

function RunBoards({
  runs,
  nameOf,
}: {
  runs: RunResult[];
  nameOf: (id: string) => string;
}) {
  if (runs.length <= 1) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {runs.map((run, i) => (
        <div
          key={i}
          className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] px-3 py-2 flex flex-col gap-1.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-widest font-black text-zinc-500">
              Run {i + 1}
            </span>
            <span className="text-[9px] text-zinc-600 tabular-nums">
              bote {formatChips(run.pot)}
            </span>
          </div>
          <Cards ids={run.board} />
          {run.winners.length > 0 && (
            <div className="text-[10px] font-black text-success-300">
              {run.winners.map((w) => `${nameOf(w.id)} +${formatChips(w.amount)}`).join(" · ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BustRanking({
  order,
  nameOf,
}: {
  order: string[];
  nameOf: (id: string) => string;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] px-3 py-2 flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-widest font-black text-zinc-500 flex items-center gap-1.5">
        <Trophy className="w-3 h-3" /> Eliminados
      </span>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {order.map((id, i) => (
          <span key={id} className="text-[10px] tabular-nums text-zinc-400">
            {i + 1}. {nameOf(id)}
          </span>
        ))}
      </div>
    </div>
  );
}

const STATUS_UI: Record<ConnStatus, { label: string; icon: ReactNode; cls: string }> = {
  connected: {
    label: "conectado",
    icon: <Wifi className="w-3.5 h-3.5" />,
    cls: "text-success-400",
  },
  connecting: {
    label: "conectando…",
    icon: <WifiOff className="w-3.5 h-3.5" />,
    cls: "text-warn-400",
  },
  reconnecting: {
    label: "reconectando…",
    icon: <RefreshCw className="w-3.5 h-3.5 motion-safe:animate-spin" />,
    cls: "text-warn-400",
  },
  error: {
    label: "error",
    icon: <WifiOff className="w-3.5 h-3.5" />,
    cls: "text-rose-400",
  },
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function ServerTable({
  code,
  state,
  hole,
  uid,
  connected,
  status = connected ? "connected" : "connecting",
  spectator = false,
  history = [],
  onStart,
  onAction,
  onPause,
  onResume,
}: {
  code?: string | null;
  state: PublicState | null;
  hole: string[] | null;
  uid: string | null;
  connected: boolean;
  status?: ConnStatus;
  spectator?: boolean;
  history?: OnlineHandRecord[];
  onStart: () => void;
  onAction: (action: string, amount?: number) => void;
  onPause?: () => void;
  onResume?: () => void;
}) {
  const { send: chatSend, activePhrases } = useTableChat(code ?? null, uid);
  const myTurn = !!state && state.toAct === uid;
  const phase = state?.phase ?? "—";
  const idle = !state || state.phase === "idle" || state.phase === "showdown";
  const waiting =
    !state ||
    state.phase === "idle" ||
    (state.seats.filter((s) => s.status !== "sitting-out").length < 2 &&
      state.phase === "idle");
  const nameOf = (id: string) =>
    state?.seats.find((s) => s.id === id)?.name ?? id.slice(0, 6);
  const connUI = STATUS_UI[status];

  return (
    <div className="w-[min(1200px,96vw)] mx-auto flex flex-col gap-3">
      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs uppercase tracking-widest font-black text-zinc-500 shrink-0">
            {state ? `Mano #${state.handNum} · ${phase}` : "—"}
          </span>
          {state && state.sb != null && state.bb != null && (
            <span className="text-[10px] font-black text-zinc-600 tabular-nums shrink-0">
              Ciegas {formatChips(state.sb)}/{formatChips(state.bb)}
            </span>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest shrink-0 ${connUI.cls}`}
        >
          {connUI.icon}
          {connUI.label}
        </span>
      </div>

      {/* ── Paused banner ───────────────────────────────────────────────── */}
      {state?.paused && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-warn-500/10 ring-1 ring-warn-400/30 text-warn-200 text-xs font-black">
          <Pause className="w-3.5 h-3.5 shrink-0" />
          Partida en pausa
        </div>
      )}

      {/* ── Two-column desktop layout ────────────────────────────────────
          Single column on small screens (shouldn't happen — EPIC-0 gates to
          desktop-only, but keep responsive so SSR / preview don't break).   */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">

        {/* ── LEFT: Felt ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="rounded-3xl bg-accent-950/40 ring-1 ring-accent-400/15 shadow-[inset_0_2px_40px_rgba(0,0,0,0.5)] p-8 flex flex-col items-center gap-5 min-h-[220px] justify-center">
            {/* Pot */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] uppercase tracking-[0.3em] font-black text-zinc-500">
                Bote
              </span>
              <span className="text-3xl font-black tabular-nums text-zinc-100">
                {formatChips(state?.pot ?? 0)}
              </span>
            </div>

            {/* Board cards */}
            {state && state.board.length > 0 ? (
              <Cards ids={state.board} />
            ) : waiting ? (
              <WaitingPlaceholder status={status} seats={state?.seats ?? []} />
            ) : (
              <span className="text-zinc-600 text-sm">esperando flop</span>
            )}

            {/* Winners */}
            {state?.winners && state.winners.length > 0 && (
              <div className="text-sm font-black text-success-300">
                {state.winners
                  .map((w) => `${nameOf(w.id)} +${formatChips(w.amount)}`)
                  .join(" · ")}
              </div>
            )}
          </div>

          {/* Run-it boards */}
          {state?.runs && state.runs.length > 1 && (
            <RunBoards runs={state.runs} nameOf={nameOf} />
          )}

          {/* Hand history */}
          {history.length > 0 && (
            <HandHistoryPanel records={history} nameOf={nameOf} />
          )}
        </div>

        {/* ── RIGHT: Seats + dock ────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {/* Seat list */}
          <div className="flex flex-col gap-1.5">
            {(state?.seats ?? []).map((s) => {
              const reveal = state?.reveals?.[s.id];
              const isActive = state?.toAct === s.id;
              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-between gap-3 px-3 py-2 rounded-2xl ring-1 transition-colors ${
                    isActive
                      ? "bg-accent-500/10 ring-accent-400/40"
                      : "bg-white/[0.03] ring-white/[0.06]"
                  } ${s.status === "folded" ? "opacity-40" : ""}`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-zinc-100 truncate">
                        {s.name || s.id.slice(0, 6)}
                        {s.id === uid && (
                          <span className="ml-1 text-zinc-500 font-normal">(tú)</span>
                        )}
                      </span>
                      {isActive && (
                        <span className="text-[9px] uppercase tracking-widest font-black text-accent-300 shrink-0">
                          turno
                        </span>
                      )}
                      {reveal && <Cards ids={reveal} />}
                    </div>
                    {activePhrases[s.id] && (
                      <span className="text-[10px] font-bold text-accent-200 bg-accent-500/15 ring-1 ring-accent-400/25 rounded-xl px-2 py-0.5 w-fit max-w-[180px] truncate">
                        {activePhrases[s.id]}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.bet > 0 && (
                      <span className="text-[10px] tabular-nums text-accent-300 font-bold">
                        {formatChips(s.bet)}
                      </span>
                    )}
                    <span className="text-xs tabular-nums text-zinc-400">
                      {formatChips(s.chips)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bust-out ranking (tournament) */}
          {state?.bustedOrder && state.bustedOrder.length > 0 && (
            <BustRanking order={state.bustedOrder} nameOf={nameOf} />
          )}

          {/* My hole cards — shown face-down for privacy, squeeze to peek */}
          {!spectator && (
            <div className="flex items-center gap-3 px-1">
              <span className="text-[10px] uppercase tracking-widest font-black text-zinc-500 shrink-0">
                Tus cartas
              </span>
              {hole && hole.length > 0 ? (
                <SqueezableHole ids={hole} revealed={state?.phase === "showdown"} />
              ) : (
                <span className="text-zinc-600 text-sm">—</span>
              )}
            </div>
          )}

          {/* Canned-phrase picker */}
          {!spectator && uid && (
            <div className="flex flex-col gap-1.5 px-1">
              <span className="text-[9px] uppercase tracking-widest font-black text-zinc-600 flex items-center gap-1.5">
                <MessageCircle className="w-3 h-3" /> Reacciones
              </span>
              <div className="flex flex-wrap gap-1.5">
                {CANNED_PHRASES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => chatSend(p)}
                    className="text-[10px] font-bold px-2 py-1 rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08] text-zinc-400 hover:bg-accent-500/15 hover:ring-accent-400/30 hover:text-accent-200 transition"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Betting dock — only when it's my turn and not paused */}
          {!spectator && myTurn && state && uid && !state.paused && (
            <div className="glass-panel rounded-[24px] p-3">
              <OnlineBettingControls
                state={state}
                uid={uid}
                onAction={onAction}
              />
            </div>
          )}

          {/* Waiting timer — when not my turn but turn is live */}
          {!spectator && !myTurn && state?.toAct && state.deadline && !state.paused && (
            <div className="px-1">
              <OnlineTurnTimer deadline={state.deadline} />
            </div>
          )}

          {/* Room controls */}
          {!spectator && (
            <RoomControls
              idle={idle}
              paused={state?.paused ?? false}
              onStart={onStart}
              onPause={onPause}
              onResume={onResume}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hand history panel (last 50 hands from Supabase)
// ---------------------------------------------------------------------------

function HandHistoryPanel({
  records,
  nameOf,
}: {
  records: OnlineHandRecord[];
  nameOf: (id: string) => string;
}) {
  const shown = records.slice(0, 10);
  return (
    <div className="rounded-2xl bg-white/[0.02] ring-1 ring-white/[0.05] px-3 py-2 flex flex-col gap-2">
      <span className="text-[9px] uppercase tracking-widest font-black text-zinc-500">
        Historial ({records.length})
      </span>
      <div className="flex flex-col gap-1">
        {shown.map((r) => {
          const winnerNames = (r.winners ?? [])
            .map((w) => {
              const name = r.seat_names?.[w.id] ?? nameOf(w.id);
              return `${name} +${formatChips(w.amount)}`;
            })
            .join(" · ");
          const cats = r.categories
            ? Object.values(r.categories)
                .map((c) => categoryLabel(c))
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(", ")
            : null;
          return (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 text-[10px]"
            >
              <span className="text-zinc-500 tabular-nums shrink-0">
                #{r.hand_num}
              </span>
              <span className="text-zinc-300 truncate flex-1">{winnerNames}</span>
              {cats && (
                <span className="text-zinc-600 shrink-0">{cats}</span>
              )}
              <span className="text-zinc-600 tabular-nums shrink-0">
                {formatChips(r.pot)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waiting placeholder shown in the felt when no hand is live
// ---------------------------------------------------------------------------

function WaitingPlaceholder({
  status,
  seats,
}: {
  status: ConnStatus;
  seats: PublicState["seats"];
}) {
  if (status === "connecting" || status === "reconnecting") {
    return (
      <div className="flex flex-col items-center gap-2 text-zinc-500">
        <RefreshCw className="w-5 h-5 motion-safe:animate-spin" />
        <span className="text-sm">
          {status === "reconnecting" ? "Reconectando…" : "Conectando…"}
        </span>
      </div>
    );
  }
  const activePlayers = seats.filter((s) => s.status !== "sitting-out").length;
  if (activePlayers < 2) {
    return (
      <div className="flex flex-col items-center gap-2 text-zinc-500">
        <Users className="w-5 h-5" />
        <span className="text-sm">Esperando jugadores…</span>
        <span className="text-[11px] text-zinc-600">
          {activePlayers} / 2 mínimo
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1 text-zinc-600">
      <span className="text-sm">Pulsa Repartir para empezar</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Room-level controls (start / pause / resume) — non-spectators only
// ---------------------------------------------------------------------------

function RoomControls({
  idle,
  paused,
  onStart,
  onPause,
  onResume,
}: {
  idle: boolean;
  paused: boolean;
  onStart: () => void;
  onPause?: () => void;
  onResume?: () => void;
}) {
  const btn =
    "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold ring-1 transition";
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <button
        type="button"
        onClick={onStart}
        className={`${btn} bg-accent-500/20 ring-accent-400/40 text-accent-100`}
      >
        <Play className="w-3.5 h-3.5" />
        {idle ? "Repartir mano" : "Reiniciar"}
      </button>

      {paused ? (
        <button
          type="button"
          onClick={onResume}
          className={`${btn} bg-success-500/15 ring-success-400/30 text-success-200`}
        >
          <Play className="w-3.5 h-3.5" />
          Reanudar
        </button>
      ) : (
        <button
          type="button"
          onClick={onPause}
          className={`${btn} bg-warn-500/15 ring-warn-400/30 text-warn-200`}
        >
          <Pause className="w-3.5 h-3.5" />
          Pausar
        </button>
      )}
    </div>
  );
}
