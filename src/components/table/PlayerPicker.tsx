"use client";
import Link from "next/link";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import type { Player } from "@/lib/poker";
import { Avatar } from "@/components/players/Avatar";

export function PlayerPicker({
  players,
  onDeal,
}: {
  players: Player[];
  onDeal: (selected: Player[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 9) next.add(id);
      return next;
    });
  }

  const chosen = players.filter((p) => selected.has(p.id));
  const valid = chosen.length >= 2 && chosen.length <= 9;

  if (players.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-zinc-400 text-sm">
          Aún no hay jugadores. Crea al menos 2 para empezar.
        </p>
        <Link
          href="/players"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/85 hover:bg-accent text-accent-contrast font-medium text-sm transition"
        >
          <UserPlus className="w-4 h-4" />
          Crear jugadores
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-6 py-10">
      <header className="text-center">
        <h2 className="text-xl tracking-tight text-zinc-100">
          Elige de 2 a 9 jugadores
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Seleccionados: {chosen.length}
        </p>
      </header>
      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {players.map((p) => {
          const on = selected.has(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl ring-1 transition text-left ${
                  on
                    ? "bg-accent/10 ring-accent/40"
                    : "bg-white/[0.02] ring-white/10 hover:bg-white/[0.04]"
                }`}
              >
                <Avatar seed={p.seed} size={40} />
                <span className="text-sm text-zinc-100 truncate">{p.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          disabled={!valid}
          onClick={() => onDeal(chosen)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent/85 hover:bg-accent disabled:bg-zinc-800 disabled:text-zinc-400 disabled:ring-1 disabled:ring-white/10 disabled:cursor-not-allowed text-accent-contrast font-medium text-sm transition"
        >
          Repartir
        </button>
        <Link
          href="/players"
          className="text-sm text-zinc-400 hover:text-zinc-200 transition"
        >
          Administrar jugadores →
        </Link>
      </div>
    </div>
  );
}
