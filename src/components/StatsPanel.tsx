"use client";
import { Trophy, RotateCcw } from "lucide-react";
import type { Player } from "@/lib/poker";
import { Avatar } from "@/components/players/Avatar";
import { useStats } from "@/hooks/useStats";

export function StatsPanel({
  players,
  highlightIds = [],
}: {
  players: Player[];
  highlightIds?: string[];
}) {
  const { stats, reset } = useStats();
  const byId = new Map(players.map((p) => [p.id, p]));
  const rows = Object.entries(stats)
    .filter(([id]) => byId.has(id))
    .map(([id, wins]) => ({ player: byId.get(id)!, wins }))
    .sort((a, b) => b.wins - a.wins || a.player.name.localeCompare(b.player.name));
  const total = rows.reduce((s, r) => s + r.wins, 0);
  const max = rows[0]?.wins || 0;

  return (
    <aside className="w-full lg:w-72 lg:shrink-0 flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-zinc-100">
          <Trophy className="w-4 h-4 text-amber-300" />
          <h3 className="text-sm tracking-tight">Historial</h3>
        </div>
        {total > 0 ? (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-100 transition"
            title="Reiniciar historial"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        ) : null}
      </header>
      <p className="text-[11px] text-zinc-500">
        {total === 0
          ? "Aún sin manos jugadas."
          : `${total} mano${total === 1 ? "" : "s"} resuelta${total === 1 ? "" : "s"}.`}
      </p>
      {rows.length === 0 ? (
        <div className="text-xs text-zinc-500 py-2">
          Reparte una mano para empezar.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ player, wins }) => {
            const pct = max ? (wins / max) * 100 : 0;
            const isHi = highlightIds.includes(player.id);
            return (
              <li
                key={player.id}
                className={`relative flex items-center gap-2 p-2 rounded-xl ring-1 transition ${
                  isHi
                    ? "bg-amber-300/10 ring-amber-300/40"
                    : "bg-white/[0.02] ring-white/5"
                }`}
              >
                <Avatar seed={player.seed} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-100 truncate">
                    {player.name}
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={`h-full ${isHi ? "bg-amber-300" : "bg-amber-600/50"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm font-medium text-zinc-100 tabular-nums">
                  {wins}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
