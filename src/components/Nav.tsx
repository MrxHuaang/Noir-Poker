"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Coins, LogOut, Menu, Trophy, User as UserIcon, X } from "lucide-react";
import { Avatar } from "@/components/players/Avatar";
import { ModeList } from "@/components/home/ModeList";
import { useAuth } from "@/hooks/useAuth";
import { availableCoins } from "@/lib/economy";
import { formatChips } from "@/lib/betting";

function isActive(path: string | null, href: string) {
  if (!path) return false;
  return path === href || path.startsWith(`${href}/`);
}

function Wordmark() {
  return (
    <Link href="/" className="group flex items-baseline gap-2 outline-none" aria-label="Noir, inicio">
      <span className="font-display text-[1.7rem] leading-none text-primary">Noir</span>
      <span className="suit text-base transition-colors duration-300 group-hover:text-accent-300" aria-hidden>
        ♠
      </span>
    </Link>
  );
}

function UserPill() {
  const { profile, isGuest, signOut } = useAuth();
  const pathname = usePathname();
  // Volver a esta misma pagina tras iniciar sesion.
  const loginHref =
    pathname && pathname !== "/login" ? `/login?next=${encodeURIComponent(pathname)}` : "/login";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Perfil aun cargando: CTA simple de inicio de sesion.
  if (!profile) {
    return (
      <Link href={loginHref} className="text-sm font-medium text-secondary hover:text-primary transition-colors">
        Entrar
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-2.5 rounded-xl pl-1 pr-3 transition-colors hover:bg-bone/[0.05]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Tu cuenta"
      >
        {profile.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.photoURL}
            alt=""
            className="h-8 w-8 rounded-[10px] object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="overflow-hidden rounded-[10px]">
            <Avatar seed={profile.avatarSeed} size={32} />
          </span>
        )}
        <span className="numeric hidden text-[13px] text-primary sm:inline">
          {formatChips(availableCoins(profile))}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="sheet absolute right-0 top-12 z-50 w-64 p-1.5 shadow-[0_24px_60px_-20px_oklch(0.05_0.005_60/0.9)] animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="px-3 pt-2.5 pb-3">
            <div className="truncate text-sm font-semibold text-primary">
              {isGuest ? "Invitado" : profile.nickname}
            </div>
            {!isGuest && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <Trophy className="h-3 w-3" />
                Nivel {profile.level} · {profile.title}
              </div>
            )}
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <Coins className="h-3 w-3" />
              <span className="numeric">{formatChips(availableCoins(profile))}</span> monedas
            </div>
          </div>
          <div className="rule mx-1.5" />
          <div className="pt-1">
            {isGuest ? (
              <Link
                href={loginHref}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-primary transition-colors hover:bg-bone/[0.05]"
              >
                <UserIcon className="h-4 w-4 text-muted" />
                Crear cuenta o entrar
              </Link>
            ) : (
              <>
                <Link
                  href="/perfil"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-primary transition-colors hover:bg-bone/[0.05]"
                >
                  <UserIcon className="h-4 w-4 text-muted" />
                  Mi perfil
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    signOut();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-secondary transition-colors hover:bg-bone/[0.05] hover:text-primary"
                >
                  <LogOut className="h-4 w-4 text-muted" />
                  Cerrar sesión
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const path = usePathname();
  const [showModes, setShowModes] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Close overlays with Escape (WCAG dialog standard).
  useEffect(() => {
    if (!showModes && !menuOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowModes(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [showModes, menuOpen]);

  if (
    path?.startsWith("/host") ||
    path?.startsWith("/play/normal") ||
    // Online table is a fixed full-screen view (TableShell); the nav would
    // overlap the felt. The /play/online landing keeps the nav.
    path?.startsWith("/play/online/")
  ) {
    return null;
  }

  const links = [
    { href: "/lobby", label: "Lobby" },
    { href: "/join", label: "Unirse" },
  ];
  const openModes = () => {
    setMenuOpen(false);
    setShowModes(true);
  };

  const linkClass = (href: string) =>
    `relative py-1 text-sm transition-colors ${
      isActive(path, href)
        ? "text-primary after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:bg-accent-400"
        : "text-secondary hover:text-primary"
    }`;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-ink-900/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-5 sm:px-8">
          <Wordmark />
          <nav aria-label="Principal" className="hidden items-center gap-7 md:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className={linkClass(l.href)}>
                {l.label}
              </Link>
            ))}
            <button type="button" onClick={openModes} className={linkClass("/create")}>
              Crear sala
            </button>
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <Link href="/jugar" className="btn-primary hidden h-9 rounded-[10px] px-4 text-[13px] sm:inline-flex">
              Jugar
            </Link>
            <UserPill />
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-secondary transition-colors hover:bg-bone/[0.05] hover:text-primary md:hidden"
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav
            aria-label="Principal"
            className="border-t border-line px-5 pb-5 pt-2 md:hidden animate-in fade-in slide-in-from-top-1 duration-150"
          >
            {[{ href: "/jugar", label: "Jugar" }, ...links].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-between border-b border-line py-3.5 font-display text-2xl text-primary"
              >
                {l.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={openModes}
              className="flex w-full items-center justify-between py-3.5 text-left font-display text-2xl text-primary"
            >
              Crear sala
            </button>
          </nav>
        )}
      </header>

      {showModes ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/80 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Crear sala"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModes(false);
          }}
        >
          <div className="sheet w-full max-w-3xl p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Crear sala</p>
                <h2 className="display mt-1 text-4xl text-primary">¿A qué jugamos?</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowModes(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-bone/[0.05] hover:text-primary"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ModeList compact onNavigate={() => setShowModes(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
