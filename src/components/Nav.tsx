"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Coins, LogOut, Trophy, Tv, User as UserIcon, X } from "lucide-react";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { PillNav } from "@/components/nav/PillNav";
import { Avatar } from "@/components/players/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { availableCoins } from "@/lib/economy";
import { formatChips } from "@/lib/betting";

const ACCENTS = {
  one: {
    badge: "bg-white/[0.06] text-zinc-300 ring-white/12",
    cta: "bg-white/[0.07] text-zinc-100 ring-1 ring-white/15 hover:bg-white/[0.12] hover:ring-white/25 hover:shadow-[0_0_22px_rgba(255,255,255,0.08)]",
    iconBg: "bg-white/[0.06] text-zinc-200 ring-white/15",
    glow: "0 0 82",
    glowColors: ["#a78bfa", "#7c5cbf", "#3d2a6b"],
    bg: "rgba(10,8,18,0.9)",
  },
  two: {
    badge: "bg-white/[0.06] text-zinc-300 ring-white/12",
    cta: "bg-white/[0.07] text-zinc-100 ring-1 ring-white/15 hover:bg-white/[0.12] hover:ring-white/25",
    iconBg: "bg-white/[0.06] text-zinc-200 ring-white/15",
    glow: "0 0 75",
    glowColors: ["#9b7ff5", "#7356af", "#2e1f55"],
    bg: "rgba(9,7,16,0.9)",
  },
  three: {
    badge: "bg-white/[0.05] text-zinc-400 ring-white/10",
    cta: "bg-white/[0.07] text-zinc-100 ring-1 ring-white/15 hover:bg-white/[0.12] hover:ring-white/25",
    iconBg: "bg-white/[0.06] text-zinc-300 ring-white/10",
    glow: "0 0 60",
    glowColors: ["#8b6fe8", "#6548a0", "#261747"],
    bg: "rgba(8,6,14,0.9)",
  },
} as const;

type AccentKey = keyof typeof ACCENTS;

