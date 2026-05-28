"use client";
import { useEffect, useState } from "react";
import { AlertCircle, Shuffle, UserPlus, Check, X } from "lucide-react";
import type { Player } from "@/lib/poker";
import { randomSeed } from "@/lib/dicebear";
import { Avatar } from "./Avatar";

export function PlayerForm({
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
  const [name, setName] = useState("");
  const [seed, setSeed] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setSeed(editing.seed);
    } else {
      setName("");
      setSeed(randomSeed());
    }
    setError(null);
  }, [editing]);

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
    <form
      onSubmit={submit}
      className="flex flex-col items-stretch gap-3 p-4 sm:flex-row sm:items-center"
    >
      <div className="flex items-center gap-3">
        <Avatar seed={seed || "_"} size={48} />
        <button
          type="button"
          onClick={() => setSeed(randomSeed())}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-xs text-zinc-200 transition"
          title="Nuevo avatar"
        >
          <Shuffle className="w-3.5 h-3.5" />
          Avatar
        </button>
      </div>
      <div className="flex flex-col flex-1 gap-1">
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          placeholder="Nombre del jugador"
          maxLength={32}
          className={`px-4 py-2 rounded-full bg-black/30 ring-1 text-zinc-100 placeholder:text-zinc-500 outline-none ${error ? "ring-rose-400/60 focus:ring-rose-400/80" : "ring-white/10 focus:ring-emerald-400/40"}`}
        />
        {error && (
          <span className="flex items-center gap-1 text-[11px] text-rose-400 px-1">
            <AlertCircle className="w-3 h-3 flex-shrink-0" /> {error}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/90 hover:bg-emerald-400 text-emerald-950 font-medium text-sm transition"
        >
          {editing ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          {editing ? "Guardar" : "Agregar"}
        </button>
        {editing && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-transparent hover:bg-white/5 ring-1 ring-white/10 text-zinc-300 text-sm transition"
          >
            <X className="w-4 h-4" />
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}
