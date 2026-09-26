"use client";
import { useRef } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowRight, Lock, Plus, RefreshCw } from "lucide-react";
import { DesktopOnlyGate } from "@/components/ui/DesktopOnlyGate";
import { useAuth } from "@/hooks/useAuth";
import { useOpenRooms } from "@/hooks/useNormalRoom";
import { formatChips } from "@/lib/betting";
import type { OpenRoomSummary } from "@/lib/normalRooms";

// One grid template shared by the column header and every row so the columns
// line up: code, table, status, players, blinds, action.
const COLS = "md:grid-cols-[6rem_minmax(0,1fr)_8rem_6.5rem_6.5rem_7.5rem]";

const STATUS: Record<OpenRoomSummary["status"], { label: string; dot: string; text: string }> = {
  waiting: { label: "Esperando", dot: "bg-accent-400", text: "text-primary" },
  playing: { label: "En juego", dot: "bg-bone-dim/60", text: "text-secondary" },
  full: { label: "Llena", dot: "border border-line-strong", text: "text-muted" },
};

function roomKind(room: OpenRoomSummary): string {
  if (room.mode === "torneo") return "Torneo";
  return room.economy === "casual" ? "Casual" : "Con monedas";
}

export default function LobbyPage() {
  return (
    <DesktopOnlyGate>
      <LobbyPageInner />
    </DesktopOnlyGate>
  );
}

function LobbyPageInner() {
  const { uid } = useAuth();
  const { rooms, ready } = useOpenRooms(!!uid);
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".rise", {
          opacity: 0,
          y: 16,
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.07,
          clearProps: "all",
        });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [] },
  );

  return (
    <div ref={scope} className="relative z-[2] mx-auto w-full max-w-6xl px-5 sm:px-8">
      <header className="grid grid-cols-1 gap-8 pt-14 pb-14 sm:pt-20 lg:grid-cols-12 lg:items-end lg:gap-8 lg:pb-16">
        <div className="lg:col-span-8">
          <p className="rise eyebrow mb-5 flex items-center gap-2">
            <span className="suit text-sm" aria-hidden>
              ♣
            </span>
            Lobby
          </p>
          <h1 className="rise display text-5xl text-primary sm:text-6xl">
            ¿Quién está <em className="text-accent-200">repartiendo</em>?
          </h1>
          <p className="rise mt-5 max-w-[50ch] text-[15px] leading-relaxed text-secondary">
            Mesas públicas abiertas ahora mismo. Entra a una o abre la tuya; las privadas solo se
            encuentran con su código.
          </p>
        </div>
        <div className="rise flex flex-wrap items-center gap-3 lg:col-span-4 lg:justify-end">
          <Link href="/create" className="btn-primary">
            <Plus className="h-4 w-4" />
            Crear mesa
          </Link>
          <Link href="/join" className="btn-quiet">
            Unirme con código
          </Link>
        </div>
      </header>

      <section aria-labelledby="live-tables" className="rise pb-24">
        <div className="flex items-center justify-between gap-4 pb-3">
          <h2 id="live-tables" className="eyebrow">
            Mesas en vivo
            {ready && rooms.length > 0 ? (
              <>
                {" · "}
                <span className="numeric">{rooms.length}</span>
              </>
            ) : null}
          </h2>
          {!ready && (
            <span className="eyebrow flex items-center gap-2" role="status">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Buscando mesas
            </span>
          )}
        </div>

        {ready && rooms.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Column header: visual only, every row carries its own labels. */}
            <div
              aria-hidden
              className={`hidden border-t border-line px-4 pt-4 pb-3 md:grid md:gap-x-6 ${COLS}`}
            >
              <span className="eyebrow">Código</span>
              <span className="eyebrow">Mesa</span>
              <span className="eyebrow">Estado</span>
              <span className="eyebrow">Jugadores</span>
              <span className="eyebrow">Ciegas</span>
              <span />
            </div>
            <ul className="flex flex-col border-t border-line">
              {ready
                ? rooms.map((r) => <RoomRow key={r.code} room={r} />)
                : [0, 1, 2].map((i) => <SkeletonRow key={i} />)}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function RoomRow({ room }: { room: OpenRoomSummary }) {
  const s = STATUS[room.status];
  const isFull = room.status === "full";
  return (
    <li
      className={`group relative grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1.5 border-b border-line px-2 py-5 transition-colors duration-300 md:items-center md:gap-x-6 md:px-4 ${COLS} ${
        isFull ? "" : "hover:bg-bone/[0.025]"
      }`}
    >
      <span className="numeric text-sm tracking-[0.12em] text-primary">{room.code}</span>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-medium text-primary">{room.roomName}</span>
          {!room.isPublic && (
            <>
              <Lock className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              <span className="sr-only">Privada</span>
            </>
          )}
        </div>
        <p className="eyebrow mt-0.5">{roomKind(room)}</p>
      </div>

      {/* Mobile: one line of facts under the name. Desktop: dissolves into
          the grid so each fact lands in its own column. */}
      <div className="col-start-2 row-start-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-secondary md:contents">
        <span className={`inline-flex items-center gap-2 md:col-start-3 md:row-start-1 ${s.text}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
          {s.label}
        </span>
        <span className="md:col-start-4 md:row-start-1">
          <span className="numeric text-primary">{room.playerCount}</span>
          <span className="numeric text-muted">/{room.maxPlayers}</span>
          <span className="ml-1.5 md:sr-only">jugadores</span>
        </span>
        <span className="md:col-start-5 md:row-start-1">
          <span className="mr-1.5 md:sr-only">Ciegas</span>
          <span className="numeric">
            {formatChips(room.smallBlind)}/{formatChips(room.bigBlind)}
          </span>
        </span>
      </div>

      <div className="col-start-3 row-start-1 justify-self-end md:col-start-6">
        {isFull ? (
          <span className="text-sm text-muted">Sin asiento</span>
        ) : (
          <Link
            href={`/play/normal/${room.code}`}
            aria-label={`Entrar a ${room.roomName} (${room.code})`}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary after:absolute after:inset-0 after:content-['']"
          >
            Entrar
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </li>
  );
}

function SkeletonRow() {
  return (
    <li
      aria-hidden
      className={`grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-line px-2 py-6 md:gap-x-6 md:px-4 ${COLS}`}
    >
      <span className="h-3 w-12 rounded bg-bone/[0.05] motion-safe:animate-pulse" />
      <span className="h-3 w-40 max-w-full rounded bg-bone/[0.05] motion-safe:animate-pulse" />
      <span className="h-3 w-14 rounded bg-bone/[0.04] motion-safe:animate-pulse md:hidden" />
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-5 border-y border-line py-14 sm:py-20">
      <span className="text-3xl" aria-hidden>
        <span className="suit">♠</span>
      </span>
      <p className="display max-w-[24ch] text-3xl text-primary sm:text-4xl">
        Ninguna mesa pública abierta. <em className="text-accent-200">Todavía.</em>
      </p>
      <p className="max-w-[46ch] text-sm leading-relaxed text-secondary">
        Las mesas aparecen aquí en cuanto alguien las abre. Crea la primera y comparte el código
        con tu grupo.
      </p>
      <Link href="/create" className="btn-primary mt-1">
        Crear la primera mesa
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
