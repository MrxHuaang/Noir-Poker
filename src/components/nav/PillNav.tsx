"use client";

import Link from "next/link";
import gsap from "gsap";
import { useRef, useState, useEffect } from "react";

export type PillNavItem = {
  label: string;
  href: string;
  ariaLabel?: string;
  onClick?: () => void;
};

export interface PillNavProps {
  logo: string;
  logoAlt?: string;
  logoHref?: string;
  items: PillNavItem[];
  activePath?: string | null;
  className?: string;
  brandTitle?: string;
  onMobileMenuClick?: () => void;
}

function isExternalLink(href: string) {
  return (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("//") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("#")
  );
}

function isActivePath(activePath: string | null | undefined, href: string) {
  if (!activePath) return false;
  if (href === "/") return activePath === "/";
  return activePath === href || activePath.startsWith(`${href}/`);
}

export function PillNav({
  logo,
  logoAlt = "Logo",
  logoHref = "/",
  items,
  activePath,
  className = "",
  brandTitle,
  onMobileMenuClick,
}: PillNavProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const logoTweenRef = useRef<gsap.core.Tween | null>(null);
  const logoRef = useRef<HTMLAnchorElement | null>(null);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reduceMotionRef.current = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const handleLogoEnter = () => {
    if (reduceMotionRef.current) return;
    const img = logoImgRef.current;
    if (!img) return;
    logoTweenRef.current?.kill();
    gsap.set(img, { rotate: 0 });
    logoTweenRef.current = gsap.to(img, {
      rotate: 360,
      duration: 0.55,
      ease: "sine.out",
      overwrite: "auto",
    });
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((v) => !v);
    onMobileMenuClick?.();
  };

  const pillBase =
    "relative inline-flex h-8 max-h-8 min-h-8 shrink-0 items-center justify-center self-center rounded-full border border-transparent px-3.5 text-[13px] font-medium leading-none tracking-wide text-zinc-300 no-underline outline-none transition-[background-color,color,box-shadow,transform,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[background-color,transform]";

  const pillIdle =
    "bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:bg-white/[0.09] hover:text-zinc-100 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] active:scale-[0.98]";

  const pillActive =
    "border border-emerald-400/35 bg-emerald-500/[0.12] text-emerald-100 shadow-[inset_0_1px_0_rgba(52,211,153,0.14)]";

  const pillFocus =
    "focus-visible:border-emerald-400/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40";

  return (
    <div className={`relative w-full ${className}`}>
      <nav
        className="box-border flex w-full items-center justify-between gap-3 px-1 sm:px-0"
        aria-label="Principal"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {!isExternalLink(logoHref) ? (
            <Link
              href={logoHref}
              aria-label={logoAlt}
              onMouseEnter={handleLogoEnter}
              ref={logoRef}
              className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.06] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[background-color,transform] duration-300 ease-out outline-none hover:bg-white/[0.1] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40"
              style={{
                width: "42px",
                height: "42px",
              }}
            >
              <img
                src={logo}
                alt={logoAlt}
                ref={logoImgRef}
                className="block h-full w-full object-contain"
              />
            </Link>
          ) : (
            <a
              href={logoHref}
              aria-label={logoAlt}
              onMouseEnter={handleLogoEnter}
              ref={logoRef}
              className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.06] p-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40"
              style={{
                width: "42px",
                height: "42px",
              }}
            >
              <img
                src={logo}
                alt={logoAlt}
                ref={logoImgRef}
                className="block h-full w-full object-contain"
              />
            </a>
          )}
          {brandTitle && !isExternalLink(logoHref) ? (
            <Link
              href={logoHref}
              className="truncate text-[15px] font-medium tracking-tight text-zinc-100 transition-colors duration-300 hover:text-white"
            >
              {brandTitle}
            </Link>
          ) : null}
          {brandTitle && isExternalLink(logoHref) ? (
            <a
              href={logoHref}
              className="truncate text-[15px] font-medium tracking-tight text-zinc-100"
            >
              {brandTitle}
            </a>
          ) : null}
        </div>

        <div className="hidden h-10 items-center gap-1 overflow-hidden rounded-full border border-white/[0.06] bg-[rgb(10,11,16)]/90 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:flex">
          <ul
            role="menubar"
            className="m-0 flex h-full list-none items-center gap-1 p-0"
          >
            {items.map((item) => {
              const active = isActivePath(activePath, item.href);
              const pillClass = `${pillBase} ${pillFocus} ${active ? pillActive : pillIdle}`;

              return (
                <li key={item.label} role="none" className="flex items-center">
                  {item.onClick ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={item.onClick}
                      className={pillClass}
                      aria-label={item.ariaLabel || item.label}
                    >
                      {item.label}
                    </button>
                  ) : !isExternalLink(item.href) ? (
                    <Link
                      role="menuitem"
                      href={item.href}
                      className={pillClass}
                      aria-current={active ? "page" : undefined}
                      aria-label={item.ariaLabel || item.label}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <a
                      role="menuitem"
                      href={item.href}
                      className={pillClass}
                      aria-label={item.ariaLabel || item.label}
                    >
                      {item.label}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <button
          type="button"
          onClick={toggleMobileMenu}
          aria-label={isMobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={isMobileMenuOpen}
          className="relative flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.06] p-0 outline-none transition-[background-color] duration-300 ease-out hover:bg-white/[0.1] md:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40"
          style={{
            width: "42px",
            height: "42px",
          }}
        >
          <span
            className={`h-0.5 w-4 origin-center rounded-full bg-zinc-300 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isMobileMenuOpen ? "translate-y-[5px] rotate-45" : ""
            }`}
          />
          <span
            className={`h-0.5 w-4 origin-center rounded-full bg-zinc-300 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isMobileMenuOpen ? "-translate-y-[3px] -rotate-45" : ""
            }`}
          />
        </button>
      </nav>

      <div
        className={`absolute left-0 right-0 top-[54px] z-[998] mx-1 origin-top rounded-2xl border border-white/[0.08] bg-[rgb(12,14,18)]/95 p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.45)] backdrop-blur-md transition-[opacity,transform,visibility] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden ${
          isMobileMenuOpen
            ? "visible translate-y-0 opacity-100"
            : "invisible pointer-events-none -translate-y-1 opacity-0"
        }`}
      >
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {items.map((item) => {
            const active = isActivePath(activePath, item.href);
            const rowClass = `${pillBase} w-full justify-start rounded-xl px-4 py-3 text-[15px] ${pillFocus} ${active ? pillActive : pillIdle}`;

            const close = () => setIsMobileMenuOpen(false);

            return (
              <li key={item.label}>
                {item.onClick ? (
                  <button
                    type="button"
                    className={rowClass}
                    onClick={() => { item.onClick!(); close(); }}
                  >
                    {item.label}
                  </button>
                ) : !isExternalLink(item.href) ? (
                  <Link
                    href={item.href}
                    className={rowClass}
                    aria-current={active ? "page" : undefined}
                    onClick={close}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a href={item.href} className={rowClass} onClick={close}>
                    {item.label}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
