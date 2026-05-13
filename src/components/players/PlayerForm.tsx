"use client";
import { useEffect, useState } from "react";
import { Shuffle, UserPlus, Check, X } from "lucide-react";
import type { Player } from "@/lib/poker";
import { randomSeed } from "@/lib/dicebear";
import { Avatar } from "./Avatar";

export function PlayerForm({
  editing,
  onSubmit,
  onCancel,
}: {
  editing?: Player | null;
  onSubmit: (name: string, seed: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [seed, setSeed] = useState("");

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setSeed(editing.seed);
    } else {
      setName("");
      setSeed(randomSeed());
    }
  }, [editing]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name, seed || randomSeed());
    if (!editing) {
      setName("");
      setSeed(randomSeed());
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/10"
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
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre del jugador"
        maxLength={32}
        className="flex-1 px-4 py-2 rounded-full bg-black/30 ring-1 ring-white/10 text-zinc-100 placeholder:text-zinc-500 outline-none focus:ring-emerald-400/40"
      />
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
