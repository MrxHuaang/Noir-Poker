"use client";
import { Eye, EyeOff, BarChart3 } from "lucide-react";
import { useState } from "react";
import type { Card, Seat } from "@/lib/poker";
import { bestHand, categoryLabel } from "@/lib/handEval";
import { Avatar } from "@/components/players/Avatar";

export function EquityPanel({
  seats,
  community,
  equity,
  outs,
  unseenCount,
  showdownDone,
}: {
  seats: Seat[];
  community: Card[];
  equity: Record<string, number>;
  outs: Record<string, number>;
  unseenCount: number;
  showdownDone: boolean;
}) {
  const [hidden, setHidden] = useState(false);
  const active = seats.filter((s) => !s.folded);

  const rows = active
    .map((s) => {
      const eq = equity[s.player.id] ?? 0;
      const o = outs[s.player.id] ?? 0;
      const total = s.hole.length + community.length;
      const score =
        total >= 5 ? bestHand([...s.hole, ...community]) : null;
      return { seat: s, eq, outs: o, score };
    })
    .sort((a, b) => b.eq - a.eq);

  return (
    <aside className="w-full lg:w-72 lg:shrink-0 flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-zinc-100">
          <BarChart3 className="w-4 h-4 text-amber-300" />
          <h3 className="text-sm tracking-tight">Probabilidades</h3>
        </div>
        <button
          type="button"
          onClick={() => setHidden((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-100 transition"
          title={hidden ? "Mostrar" : "Ocultar"}
        >
          {hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {hidden ? "Mostrar" : "Ocultar"}
        </button>
      </header>
      <p className="text-[10px] text-zinc-500 leading-snug">
        Vista privada del host. No mostrar a los jugadores.
      </p>
      {hidden ? (
        <div className="text-xs text-zinc-500 py-4 text-center">
          Información oculta.
        </div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-zinc-500 py-2">
          Reparte una mano para ver equities.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ seat, eq, outs: o, score }) => {
            const pct = Math.round(eq * 1000) / 10;
            return (
              <li
                key={seat.player.id}
                className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.02] ring-1 ring-white/5"
              >
                <Avatar seed={seat.player.seed} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-100 truncate">
                      {seat.player.name}
                    </span>
                    <span className="text-xs font-medium text-zinc-100 tabular-nums">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full bg-amber-400/80"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1 text-[10px] text-zinc-400">
                    <span className="truncate">
                      {score ? categoryLabel(score) : "—"}
                    </span>
                    {!showdownDone && community.length === 4 && o > 0 ? (
                      <span className="text-amber-300 tabular-nums">
                        {o} outs ·{" "}
                        {((o / Math.max(1, unseenCount)) * 100).toFixed(0)}%
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
