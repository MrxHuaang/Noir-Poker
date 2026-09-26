"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ModeList } from "@/components/home/ModeList";

type Step = 1 | 2;

export default function JugarPage() {
  const scope = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>(1);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".step-shell", {
          opacity: 0,
          y: 18,
          duration: 0.5,
          ease: "power3.out",
          clearProps: "all",
        });
        gsap.from(".step-card", {
          opacity: 0,
          y: 24,
          duration: 0.42,
          ease: "power3.out",
          stagger: 0.07,
          delay: 0.08,
          clearProps: "all",
        });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [step], revertOnUpdate: true },
  );

  return (
    <div ref={scope} className="relative isolate w-full">
      <div className="relative z-[2] mx-auto w-full max-w-6xl px-5 pt-14 pb-24 sm:px-8 sm:pt-20">
        <header className="step-shell grid grid-cols-1 gap-6 pb-12 lg:grid-cols-12 lg:items-end lg:gap-8 lg:pb-14">
          <div className="lg:col-span-8">
            <p className="eyebrow mb-5 flex items-center gap-2">
              <span className="suit text-sm" aria-hidden>
                ♠
              </span>
              Jugar ahora · Paso <span className="numeric">{step}</span> de <span className="numeric">2</span>
            </p>
            <h1 className="display text-5xl text-primary sm:text-6xl">
              {step === 1 ? (
                <>
                  ¿Qué quieres <em className="text-accent-200">hacer</em>?
                </>
              ) : (
                <>
                  Elige el <em className="text-accent-200">tipo de sala</em>.
                </>
              )}
            </h1>
          </div>
          <p className="max-w-[42ch] text-[15px] leading-relaxed text-secondary lg:col-span-4">
            {step === 1
              ? "Abre una mesa nueva o entra con código a una que ya está en marcha."
              : "Las tres usan el mismo código de sala y guardan el historial de cada mano."}
          </p>
        </header>

        <section className="step-shell" aria-label={step === 1 ? "Opciones" : "Tipos de sala"}>
          <div className="mb-3 flex min-h-11 items-center justify-between gap-4">
            <p className="eyebrow">{step === 1 ? "Dos caminos" : "Tres modos"}</p>
            {step === 2 ? (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn-link inline-flex min-h-11 items-center gap-1.5 text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver
              </button>
            ) : null}
          </div>

          {step === 1 ? (
            <ol className="flex flex-col border-t border-line">
              <li className="step-card border-b border-line">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="group block w-full text-left transition-colors duration-300 hover:bg-bone/[0.025]"
                >
                  <ChoiceRow
                    index={1}
                    title="Crear una sala"
                    line="Presencial, online o torneo. Eliges el modo en el siguiente paso."
                    cta="Elegir modo"
                  />
                </button>
              </li>
              <li className="step-card border-b border-line">
                <Link
                  href="/join"
                  className="group block transition-colors duration-300 hover:bg-bone/[0.025]"
                >
                  <ChoiceRow
                    index={2}
                    title="Tengo un código"
                    line="Entra a una mesa que ya está abierta con el código o el QR que te pasaron."
                    cta="Unirme"
                  />
                </Link>
              </li>
            </ol>
          ) : (
            <div className="step-card">
              <ModeList />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// Same anatomy as the ModeList rows: index numeral, serif title, one plain
// sentence and an arrow CTA.
function ChoiceRow({
  index,
  title,
  line,
  cta,
}: {
  index: number;
  title: string;
  line: string;
  cta: ReactNode;
}) {
  return (
    <span className="grid grid-cols-[2.5rem_1fr] items-baseline gap-x-6 gap-y-2 px-2 py-7 sm:px-4 lg:grid-cols-[3.5rem_minmax(0,18rem)_minmax(0,1fr)_auto] lg:py-9">
      <span className="numeric text-xs text-muted">{String(index).padStart(2, "0")}</span>
      <span className="display text-4xl text-primary sm:text-5xl">{title}</span>
      <span className="col-start-2 max-w-[46ch] text-[15px] leading-relaxed text-secondary lg:col-start-3">
        {line}
      </span>
      <span className="col-start-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary lg:col-start-4 lg:row-start-1">
        {cta}
        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
      </span>
    </span>
  );
}
