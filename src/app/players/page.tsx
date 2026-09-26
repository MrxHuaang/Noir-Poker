"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertCircle, ArrowRight, Check, Shuffle, UserPlus } from "lucide-react";
import type { Player } from "@/lib/poker";
import { usePlayers } from "@/hooks/usePlayers";
import { useStats } from "@/hooks/useStats";
import { useHistory } from "@/hooks/useHistory";
import { Avatar } from "@/components/players/Avatar";
import { randomSeed } from "@/lib/dicebear";

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

  function onDelete(id: string) {
    if (editing?.id === id) setEditing(null);
    remove(id);
    removeStats(id);
    purgePlayer(id);
  }

  const canPlay = players.length >= 2;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pt-14 pb-24 sm:px-8 sm:pt-20">
      <header className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-8">
          <p className="eyebrow mb-6 flex items-center gap-2">
            <span className="suit text-sm" aria-hidden>
              ♣
            </span>
            Modo presencial
          </p>
          <h1 className="display text-5xl text-primary sm:text-6xl lg:text-7xl">Jugadores</h1>
          <p className="mt-6 max-w-[48ch] text-base leading-relaxed text-secondary">
            Lista local, guardada en este navegador. Hacen falta dos jugadores para abrir la mesa.
          </p>
        </div>
        {hydrated && canPlay ? (
          <div className="lg:col-span-4 lg:justify-self-end">
            <Link href="/host" className="btn-primary">
              Ir a la mesa
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : null}
      </header>

      {hydrated ? (
        <>
          <section aria-label={editing ? "Editar jugador" : "Nuevo jugador"} className="mt-14 border-t border-line pt-8">
            <RosterForm
              key={editing?.id ?? "new"}
              editing={editing}
              onSubmit={onSubmit}
              onCancel={() => setEditing(null)}
              existingNames={players.map((p) => p.name)}
            />
          </section>

          <section aria-labelledby="roster-title" className="mt-16">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h2 id="roster-title" className="eyebrow">
                En la mesa
              </h2>
              <p className="text-sm text-muted">
                <span className="numeric text-primary">{players.length}</span>{" "}
                {players.length === 1 ? "jugador" : "jugadores"}
              </p>
            </div>

            {players.length === 0 ? (
              <div className="border-t border-line py-12">
                <p className="font-display text-2xl text-secondary sm:text-3xl">
                  No hay jugadores aún.
                </p>
                <p className="mt-2 text-sm text-muted">Agrega el primero arriba.</p>
              </div>
            ) : (
              <ol className="border-t border-line">
                {players.map((p, i) => {
                  const isEditing = editing?.id === p.id;
                  return (
                    <li
                      key={p.id}
                      className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-line px-2 py-4 transition-colors sm:grid-cols-[2.5rem_auto_minmax(0,1fr)_auto] sm:px-4 ${
                        isEditing ? "bg-bone/[0.04]" : "hover:bg-bone/[0.025]"
                      }`}
                    >
                      <span className="numeric hidden text-xs text-muted sm:inline">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Avatar seed={p.seed} size={44} className="rounded-[10px]!" />
                      <div className="min-w-0">
                        <div className="truncate font-display text-2xl leading-tight text-primary">
                          {p.name}
                        </div>
                        <div className="numeric truncate text-[11px] text-muted">
                          {isEditing ? "Editando" : p.seed}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(p)}
                          aria-label={`Editar a ${p.name}`}
                          className="rounded-lg px-2.5 py-2 text-sm text-bone-dim transition-colors hover:bg-bone/[0.05] hover:text-bone"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(p.id)}
                          aria-label={`Eliminar a ${p.name}`}
                          className="rounded-lg px-2.5 py-2 text-sm text-[color:var(--text-muted)] transition-colors hover:bg-rose-400/10 hover:text-rose-300"
                        >
                          Eliminar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {canPlay ? (
              <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-muted">Todo listo. La mesa se abre en la pantalla grande.</p>
                <Link href="/host" className="btn-primary">
                  <span>
                    Ir a la mesa (<span className="numeric">{players.length}</span> jugadores)
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : players.length === 1 ? (
              <p className="mt-6 text-sm text-muted">Agrega 1 jugador más para poder jugar.</p>
            ) : null}
          </section>
        </>
      ) : (
        <p role="status" className="mt-14 border-t border-line pt-8 text-sm text-muted">
          Cargando…
        </p>
      )}
    </div>
  );
}

// Alta / edicion de un jugador. Se remonta (key) al cambiar el jugador en
// edicion, asi arranca con sus datos o con un avatar nuevo sin efectos.
function RosterForm({
  editing,
  onSubmit,
  onCancel,
  existingNames = [],
}: {
  editing?: Player | null;
  onSubmit: (name: string, seed: string) => void;
  onCancel?: () => void;
  existingNames?: string[];
}) {
  const [name, setName] = useState(() => editing?.name ?? "");
  const [seed, setSeed] = useState(() => editing?.seed ?? randomSeed());
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("El nombre es requerido.");
      return;
    }
    const isDuplicate = existingNames.some(
      (n) => n.toLowerCase() === name.trim().toLowerCase() && name.trim() !== editing?.name,
    );
    if (isDuplicate) {
      setError("Ya existe un jugador con ese nombre.");
      return;
    }
    setError(null);
    onSubmit(name.trim(), seed || randomSeed());
    if (!editing) {
      setName("");
      setSeed(randomSeed());
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <div className="flex items-center gap-4 sm:pt-6">
        <Avatar seed={seed || "_"} size={56} className="rounded-[10px]!" />
        <button
          type="button"
          onClick={() => setSeed(randomSeed())}
          title="Nuevo avatar"
          className="btn-link inline-flex items-center gap-1.5 text-sm"
        >
          <Shuffle className="h-3.5 w-3.5" aria-hidden />
          Otro avatar
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor="player-name" className="eyebrow">
          {editing ? "Editar jugador" : "Nuevo jugador"}
        </label>
        <input
          id="player-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="Nombre del jugador"
          maxLength={32}
          aria-invalid={!!error}
          aria-describedby={error ? "player-name-error" : undefined}
          className={`field ${error ? "border-rose-400/60!" : ""}`}
        />
        {error && (
          <p id="player-name-error" role="alert" className="flex items-center gap-1.5 text-xs text-rose-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 sm:pt-6">
        <button type="submit" className="btn-primary">
          {editing ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {editing ? "Guardar" : "Agregar"}
        </button>
        {editing && onCancel ? (
          <button type="button" onClick={onCancel} className="btn-quiet">
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}
