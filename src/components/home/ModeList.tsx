"use client";
// The ways to sit down, as an editorial list instead of three look-alike
// cards: an index numeral, a serif title with its suit, one plain sentence and
// the facts in small caps. Shared by the home page and the nav's "Crear sala"
// sheet so both always describe the modes the same way.
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export type GameMode = {
  href: string;
  title: string;
  suit: "♠" | "♥" | "♦" | "♣";
  line: string;
  facts: string[];
  cta: string;
};

export const GAME_MODES: GameMode[] = [
  {
    href: "/jugar",
    title: "Online",
    suit: "♥",
    line: "Cash game con las monedas de tu perfil. El servidor baraja y valida cada jugada.",
    facts: ["Buy-in y cash-out", "Side pots", "XP por mano"],
    cta: "Crear mesa",
  },
  {
    href: "/jugar",
    title: "Torneo",
    suit: "♦",
    line: "Niveles de ciegas con reloj, eliminaciones y podio. Tú llevas el control.",
    facts: ["Ciegas escalonadas", "Knockouts", "Ranking final"],
    cta: "Crear torneo",
  },
];

export function ModeList({
  compact = false,
  onNavigate,
  extra,
}: {
  compact?: boolean;
  onNavigate?: () => void;
  // Optional trailing action per mode (e.g. "¿Cómo funciona?").
  extra?: Partial<Record<string, React.ReactNode>>;
}) {
  return (
    <ol className="flex flex-col border-t border-line">
      {GAME_MODES.map((m, i) => (
        <li key={m.href} className="border-b border-line">
          <div
            className={`group relative grid items-baseline gap-x-6 gap-y-2 transition-colors duration-300 hover:bg-bone/[0.025] ${
              compact
                ? "grid-cols-[2rem_1fr] px-2 py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]"
                : "grid-cols-[2.5rem_1fr] px-2 py-7 sm:px-4 lg:grid-cols-[3.5rem_minmax(0,16rem)_minmax(0,1fr)_auto] lg:py-9"
            }`}
          >
            <span className="numeric text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
            <Link
              href={m.href}
              onClick={onNavigate}
              className="flex items-baseline gap-3 outline-none after:absolute after:inset-0 after:content-['']"
            >
              <span className={`display text-primary ${compact ? "text-3xl" : "text-4xl sm:text-5xl"}`}>
                {m.title}
              </span>
              <span
                className={`suit transition-colors duration-300 group-hover:text-accent-400 ${
                  m.suit === "♥" || m.suit === "♦" ? "suit-red" : ""
                } ${compact ? "text-xl" : "text-2xl"}`}
                aria-hidden
              >
                {m.suit}
              </span>
            </Link>
            <div className={`col-start-2 ${compact ? "sm:col-start-2" : "lg:col-start-3"} flex flex-col gap-2`}>
              <p className={`text-secondary leading-relaxed ${compact ? "text-sm" : "text-[15px] max-w-[46ch]"}`}>
                {m.line}
              </p>
              <p className="eyebrow">{m.facts.join("  ·  ")}</p>
            </div>
            <div
              className={`relative z-[1] col-start-2 flex items-center gap-4 ${
                compact ? "sm:col-start-3 sm:row-start-1" : "lg:col-start-4 lg:row-start-1"
              }`}
            >
              {extra?.[m.href]}
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                {m.cta}
                <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
