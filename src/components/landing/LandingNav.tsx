"use client";
import { useEffect, useState } from "react";
import { KeyholeLogo } from "@/components/landing/KeyholeLogo";

const LINKS = [
  { href: "#carteles", label: "Modos" },
  { href: "#carta", label: "La carta" },
  { href: "#rangos", label: "Rangos" },
];

/** Club nav: transparent over the hero, a brass-trimmed bar once you scroll. */
export function LandingNav({ member, onEnter, show }: { member: boolean; onEnter: () => void; show: boolean }) {
  const [solid, setSolid] = useState(false);
  // The title screen already shows the big NOIR: the nav mark waits until it is gone.
  const [pastTitle, setPastTitle] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setSolid(window.scrollY > 60);
      setPastTitle(window.scrollY > window.innerHeight * 0.55);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 transition-[background,box-shadow,opacity] duration-500 ${
        show ? "opacity-100" : "pointer-events-none opacity-0"
      } ${
        solid
          ? "bg-soot-900/92 shadow-[0_1px_0_var(--color-brass-700),0_3px_0_#050404,0_4px_0_rgb(185_138_60/.35)]"
          : ""
      }`}
    >
      <div className="mx-auto flex h-[76px] max-w-[1320px] items-center gap-8 px-[clamp(18px,4vw,48px)]">
        <div className={`transition-opacity duration-500 ${pastTitle ? "opacity-100" : "pointer-events-none opacity-0"}`} inert={!pastTitle}>
          <KeyholeLogo />
        </div>
        <ul className="ml-auto hidden list-none gap-1 p-0 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="group relative block px-3.5 py-2 font-stencil text-[17px] font-extrabold uppercase tracking-[.08em] text-paper-dim no-underline hover:text-paper"
              >
                {l.label}
                <span className="absolute inset-x-3.5 bottom-1 h-0.5 origin-left scale-x-0 bg-brass-400 transition-transform duration-300 group-hover:scale-x-100" />
              </a>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          <button type="button" className="tk tk-sm tk-red" onClick={onEnter}>
            {member ? "Volver al club" : "Entrar al club"}
          </button>
        </div>
      </div>
    </nav>
  );
}