function ModeCard({
  href,
  icon,
  accent,
  title,
  subtitle,
  description,
  features,
  cta,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  accent: AccentKey;
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  cta: string;
  onNavigate: () => void;
}) {
  const a = ACCENTS[accent];
  return (
    <Link href={href} className="group block h-full btn-press" onClick={onNavigate}>
      <BorderGlow
        className="h-full w-full lg-blur"
        edgeSensitivity={26}
        glowColor={a.glow}
        backgroundColor="var(--lg-bg)"
        borderRadius={24}
        glowRadius={36}
        glowIntensity={1.05}
        coneSpread={22}
        animated={false}
        colors={a.glowColors as unknown as string[]}
        fillOpacity={0.4}
      >
        <div className="flex h-full flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <div className={`p-2.5 rounded-xl ring-1 ${a.iconBg}`}>{icon}</div>
            <span className={`text-[10px] uppercase tracking-[0.2em] px-2 py-1 rounded-full ring-1 ${a.badge}`}>
              Disponible
            </span>
          </div>
          <div>
            <h3 className="text-xl text-zinc-50 font-semibold tracking-tight">{title}</h3>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400 mt-1">{subtitle}</p>
          </div>
          <p className="text-sm text-zinc-300/90">{description}</p>
          <ul className="flex flex-col gap-1.5">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="w-1 h-1 rounded-full bg-zinc-500" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-1">
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition ${a.cta}`}>
              {cta}
              <ArrowRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </BorderGlow>
    </Link>
  );
}

function UserPill() {
  const { profile, isGuest, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Perfil aun cargando: CTA simple de inicio de sesion.
  if (!profile) {
    return (
      <Link
        href="/login"
        className="inline-flex shrink-0 items-center gap-2 h-10 px-3.5 rounded-full bg-white/[0.06] ring-1 ring-white/12 text-zinc-200 hover:bg-white/[0.1] hover:ring-white/25 transition btn-press text-[13px] font-medium"
        aria-label="Iniciar sesion"
      >
        <UserIcon className="w-4 h-4" />
        <span className="hidden sm:inline">Entrar</span>
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 h-10 pl-1.5 pr-3 rounded-full bg-white/[0.06] ring-1 ring-white/12 hover:bg-white/[0.1] hover:ring-white/25 transition btn-press"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {profile.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.photoURL}
            alt=""
            className="w-7 h-7 rounded-full ring-1 ring-white/15 object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <Avatar seed={profile.avatarSeed} size={28} />
        )}
        <span className="hidden sm:inline-flex items-center gap-1 text-[12px] font-semibold text-zinc-200 tabular-nums">
          <Coins className="w-3.5 h-3.5 text-zinc-400" />
          {formatChips(availableCoins(profile))}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[48px] z-50 w-56 rounded-2xl border border-white/[0.08] bg-[rgb(12,14,18)]/97 p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-3 py-2.5 border-b border-white/[0.06]">
            <div className="text-sm font-semibold text-zinc-100 truncate">
              {isGuest ? "Invitado" : profile.nickname}
            </div>
            {!isGuest && (
              <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-0.5">
                <Trophy className="w-3 h-3" />
                Nivel {profile.level} · {profile.title}
              </div>
            )}
            <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-1">
              <Coins className="w-3 h-3" />
              {formatChips(availableCoins(profile))} monedas
            </div>
          </div>
          {isGuest ? (
            <Link
              href="/login"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-zinc-200 hover:bg-white/[0.07] transition"
            >
              <UserIcon className="w-4 h-4 text-zinc-400" />
              Crear cuenta / Entrar
            </Link>
          ) : (
            <>
              <Link
                href="/perfil"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-zinc-200 hover:bg-white/[0.07] transition"
              >
                <UserIcon className="w-4 h-4 text-zinc-400" />
                Mi perfil
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  signOut();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-zinc-300 hover:bg-white/[0.07] transition"
              >
                <LogOut className="w-4 h-4 text-zinc-400" />
                Cerrar sesion
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const path = usePathname();
  const [showModal, setShowModal] = useState(false);

  // Close the create modal with Escape (WCAG dialog standard).
  useEffect(() => {
    if (!showModal) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowModal(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [showModal]);

  if (
    path?.startsWith("/host") ||
    path?.startsWith("/play/normal") ||
    path?.startsWith("/play/torneo")
  ) {
    return null;
  }

  const navItems = [
    { href: "/lobby", label: "Lobby" },
    { href: "#", label: "Crear sala", onClick: () => setShowModal(true) },
    { href: "/join", label: "Unirse" },
  ];

  return (
    <>
      <header className="sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-3 py-2.5 sm:px-4 flex items-center gap-2 sm:gap-3">
          <BorderGlow
            className="flex-1 min-w-0 !border-white/10"
            edgeSensitivity={20}
            glowColor="272 80 74"
            backgroundColor="rgba(9, 7, 16, 0.9)"
            borderRadius={999}
            glowRadius={22}
            glowIntensity={0.85}
            coneSpread={28}
            animated={false}
            colors={["#a78bfa", "#7c5cbf", "#4a3580", "#261747"]}
            fillOpacity={0.3}
          >
            <div className="min-h-0 overflow-hidden rounded-[inherit] px-2 py-1.5 sm:px-3 sm:py-2">
              <PillNav
                logo="/logonav.png"
                logoAlt="Noir Poker"
                logoHref="/"
                items={navItems}
                activePath={path}
              />
            </div>
          </BorderGlow>
          <UserPill />
        </div>
      </header>

      {showModal ? (
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center overflow-y-auto bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Crear sala"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div className="w-full max-w-4xl mx-auto flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-200 py-2 sm:py-0">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xl font-semibold tracking-tight text-zinc-100">
                Elige un modo
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-zinc-200 transition"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ModeCard
                href="/host"
                icon={<Tv className="w-5 h-5" />}
                accent="one"
                title="Presencial"
                subtitle="Sin apuestas · Para mesa real"
                description="Host abre la mesa en pantalla grande. Cada jugador ve sus cartas privadas en su teléfono. La mesa reparte, avanza calles y resuelve el showdown."
                features={["Hasta 9 jugadores", "All-in con run-out múltiple", "Historial de manos"]}
                cta="Abrir mesa"
                onNavigate={() => setShowModal(false)}
              />
              <ModeCard
                href="/create"
                icon={<Coins className="w-5 h-5" />}
                accent="two"
                title="Online"
                subtitle="Apuestas virtuales · Lobby"
                description="Sala con fichas virtuales, ciegas y apuestas. Crea pública o privada; configura las reglas dentro de la sala."
                features={["Fichas, ciegas y apuestas", "Pública o privada con lobby", "Side pots automáticos"]}
                cta="Crear sala"
                onNavigate={() => setShowModal(false)}
              />
              <ModeCard
                href="/host/torneo"
                icon={<Trophy className="w-5 h-5" />}
                accent="three"
                title="Torneo"
                subtitle="Ciegas escalonadas · Admin"
                description="Estructura con niveles de ciegas, antes y timer automático. Admin controla el torneo y ve el ranking de eliminados en vivo."
                features={["Niveles y timer automáticos", "Knockouts + ranking final", "Panel admin exclusivo"]}
                cta="Crear torneo"
                onNavigate={() => setShowModal(false)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
