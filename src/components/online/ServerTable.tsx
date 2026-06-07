"use client";
// Presentational table for the server-backed online mode. Renders public state
// from the Go server (board, pot, seats, turn) + your private hole, and emits
// actions. No game logic here — the server is authoritative. Reuses PlayingCard.
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Pause, Play, RefreshCw, Trophy, Wifi, WifiOff } from "lucide-react";
import { cardFromId } from "@/lib/poker";
import { PlayingCard } from "@/components/cards/PlayingCard";
import type { ConnStatus, PublicState, RunResult } from "@/hooks/useGameSocket";

function TurnTimer({ deadline }: { deadline?: number }) {
  const [secs, setSecs] = useState<number | null>(null);

  useEffect(() => {
    if (!deadline) {
      setSecs(null);
      return;
    }
    const tick = () => setSecs(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);

  if (secs === null) return null;
  return (
    <span className={`text-[9px] font-black tabular-nums ${secs <= 5 ? "text-warn-400" : "text-zinc-500"}`}>
      {secs}s
    </span>
  );
}

function RunBoards({ runs, nameOf }: { runs: RunResult[]; nameOf: (id: string) => string }) {
  if (runs.length <= 1) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {runs.map((run, i) => (
        <div key={i} className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] px-3 py-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-widest font-black text-zinc-500">Run {i + 1}</span>
            <span className="text-[9px] text-zinc-600 tabular-nums">bote {run.pot}</span>
          </div>
          <Cards ids={run.board} />
          {run.winners.length > 0 && (
            <div className="text-[10px] font-black text-success-300">
              {run.winners.map((w) => `${nameOf(w.id)} +${w.amount}`).join(" · ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Cards({ ids }: { ids: string[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {ids.map((id, i) => {
        const c = cardFromId(id);
        return c ? (
          <PlayingCard key={`${id}-${i}`} card={c} faceUp size="sm" dealIn={false} />
        ) : null;
      })}
    </div>
  );
}

const STATUS_UI: Record<ConnStatus, { label: string; icon: ReactNode; cls: string }> = {
  connected: { label: "conectado", icon: <Wifi className="w-3.5 h-3.5" />, cls: "text-success-400" },
  connecting: { label: "conectando…", icon: <WifiOff className="w-3.5 h-3.5" />, cls: "text-warn-400" },
  reconnecting: { label: "reconectando…", icon: <RefreshCw className="w-3.5 h-3.5 motion-safe:animate-spin" />, cls: "text-warn-400" },
  error: { label: "error", icon: <WifiOff className="w-3.5 h-3.5" />, cls: "text-rose-400" },
};

export function ServerTable({
  state,
  hole,
  uid,
  connected,
  status = connected ? "connected" : "connecting",
  spectator = false,
  onStart,
  onAction,
  onPause,
  onResume,
}: {
  state: PublicState | null;
  hole: string[] | null;
  uid: string | null;
  connected: boolean;
  status?: ConnStatus;
  spectator?: boolean;
  onStart: () => void;
  onAction: (action: string, amount?: number) => void;
  onPause?: () => void;
  onResume?: () => void;
}) {
  const myTurn = !!state && state.toAct === uid;
  const phase = state?.phase ?? "—";
  const idle = !state || state.phase === "idle" || state.phase === "showdown";
  const nameOf = (id: string) =>
    state?.seats.find((s) => s.id === id)?.name || id.slice(0, 6);
  const connUI = STATUS_UI[status];

  return (
    <div className="w-[min(720px,94vw)] mx-auto flex flex-col gap-4">
      {/* Header row: hand info + blinds + conn status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs uppercase tracking-widest font-black text-zinc-500 shrink-0">
            {state ? `Mano #${state.handNum} · ${phase}` : "Sin mano"}
          </span>
          {state && state.sb != null && state.bb != null && (
            <span className="text-[10px] font-black text-zinc-600 tabular-nums">
              Ciegas {state.sb}/{state.bb}
            </span>
          )}
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest shrink-0 ${connUI.cls}`}>
          {connUI.icon}
          {connUI.label}
        </span>
      </div>

      {/* Paused banner */}
      {state?.paused && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-warn-500/10 ring-1 ring-warn-400/30 text-warn-200 text-xs font-black">
          <Pause className="w-3.5 h-3.5 shrink-0" />
          Partida en pausa
        </div>
      )}

      {/* Felt: board + pot */}
      <div className="rounded-3xl bg-accent-950/40 ring-1 ring-accent-400/15 shadow-[inset_0_2px_40px_rgba(0,0,0,0.5)] p-6 flex flex-col items-center gap-4 min-h-[8rem] justify-center">
        <span className="text-[10px] uppercase tracking-[0.3em] font-black text-zinc-500">
          Bote {state?.pot ?? 0}
        </span>
        {state && state.board.length > 0 ? (
          <Cards ids={state.board} />
        ) : (
          <span className="text-zinc-600 text-sm">esperando flop</span>
        )}
        {state?.winners && state.winners.length > 0 && (
          <div className="text-xs font-black text-success-300">
            {state.winners.map((w) => `${nameOf(w.id)} +${w.amount}`).join(" · ")}
          </div>
        )}
      </div>

      {state?.runs && state.runs.length > 1 && (
        <RunBoards runs={state.runs} nameOf={nameOf} />
      )}

      {/* Seats */}
      <div className="flex flex-col gap-1.5">
        {(state?.seats ?? []).map((s) => {
          const reveal = state?.reveals?.[s.id];
          return (
            <div
              key={s.id}
              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-2xl ring-1 ${
                state?.toAct === s.id
                  ? "bg-accent-500/10 ring-accent-400/40"
                  : "bg-white/[0.03] ring-white/[0.06]"
              } ${s.status === "folded" ? "opacity-40" : ""}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-bold text-zinc-100 truncate">
                  {s.name || s.id.slice(0, 6)} {s.id === uid ? "(tú)" : ""}
                </span>
                {state?.toAct === s.id && (
                  <>
                    <span className="text-[9px] uppercase tracking-widest font-black text-accent-300">turno</span>
                    <TurnTimer deadline={state.deadline} />
                  </>
                )}
                {reveal && <Cards ids={reveal} />}
              </div>
              <span className="text-xs tabular-nums text-zinc-400 flex-shrink-0">
                {s.status} · {s.chips} {s.bet > 0 ? `· apuesta ${s.bet}` : ""}
              </span>
            </div>
          );
        })}
      </div>

      {/* Bust-out ranking (tournament mode) */}
      {state?.bustedOrder && state.bustedOrder.length > 0 && (
        <BustRanking order={state.bustedOrder} nameOf={nameOf} />
      )}

      {/* Your hole */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] uppercase tracking-widest font-black text-zinc-500">Tus cartas</span>
        {hole && hole.length > 0 ? <Cards ids={hole} /> : <span className="text-zinc-600 text-sm">—</span>}
      </div>

      {/* Controls — hidden for spectators */}
      {!spectator && (
        <Controls
          idle={idle}
          myTurn={myTurn}
          paused={state?.paused ?? false}
          onStart={onStart}
          onAction={onAction}
          onPause={onPause}
          onResume={onResume}
        />
      )}
    </div>
  );
}

function BustRanking({ order, nameOf }: { order: string[]; nameOf: (id: string) => string }) {
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

function Controls({
  idle,
  myTurn,
  paused,
  onStart,
  onAction,
  onPause,
  onResume,
}: {
  idle: boolean;
  myTurn: boolean;
  paused: boolean;
  onStart: () => void;
  onAction: (action: string, amount?: number) => void;
  onPause?: () => void;
  onResume?: () => void;
}) {
  const btn =
    "px-3 py-2 rounded-xl text-xs font-bold ring-1 transition disabled:opacity-30 disabled:cursor-not-allowed";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onStart}
        className={`${btn} bg-accent-500/20 ring-accent-400/40 text-accent-100 inline-flex items-center gap-1.5`}
      >
        <Play className="w-3.5 h-3.5" /> {idle ? "Repartir mano" : "Reiniciar"}
      </button>
      {paused ? (
        <button
          type="button"
          onClick={onResume}
          className={`${btn} bg-success-500/15 ring-success-400/30 text-success-200 inline-flex items-center gap-1.5`}
        >
          <Play className="w-3.5 h-3.5" /> Reanudar
        </button>
      ) : (
        <button
          type="button"
          onClick={onPause}
          className={`${btn} bg-warn-500/15 ring-warn-400/30 text-warn-200 inline-flex items-center gap-1.5`}
        >
          <Pause className="w-3.5 h-3.5" /> Pausar
        </button>
      )}
      <button type="button" disabled={!myTurn} onClick={() => onAction("fold")} className={`${btn} bg-white/5 ring-white/10 text-zinc-200`}>Fold</button>
      <button type="button" disabled={!myTurn} onClick={() => onAction("check")} className={`${btn} bg-white/5 ring-white/10 text-zinc-200`}>Check</button>
      <button type="button" disabled={!myTurn} onClick={() => onAction("call")} className={`${btn} bg-white/5 ring-white/10 text-zinc-200`}>Call</button>
      <RaiseControl disabled={!myTurn} onAction={onAction} />
      <button type="button" disabled={!myTurn} onClick={() => onAction("all-in")} className={`${btn} bg-white/5 ring-white/10 text-zinc-200`}>All-in</button>
    </div>
  );
}

function RaiseControl({
  disabled,
  onAction,
}: {
  disabled: boolean;
  onAction: (action: string, amount?: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const el = document.getElementById("raise-amt") as HTMLInputElement | null;
          onAction("raise", Number(el?.value) || 0);
        }}
        className="px-3 py-2 rounded-xl text-xs font-bold ring-1 bg-white/5 ring-white/10 text-zinc-200 transition disabled:opacity-30"
      >
        Raise
      </button>
      <input
        id="raise-amt"
        type="number"
        defaultValue={40}
        className="w-20 px-2 py-1.5 rounded-lg bg-black/40 ring-1 ring-white/10 text-zinc-100 text-xs tabular-nums"
      />
    </span>
  );
}
