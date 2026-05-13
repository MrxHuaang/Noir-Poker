"use client";
import { Pencil, Trash2 } from "lucide-react";
import type { Player } from "@/lib/poker";
import { Avatar } from "./Avatar";

export function PlayerList({
  players,
  onEdit,
  onDelete,
}: {
  players: Player[];
  onEdit: (p: Player) => void;
  onDelete: (id: string) => void;
}) {
  if (players.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-zinc-500">
        No hay jugadores aún. Agrega el primero arriba.
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {players.map((p) => (
        <li
          key={p.id}
          className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] ring-1 ring-white/10"
        >
          <Avatar seed={p.seed} size={48} />
          <div className="flex-1 min-w-0">
            <div className="text-zinc-100 text-sm truncate">{p.name}</div>
            <div className="text-zinc-500 text-[11px] truncate">
              {p.seed}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onEdit(p)}
            className="p-2 rounded-full hover:bg-white/5 ring-1 ring-white/10 text-zinc-300 transition"
            title="Editar"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(p.id)}
            className="p-2 rounded-full hover:bg-rose-500/10 ring-1 ring-white/10 text-rose-300 transition"
            title="Eliminar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
