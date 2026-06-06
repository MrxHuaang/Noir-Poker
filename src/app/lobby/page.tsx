"use client";
import Link from "next/link";
import {
  Plus,
  KeyRound,
  Users,
  Users2,
  Lock,
  Coins,
  Trophy,
  RefreshCw,
} from "lucide-react";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { useAuth } from "@/hooks/useAuth";
import { useOpenRooms } from "@/hooks/useNormalRoom";
import { formatChips } from "@/lib/betting";
import type { OpenRoomSummary } from "@/lib/normalRooms";

const GLOW = "0 0 82";
const GLOW_COLORS = ["#ededf2", "#a0a0a8", "#52525b", "#3f3f46"];

const STATUS: Record<OpenRoomSummary["status"], { label: string; cls: string }> = {
  waiting: { label: "Esperando", cls: "bg-white/12 text-white ring-white/25" },
  playing: { label: "En juego", cls: "bg-white/[0.06] text-zinc-300 ring-white/15" },
  full: { label: "Llena", cls: "bg-white/[0.04] text-zinc-500 ring-white/10" },
};

export default function LobbyPage() {
  const { uid } = useAuth();
  const { rooms, ready } = useOpenRooms(!!uid);

  return (
    <div className="relative z-[2] w-full max-w-3xl mx-auto px-4 py-10 sm:py-14 flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl sm:text-3xl tracking-tight text-primary font-semibold">
          Lobby
        </h1>
        <p className="text-sm text-secondary">
          Mesas abiertas ahora mismo. Entra o crea la tuya.
        </p>
      </header>

      {/* Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/create" className="group block btn-press">
          <BorderGlow
            className="w-full lg-blur"
            glowColor={GLOW}
            colors={GLOW_COLORS}
            backgroundColor="var(--lg-bg)"
            borderRadius={18}
            glowRadius={28}
            glowIntensity={0.95}
            coneSpread={24}
            fillOpacity={0.4}
          >
            <div className="flex items-center gap-3 px-4 py-3.5 text-zinc-100">
              <span className="p-2 rounded-xl bg-white/10 ring-1 ring-white/15">
                <Plus className="w-4 h-4" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold">Crear mesa</span>
                <span className="text-[11px] text-muted">Pública o privada</span>
              </span>
            </div>
          </BorderGlow>
        </Link>
        <Link href="/join" className="group block btn-press">
          <BorderGlow
            className="w-full lg-blur"
            glowColor={GLOW}
            colors={GLOW_COLORS}
            backgroundColor="var(--lg-bg)"
            borderRadius={18}
            glowRadius={28}
            glowIntensity={0.95}
            coneSpread={24}
            fillOpacity={0.4}
          >
            <div className="flex items-center gap-3 px-4 py-3.5 text-zinc-100">
              <span className="p-2 rounded-xl bg-white/10 ring-1 ring-white/15">
                <KeyRound className="w-4 h-4" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold">Unirme con código</span>
                <span className="text-[11px] text-muted">Para salas privadas</span>
              </span>
            </div>
          </BorderGlow>
        </Link>
      </div>

      {/* Live tables */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[11px] uppercase tracking-[0.25em] text-muted font-bold">
            Mesas en vivo {ready && rooms.length > 0 ? `· ${rooms.length}` : ""}
          </h2>
          {!ready && <RefreshCw className="w-3.5 h-3.5 text-zinc-600 animate-spin" />}
        </div>

        {ready && rooms.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center">
            <Users className="w-7 h-7 text-zinc-600" />
            <p className="text-sm text-secondary">No hay mesas públicas abiertas</p>
            <Link
              href="/create"
              className="mt-1 text-xs font-bold uppercase tracking-widest text-zinc-200 hover:text-white"
            >
              Crea la primera
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {rooms.map((r) => (
              <li key={r.code}>
                <RoomCard room={r} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RoomCard({ room }: { room: OpenRoomSummary }) {
  const s = STATUS[room.status];
  const isFull = room.status === "full";
  return (
    <BorderGlow
      className="w-full lg-blur"
      glowColor={GLOW}
      colors={GLOW_COLORS}
      backgroundColor="var(--lg-bg)"
      borderRadius={18}
      glowRadius={26}
      glowIntensity={0.9}
      coneSpread={26}
      fillOpacity={0.36}
    >
      <div className="flex items-center gap-3 p-3.5">
        <div className="p-2 rounded-xl bg-white/[0.06] ring-1 ring-white/10 text-zinc-300">
          {room.mode === "torneo" ? (
            <Trophy className="w-4 h-4" />
          ) : room.economy === "casual" ? (
            <Users2 className="w-4 h-4" />
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
          <div className="flex items-center gap-2 text-[11px] text-zinc-400 tabular-nums mt-0.5">
            {room.economy === "casual" && (
              <span className="text-[9px] uppercase tracking-widest font-bold text-zinc-400 not-italic">
                Casual
              </span>
            )}
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
          <span className="px-3.5 py-2 rounded-full text-xs font-bold uppercase tracking-widest bg-white/[0.04] text-zinc-500 ring-1 ring-white/10">
            Llena
          </span>
        ) : (
          <Link
            href={`/play/normal/${room.code}`}
            className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest bg-accent text-black hover:brightness-95 transition btn-press"
          >
            Entrar
          </Link>
        )}
      </div>
    </BorderGlow>
  );
}
