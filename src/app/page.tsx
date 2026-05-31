"use client";
import Link from "next/link";
import {
  Plus,
  KeyRound,
  Users,
  Lock,
  Coins,
  Trophy,
  Tv,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/hooks/useAuth";
import { useOpenRooms } from "@/hooks/useNormalRoom";
import { formatChips } from "@/lib/betting";
import type { OpenRoomSummary } from "@/lib/normalRooms";

const STATUS: Record<
  OpenRoomSummary["status"],
  { label: string; cls: string }
> = {
  waiting: { label: "Esperando", cls: "bg-accent/15 text-accent ring-accent/30" },
  playing: { label: "En juego", cls: "bg-sky-500/15 text-sky-300 ring-sky-400/30" },
  full: { label: "Llena", cls: "bg-rose-500/15 text-rose-300 ring-rose-400/30" },
};

export default function Lobby() {
  const { uid } = useAuth();
  const { rooms, ready } = useOpenRooms(!!uid);

  return (
    <div className="relative z-[2] w-full max-w-3xl mx-auto px-4 py-10 sm:py-14 flex flex-col gap-8">
      {/* Header */}
      <header className="flex flex-col items-center gap-3 text-center">
        <Logo size={52} />
        <h1 className="text-3xl sm:text-4xl tracking-tight text-zinc-50 font-semibold">
          Noir
        </h1>
        <p className="text-sm text-zinc-500 max-w-md">
          Texas Hold&apos;em multi-dispositivo. Entra a una mesa abierta o crea la
          tuya con tus reglas.
        </p>
      </header>

      {/* Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/create"
          className="group flex items-center justify-between gap-3 p-4 rounded-2xl bg-accent text-black font-semibold transition btn-press hover:brightness-110 shadow-lg"
        >
          <span className="flex items-center gap-3">
            <Plus className="w-5 h-5" />
            Crear mesa
          </span>
          <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-0.5 transition" />
        </Link>
        <Link
          href="/join"
          className="group flex items-center justify-between gap-3 p-4 rounded-2xl glass hover:bg-white/[0.06] transition btn-press"
        >
          <span className="flex items-center gap-3 text-zinc-100">
            <KeyRound className="w-5 h-5 text-zinc-400" />
            Unirme con código
          </span>
          <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-200 transition" />
        </Link>
      </div>

      {/* Live tables */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[11px] uppercase tracking-[0.25em] text-zinc-500 font-bold">
            Mesas en vivo {ready && rooms.length > 0 ? `· ${rooms.length}` : ""}
          </h2>
          {!ready && (
            <RefreshCw className="w-3.5 h-3.5 text-zinc-600 animate-spin" />
          )}
        </div>

        {ready && rooms.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 rounded-2xl glass text-center">
            <Users className="w-7 h-7 text-zinc-600" />
            <p className="text-sm text-zinc-400">No hay mesas públicas abiertas</p>
            <Link
              href="/create"
              className="mt-1 text-xs font-bold uppercase tracking-widest text-accent hover:brightness-110"
            >
              Crea la primera
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rooms.map((r) => (
              <RoomRow key={r.code} room={r} />
            ))}
          </ul>
        )}
      </section>

      {/* Other modes */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[11px] uppercase tracking-[0.25em] text-zinc-500 font-bold px-1">
          Otros modos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ModeLink
            href="/host"
            icon={<Tv className="w-4 h-4" />}
            title="Presencial"
            sub="Mesa real + teléfonos"
          />
          <ModeLink
            href="/host/torneo"
            icon={<Trophy className="w-4 h-4" />}
            title="Torneo"
            sub="Ciegas escalonadas"
          />
        </div>
      </section>
    </div>
  );
}

function RoomRow({ room }: { room: OpenRoomSummary }) {
  const s = STATUS[room.status];
  const isFull = room.status === "full";
  return (
    <li className="flex items-center gap-3 p-3.5 rounded-2xl glass hover:bg-white/[0.05] transition">
      <div className="p-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-300">
        {room.mode === "torneo" ? (
          <Trophy className="w-4 h-4" />
        ) : (
          <Coins className="w-4 h-4" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-zinc-100 truncate">
            {room.roomName}
          </span>
          {!room.isPublic && <Lock className="w-3 h-3 text-zinc-500 shrink-0" />}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500 tabular-nums mt-0.5">
          <span>
            {formatChips(room.smallBlind)}/{formatChips(room.bigBlind)}
          </span>
          <span className="text-zinc-700">·</span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {room.playerCount}/{room.maxPlayers}
          </span>
        </div>
      </div>

      <span
        className={`text-[9px] uppercase tracking-widest px-2 py-1 rounded-full ring-1 font-bold ${s.cls}`}
      >
        {s.label}
      </span>

      {isFull ? (
        <span className="px-3.5 py-2 rounded-full text-xs font-bold uppercase tracking-widest bg-white/5 text-zinc-500 ring-1 ring-white/10">
          Llena
        </span>
      ) : (
        <Link
          href={`/play/normal/${room.code}`}
          className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest bg-accent text-black hover:brightness-110 transition btn-press"
        >
          Entrar
        </Link>
      )}
    </li>
  );
}

function ModeLink({
  href,
  icon,
  title,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 p-3.5 rounded-2xl glass hover:bg-white/[0.05] transition btn-press"
    >
      <span className="flex items-center gap-3">
        <span className="p-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-300">
          {icon}
        </span>
        <span className="flex flex-col">
          <span className="text-sm text-zinc-100">{title}</span>
          <span className="text-[11px] text-zinc-500">{sub}</span>
        </span>
      </span>
      <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition" />
    </Link>
  );
}
