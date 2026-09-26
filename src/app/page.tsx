"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowRight } from "lucide-react";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { PresencialTutorial } from "@/components/home/PresencialTutorial";
import { ModeList } from "@/components/home/ModeList";
import { SiteFooter } from "@/components/home/SiteFooter";
import { cardFromId } from "@/lib/poker";

const HAND = ["AS", "KS"].map((id) => cardFromId(id)!);

const TRAITS = [
  {
    title: "Tus cartas son tuyas",
    body: "Nadie más las recibe: ni el resto de la mesa ni la pantalla grande. El mazo nunca sale del servidor.",
  },
  {
    title: "Monedas que se ganan",
    body: "Compras fichas al sentarte y vuelven a tu perfil al levantarte. Cada mano jugada suma experiencia y rango.",
  },
  {
    title: "Se juega hablando",
    body: "Canal de voz entre teléfonos, chat y frases rápidas sin salir de la mano.",
  },
  {
    title: "Mesas que perdonan",
    body: "Si el host recarga o alguien se va a mitad de mano, las fichas cuadran igual.",
  },
];

export default function Home() {
  const router = useRouter();
  const [showTutorial, setShowTutorial] = useState(false);
  const [code, setCode] = useState("");
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".hero-line", {
          opacity: 0,
          y: 18,
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.08,
          clearProps: "all",
        });
        gsap.from(".reveal", {
          opacity: 0,
          y: 14,
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.06,
          delay: 0.35,
          clearProps: "all",
        });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [] },
  );

  function join(e: React.FormEvent) {
    e.preventDefault();
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    router.push(clean ? `/join?code=${clean}` : "/join");
  }

  return (
    <div ref={scope} className="relative isolate w-full">
      <div className="relative z-[2] mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* Hero */}
        <section className="grid grid-cols-1 items-center gap-12 pt-14 pb-20 sm:pt-20 lg:grid-cols-12 lg:gap-8 lg:pt-24 lg:pb-28">
          <div className="lg:col-span-7">
            <p className="hero-line eyebrow mb-6 flex items-center gap-2">
              <span className="suit text-sm" aria-hidden>♠</span>
              Texas Hold&apos;em para varias pantallas
            </p>
            <h1 className="hero-line display text-[3.25rem] leading-[0.98] text-primary sm:text-7xl lg:text-[5.5rem]">
              La mesa en una pantalla.{" "}
              <em className="text-accent-200">Tus cartas,</em> en tu bolsillo.
            </h1>
            <p className="hero-line mt-7 max-w-[52ch] text-base leading-relaxed text-secondary">
              Reúne a tus amigos alrededor de la tele o juega a distancia. Noir reparte, cuenta
              las fichas y resuelve el showdown; tú solo decides si vas o te retiras.
            </p>
            <div className="hero-line mt-9 flex flex-wrap items-center gap-3">
              <Link href="/jugar" className="btn-primary">
                Jugar ahora
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/lobby" className="btn-quiet">
                Ver mesas abiertas
              </Link>
            </div>
            <form onSubmit={join} className="hero-line mt-8 flex max-w-sm items-center gap-2">
              <label htmlFor="home-code" className="sr-only">
                Código de sala
              </label>
              <input
                id="home-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="¿Tienes un código?"
                maxLength={8}
                autoComplete="off"
                className="field numeric tracking-[0.2em] uppercase placeholder:tracking-normal placeholder:font-sans placeholder:normal-case"
              />
              <button type="submit" className="btn-quiet shrink-0 px-4" aria-label="Entrar con código">
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>

          {/* A real hand, dealt by the same card component the tables use. */}
          <div className="relative mx-auto flex h-72 w-full max-w-sm items-center justify-center lg:col-span-5 lg:h-96">
            <div
              className="absolute inset-x-6 bottom-6 h-24 rounded-[50%] blur-2xl"
              style={{ background: "oklch(0.08 0.005 60 / 0.8)" }}
              aria-hidden
            />
            <div className="relative flex -space-x-10 scale-125 sm:scale-150 lg:scale-[1.7]">
              <div className="-rotate-[9deg] translate-y-2">
                <PlayingCard card={HAND[0]} faceUp size="lg" dealIn dealDelay={0.2} flipDelay={0.5} />
              </div>
              <div className="rotate-[7deg]">
                <PlayingCard card={HAND[1]} faceUp size="lg" dealIn dealDelay={0.35} flipDelay={0.65} />
              </div>
            </div>
            <p className="absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap font-display text-lg italic text-muted">
              Ases y reyes, del mismo palo.
            </p>
          </div>
        </section>

        {/* Modes */}
        <section className="pb-24">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <h2 className="reveal display text-4xl text-primary sm:text-5xl">
              Tres formas de sentarse
            </h2>
            <p className="reveal max-w-[40ch] text-sm text-muted">
              Todas guardan el historial de cada mano y funcionan con el mismo código de sala.
            </p>
          </div>
          <div className="reveal">
            <ModeList
              extra={{
                "/host": (
                  <button
                    type="button"
                    onClick={() => setShowTutorial(true)}
                    className="btn-link text-sm"
                  >
                    Cómo funciona
                  </button>
                ),
              }}
            />
          </div>
        </section>

        {/* Traits */}
        <section className="grid grid-cols-1 gap-x-12 gap-y-10 pb-24 sm:grid-cols-2">
          {TRAITS.map((t, i) => (
            <div key={t.title} className="reveal flex gap-5">
              <span className="numeric pt-1 text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="text-lg font-semibold text-primary">{t.title}</h3>
                <p className="mt-2 max-w-[44ch] text-sm leading-relaxed text-secondary">{t.body}</p>
              </div>
            </div>
          ))}
        </section>

        <SiteFooter />
      </div>

      {showTutorial && <PresencialTutorial onClose={() => setShowTutorial(false)} />}
    </div>
  );
}
