"use client";
import { Crown, X } from "lucide-react";
import type { Player } from "@/lib/poker";
import { CATEGORY_LABEL, type Category } from "@/lib/handEval";
import type { RunOne } from "@/hooks/useEquity";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { Avatar } from "@/components/players/Avatar";

export function RunResults({
  runs,
  players,
  onClose,
}: {
  runs: RunOne[];
  players: Player[];
  onClose: () => void;
}) {

  const byId = new Map(players.map((p) => [p.id, p]));
  const tallies = new Map<string, number>();
  for (const r of runs) {
    for (const w of r.winners) tallies.set(w, (tallies.get(w) || 0) + 1);
  }
  const ranked = [...tallies.entries()]
    .map(([id, c]) => ({ player: byId.get(id), wins: c }))
    .filter((r) => r.player)
    .sort((a, b) => b.wins - a.wins);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="custom-scrollbar w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-zinc-950/95 ring-1 ring-white/10 p-6 flex flex-col gap-5"
      >
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-300" />
            <h2 className="text-lg tracking-tight text-zinc-100">
              Resultados de {runs.length} run{runs.length === 1 ? "" : "s"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/5 text-zinc-400 transition"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {ranked.length > 0 ? (
          <section className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Agregado
            </span>
            <ul className="flex flex-wrap gap-2">
              {ranked.map(({ player, wins }, i) => (
                <li
                  key={player!.id}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ring-1 ${
                    i === 0
                      ? "bg-amber-300/10 ring-amber-300/40 text-amber-100"
                      : "bg-white/[0.03] ring-white/10 text-zinc-100"
                  }`}
                >
                  <Avatar seed={player!.seed} size={22} />
                  <span className="text-sm">{player!.name}</span>
                  <span className="text-xs tabular-nums opacity-80">
                    {wins}/{runs.length}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <ul className="flex flex-col gap-3">
          {runs.map((r, i) => {
            const winners = r.winners
              .map((id) => byId.get(id)?.name)
              .filter(Boolean) as string[];
            return (
              <li
                key={i}
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-2xl bg-white/[0.03] ring-1 ring-white/10"
                style={{ animationDelay: `${i * 70}ms`, animationFillMode: "both" }}
              >
                <span className="text-xs text-zinc-500 w-12 shrink-0 tabular-nums">
                  Run {i + 1}
                </span>
                <div className="flex gap-1.5 items-center">
                  {r.community.map((c, j) => (
                    <PlayingCard key={j} card={c} faceUp dealIn={false} size="sm" />
                  ))}
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <span className="text-sm text-amber-100">
                    {winners.length > 1 ? "Empate: " : "Gana "}
                    <span className="font-medium">{winners.join(" · ")}</span>
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {CATEGORY_LABEL[r.category as Category]}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-amber-700/70 hover:bg-amber-600/75 text-amber-100 font-medium text-sm transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
