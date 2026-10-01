"use client";
// The club's sign-off, built like the Zephr and Lumbre footers: the mark and
// one line with the way in, three columns of links, then an oversized NOIR in
// the logo's stencil (paper over brass over blood, like a painted sign) that
// switches on letter by letter like a neon tube when you reach it.
import type { CSSProperties } from "react";
import { KeyholeLogo } from "@/components/landing/KeyholeLogo";

const WORD = "NOIR";

/**
 * The sign-off: NOIR in the logo's stencil, big as a painted wall sign, with
 * hard brass and blood shadows stepping down-right. Each letter is its own tube
 * and switches on in turn (noir.css .neon-letter).
 */
function StencilSign() {
  return (
    <p
      className="stencil m-0 flex justify-center gap-[.04em] text-[clamp(140px,31vw,500px)] leading-[.8] text-paper select-none [text-shadow:.03em_.03em_0_var(--color-brass-700),.06em_.06em_0_var(--color-blood-700)]"
      aria-hidden
    >
      {WORD.split("").map((ch, i) => (
        <span key={i} className="neon-letter" style={{ "--d": `${0.15 + i * 0.22}s` } as CSSProperties}>
          {ch}
        </span>
      ))}
    </p>
  );
}

const linkCls = "text-[15px] text-paper-dim no-underline transition-colors duration-200 hover:text-paper hover:underline hover:underline-offset-4";

export function LandingFooter({ member, onEnter }: { member: boolean; onEnter: (to?: string) => void }) {
  const year = new Date().getFullYear();
  const columns: { title: string; items: React.ReactNode[] }[] = [
    {
      title: "El club",
      items: [
        <a key="m" href="#carteles" className={linkCls}>Modos de juego</a>,
        <a key="c" href="#carta" className={linkCls}>La carta de la casa</a>,
        <a key="r" href="#rangos" className={linkCls}>Rangos</a>,
      ],
    },
    {
      title: "Jugar",
      items: [
        <button key="e" type="button" onClick={() => onEnter()} className={`${linkCls} text-left`}>{member ? "Volver al club" : "Entrar al club"}</button>,
        <a key="p" href="#adentro" onClick={() => window.dispatchEvent(new Event("noir:pass"))} className={linkCls}>Tengo contraseña</a>,
        <button key="t" type="button" onClick={() => onEnter("/jugar?p=list")} className={`${linkCls} text-left`}>Mesas abiertas</button>,
        <button key="o" type="button" onClick={() => onEnter("/jugar?p=tourney")} className={`${linkCls} text-left`}>Abrir un torneo</button>,
      ],
    },
    {
      title: "La casa",
      items: [
        <a key="g" href="https://github.com/MrxHuaang/poker-sim" target="_blank" rel="noopener noreferrer" className={linkCls}>El código, en GitHub</a>,
        <span key="f" className="text-[15px] text-paper-mute">Las fichas no valen dinero</span>,
      ],
    },
  ];

  return (
    <footer className="relative mt-10 border-t-4 border-brass-700 bg-[#0e0b09] text-paper" data-group>
      <div className="mx-auto max-w-[1320px] px-[clamp(18px,4vw,48px)] pt-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
          <div className="flex flex-col items-start gap-5">
            <KeyholeLogo />
            <p className="m-0 max-w-[36ch] text-[16px] leading-relaxed text-paper-dim">
              Póker entre amigos en una trastienda de 1929, cada uno desde su dispositivo. Todo el arte está dibujado en código.
            </p>
            <button type="button" onClick={() => onEnter()} className="tk tk-sm tk-red">
              {member ? "Volver al club" : "Entrar al club"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {columns.map((c) => (
              <nav key={c.title} aria-label={c.title} className="flex flex-col gap-3">
                <p className="stencil m-0 text-xl tracking-[.04em] text-paper">{c.title}</p>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {c.items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
        <div className="mt-16 pb-2">
          <StencilSign />
        </div>
      </div>
      <div className="border-t-2 border-soot-800">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-2 px-[clamp(18px,4vw,48px)] py-5 font-pix text-[13px] tracking-[.06em] text-paper-mute sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0">© {year} Noir, club de póker. La casa invita.</p>
          <p className="m-0">
            Atendido por{" "}
            <a href="https://github.com/MrxHuaang" target="_blank" rel="noopener noreferrer" className="text-paper-dim hover:text-paper">
              MrxHuaang
            </a>{" "}
            y compañía
          </p>
        </div>
      </div>
    </footer>
  );
}
