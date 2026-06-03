"use client";
// Minimal demo of the authoritative Go game server: connect over WebSocket,
// deal, act, and watch public state + your private hole cards arrive separately.
// Proves the server end-to-end without migrating the whole app. Point
// NEXT_PUBLIC_GAME_WS_URL at the server (http://localhost:8080 in dev).
import { useState } from "react";
import { useGameSocket } from "@/hooks/useGameSocket";

export default function ServerDemoPage() {
  const [room, setRoom] = useState("");
  const [id, setId] = useState("");
  const [joined, setJoined] = useState(false);
  const [amount, setAmount] = useState(20);

  const { connected, error, state, hole, start, action } = useGameSocket(
    joined ? room : null,
    joined ? id : "",
  );

  if (!joined) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-[min(420px,92vw)] flex flex-col gap-3 rounded-3xl bg-zinc-950/80 ring-1 ring-white/10 p-6">
          <h1 className="text-lg font-black text-zinc-100">Demo · servidor de juego</h1>
          <p className="text-xs text-zinc-500">
            Conecta a la mesa autoritativa Go (WebSocket). Abrí esta página en
            2+ pestañas con el mismo código y distinto nombre.
          </p>
          <input
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="Código de sala (ej. TEST)"
            className="px-3 py-2 rounded-xl bg-black/40 ring-1 ring-white/10 text-zinc-100 text-sm outline-none focus:ring-accent-500/40"
          />
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="Tu nombre/id"
            className="px-3 py-2 rounded-xl bg-black/40 ring-1 ring-white/10 text-zinc-100 text-sm outline-none focus:ring-accent-500/40"
          />
          <button
            type="button"
            disabled={!room || !id}
            onClick={() => setJoined(true)}
            className="px-4 py-2 rounded-xl bg-accent-500/20 ring-1 ring-accent-400/40 text-accent-100 font-bold text-sm disabled:opacity-40"
          >
            Conectar
          </button>
        </div>
      </main>
    );
  }

  const yourTurn = state?.toAct === id;

  return (
    <main className="min-h-screen p-6 flex flex-col items-center gap-4">
      <div className="w-[min(640px,94vw)] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest font-black text-zinc-500">
            Sala {room} · {id}
          </span>
          <span className={`text-[10px] font-black uppercase tracking-widest ${connected ? "text-success-400" : "text-warn-400"}`}>
            {connected ? "conectado" : "conectando…"}
          </span>
        </div>

        {error && (
          <div className="rounded-xl bg-warn-500/10 ring-1 ring-warn-400/25 text-warn-200 text-xs px-3 py-2">
            {error}
          </div>
        )}

        <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.08] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs">
            <span className="uppercase tracking-widest font-black text-zinc-500">
              {state ? `Mano #${state.handNum} · ${state.phase}` : "Sin mano"}
            </span>
            <span className="tabular-nums text-zinc-100 font-black">
              Bote {state?.pot ?? 0}
            </span>
          </div>

          <div className="flex items-center gap-1.5 min-h-[2rem]">
            {(state?.board ?? []).length === 0 ? (
              <span className="text-zinc-600 text-sm">— board —</span>
            ) : (
              state!.board.map((c) => (
                <span key={c} className="px-2 py-1 rounded-lg bg-white/10 text-zinc-100 font-mono text-sm">
                  {c}
                </span>
              ))
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest font-black text-zinc-500">Tus cartas:</span>
            {hole ? (
              hole.map((c) => (
                <span key={c} className="px-2 py-1 rounded-lg bg-accent-500/20 ring-1 ring-accent-400/40 text-accent-100 font-mono text-sm">
                  {c}
                </span>
              ))
            ) : (
              <span className="text-zinc-600 text-sm">—</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            {(state?.seats ?? []).map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between text-xs px-2 py-1 rounded-lg ${state?.toAct === s.id ? "bg-accent-500/10 ring-1 ring-accent-400/30" : ""}`}
              >
                <span className="text-zinc-200 font-bold truncate">
                  {s.id} {state?.toAct === s.id ? "•" : ""}
                </span>
                <span className="tabular-nums text-zinc-400">
                  {s.status} · stack {s.chips} · bet {s.bet}
                </span>
              </div>
            ))}
          </div>

          {state?.reveals && Object.keys(state.reveals).length > 0 && (
            <div className="flex flex-col gap-1 text-[11px] text-zinc-400">
              <span className="uppercase tracking-widest font-black text-zinc-500">Showdown</span>
              {Object.entries(state.reveals).map(([sid, cs]) => (
                <span key={sid} className="font-mono">
                  {sid}: {cs.join(" ")}
                </span>
              ))}
            </div>
          )}

          {state?.winners && state.winners.length > 0 && (
            <div className="rounded-xl bg-success-500/10 ring-1 ring-success-400/25 text-success-200 text-xs px-3 py-2">
              Ganador: {state.winners.map((w) => `${w.id} +${w.amount}`).join(" · ")}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={start} className="px-3 py-2 rounded-xl bg-accent-500/20 ring-1 ring-accent-400/40 text-accent-100 font-bold text-xs">
            Repartir mano
          </button>
          <button type="button" disabled={!yourTurn} onClick={() => action("fold")} className="px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-200 text-xs disabled:opacity-30">
            Fold
          </button>
          <button type="button" disabled={!yourTurn} onClick={() => action("check")} className="px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-200 text-xs disabled:opacity-30">
            Check
          </button>
          <button type="button" disabled={!yourTurn} onClick={() => action("call")} className="px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-200 text-xs disabled:opacity-30">
            Call
          </button>
          <button type="button" disabled={!yourTurn} onClick={() => action("raise", amount)} className="px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-200 text-xs disabled:opacity-30">
            Raise
          </button>
          <button type="button" disabled={!yourTurn} onClick={() => action("all-in")} className="px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-200 text-xs disabled:opacity-30">
            All-in
          </button>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            className="w-20 px-2 py-1 rounded-lg bg-black/40 ring-1 ring-white/10 text-zinc-100 text-xs tabular-nums"
          />
        </div>
      </div>
    </main>
  );
}
