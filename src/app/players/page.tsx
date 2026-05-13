"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Player } from "@/lib/poker";
import { usePlayers } from "@/hooks/usePlayers";
import { useStats } from "@/hooks/useStats";
import { useHistory } from "@/hooks/useHistory";
import { PlayerForm } from "@/components/players/PlayerForm";
import { PlayerList } from "@/components/players/PlayerList";

export default function PlayersPage() {
  const { players, add, update, remove, hydrated } = usePlayers();
  const { removePlayer: removeStats } = useStats();
  const { purgePlayer } = useHistory();
  const [editing, setEditing] = useState<Player | null>(null);

  function onSubmit(name: string, seed: string) {
    if (editing) {
      update(editing.id, { name, seed });
      setEditing(null);
    } else {
      add(name, seed);
    }
  }

  const canPlay = players.length >= 2;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-10 flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl tracking-tight text-zinc-100">Jugadores</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Roster local. Persistido en este navegador.
          </p>
        </div>
        {hydrated && canPlay ? (
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/90 hover:bg-emerald-400 text-emerald-950 font-medium text-sm transition"
          >
            Ir a la mesa
            <ArrowRight className="w-4 h-4" />
          </Link>
        ) : null}
      </header>
      <PlayerForm
        editing={editing}
        onSubmit={onSubmit}
        onCancel={() => setEditing(null)}
      />
      {hydrated ? (
        <>
          <PlayerList
            players={players}
            onEdit={(p) => setEditing(p)}
            onDelete={(id) => {
              if (editing?.id === id) setEditing(null);
              remove(id);
              removeStats(id);
              purgePlayer(id);
            }}
          />
          {canPlay ? (
            <div className="flex items-center justify-center pt-2">
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500/90 hover:bg-emerald-400 text-emerald-950 font-medium text-sm transition"
              >
                Ir a la mesa ({players.length} jugadores)
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : players.length === 1 ? (
            <p className="text-center text-xs text-zinc-500">
              Agrega 1 jugador más para poder jugar.
            </p>
          ) : null}
        </>
      ) : (
        <div className="text-sm text-zinc-500 py-8 text-center">Cargando…</div>
      )}
    </div>
  );
}
