"use client";
// The rank ladder: a pinned room. The rank you have reached with the scroll
// stands big under a follow spot; along the bottom a staircase of the seven
// emblems climbs with it (the ones below stay lit, the ones above are
// shadows). State is derived from the scroll (Landing.tsx sets --p and
// data-state on every [data-i]); everything else is CSS, so nothing can get
// stuck half-way.
import type { CSSProperties } from "react";
import { RankEmblem } from "@/components/landing/RankEmblem";
import { TITLES } from "@/lib/progression";

const LINES: Record<string, string> = {
  Peon: "Llegas con lo puesto. Todos te miran las manos.",
  Timador: "Ya sabes cuándo farolear y cuándo callarte.",
  Sicario: "Te sientan cerca del crupier. Por si acaso.",
  Capo: "Tu silla tiene nombre. Nadie más se sienta ahí.",
  Verdugo: "Cuando subes, la mesa entera se retira.",
  Espectro: "Nadie te vio entrar. Todos te vieron cobrar.",
  Noir: "El club lleva tu nombre en la puerta.",
};
const pretty = (n: string) => (n === "Peon" ? "Peón" : n);

export function RankLadder() {
  const n = TITLES.length;
  return (
    <section id="rangos" className="ranks relative z-[2] h-[330vh]" data-rank="0" style={{ "--p": 0 } as CSSProperties} aria-label="Rangos del club">
      <div className="sticky top-0 h-dvh overflow-hidden">
        <i className="rank-glow pointer-events-none absolute inset-0" aria-hidden />
        {TITLES.map((t, i) => (
          <b key={t.name} className="rank-ghost stencil pointer-events-none absolute -bottom-[.12em] right-[-.04em] text-[clamp(220px,34vw,560px)] leading-[.8] text-paper" data-i={i} aria-hidden>
            {t.level}
          </b>
        ))}

        <div className="relative mx-auto grid h-full w-full max-w-[1320px] grid-rows-[minmax(0,1fr)_auto] px-[clamp(18px,4vw,48px)] pt-[clamp(84px,11dvh,112px)] pb-[clamp(14px,3dvh,32px)]">
          <div className="grid min-h-0 grid-cols-1 items-center gap-4 min-[860px]:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
            {/* the rank under the light, in words */}
            <div className="grid content-center gap-[clamp(10px,2dvh,18px)]">
              <h2 className="stencil m-0 max-w-[14ch] text-[clamp(34px,min(4.6vw,7dvh),80px)]">Aquí el respeto se gana en la mesa</h2>
              <div className="relative h-[clamp(120px,21dvh,210px)]">
                {TITLES.map((t, i) => (
                  <div key={t.name} className="rank-now absolute inset-0 grid content-start gap-2" data-i={i} aria-hidden={i > 0}>
                    <span className="kick">
                      Rango {i + 1} de {n} · desde el nivel {t.level}
                    </span>
                    <b className="rank-name stencil block text-[clamp(52px,min(7.4vw,11dvh),124px)] text-tungsten-400">{pretty(t.name)}</b>
                    <p className="m-0 max-w-[34ch] text-[clamp(15px,1.2vw,18px)] text-paper-dim">{LINES[t.name]}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* the rank under the light, as its emblem */}
            <div className="relative hidden h-full min-h-0 min-[860px]:block" aria-hidden>
              <span className="rank-beam" />
              {TITLES.map((t, i) => (
                <div key={t.name} className="rank-big absolute inset-0 grid place-items-center" data-i={i}>
                  <RankEmblem tier={i} className="h-[min(46dvh,100%)] max-w-full" />
                </div>
              ))}
            </div>
          </div>

          {/* the staircase: all seven, small, each on its own ledge */}
          <ol className="relative m-0 mr-[clamp(38px,8vw,116px)] h-[clamp(120px,24dvh,230px)] list-none p-0" aria-label="Los siete rangos">
            {TITLES.map((t, i) => (
              <li
                key={t.name}
                className="rank-step absolute flex w-[clamp(38px,8vw,116px)] flex-col items-center"
                data-i={i}
                style={{ left: `${(i / (n - 1)) * 100}%`, bottom: `${(i / (n - 1)) * 44}%` } as CSSProperties}
              >
                <RankEmblem tier={i} className="rank-emblem w-full" />
                <i className="rank-ledge" />
                <span className="rank-label font-pix text-[12px] tracking-[.1em] uppercase">{pretty(t.name)}</span>
                <span className="sr-only">nivel {t.level}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
