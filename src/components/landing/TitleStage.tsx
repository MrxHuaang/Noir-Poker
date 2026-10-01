"use client";
// The landing's first screen, built like a game's title screen instead of a
// web hero: a closed club door, a peephole that slides open, eyes that check
// who is knocking, then the door parts on the live 3D table. The NOIR title
// and a keyboard-driven menu float over the scene. Scrolling dissolves the
// title screen into three beats over the same scene (one WebGL context).
//
// Entry is CSS transitions keyed on data-phase (noir.css, "Title stage"):
// closed -> slot -> open -> titled. The door waits for the scene's first
// frame (postMessage sceneReady) so it never opens on a black room.
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Spade } from "lucide-react";
import { KeyholeMark } from "@/components/landing/KeyholeLogo";
import { sceneUrl } from "@/lib/noirCast";
import { playChip } from "@/lib/sound";

export type Phase = "closed" | "slot" | "open" | "titled";

const BEATS = [
  { n: "El crupier", h: "Reparte la casa", p: "Nadie toca el mazo. Ni siquiera quien abre la mesa." },
  { n: "El reloj", h: "Un cigarrillo por turno", p: "Treinta segundos sobre el cenicero. Cuando se apaga, la mano sigue sin ti." },
  { n: "El all-in", h: "Se apaga la luz", p: "Las cartas se ponen boca arriba y el tablero llega despacio." },
];

const SEEN_KEY = "noir:door-seen";
const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

export function TitleStage({
  member,
  onEnter,
  onPass,
  onPhase,
}: {
  member: boolean;
  onEnter: (to?: string) => void;
  onPass: (code: string) => void;
  onPhase: (p: Phase) => void;
}) {
  const stage = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<Phase>("closed");
  const [active, setActive] = useState(0);
  const [passOpen, setPassOpen] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const passInput = useRef<HTMLInputElement>(null);

  // Door choreography. A second visit in the same session skips the knock.
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
    let ready = false;
    let minDone = false;
    const timers: number[] = [];
    const open = () => {
      setPhase((p) => (p === "open" || p === "titled" ? p : "open"));
      timers.push(window.setTimeout(() => setPhase("titled"), 700));
    };
    const tryOpen = () => {
      if (ready && minDone) open();
    };
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.sceneReady !== "embed") return;
      ready = true;
      tryOpen();
    };
    window.addEventListener("message", onMsg);
    if (seen) {
      minDone = true;
      timers.push(window.setTimeout(open, 80));
    } else {
      timers.push(window.setTimeout(() => setPhase("slot"), 450));
      timers.push(
        window.setTimeout(() => {
          minDone = true;
          tryOpen();
        }, 1900),
      );
      // Never keep anyone at the door: open even if the scene is slow.
      timers.push(window.setTimeout(open, 3600));
    }
    return () => {
      window.removeEventListener("message", onMsg);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  useEffect(() => onPhase(phase), [phase, onPhase]);

  // "Tengo contraseña" elsewhere on the page opens the field here.
  useEffect(() => {
    const open = () => {
      setActive(1);
      setPassOpen(true);
    };
    window.addEventListener("noir:pass", open);
    return () => window.removeEventListener("noir:pass", open);
  }, []);

  // Three ways in, each one somewhere real: the club panel, a table by its
  // password, or the list of open tables in the club panel.
  type Action = "enter" | "pass" | "tables";
  const items: { label: string; action: Action }[] = [
    { label: member ? "Volver al club" : "Entrar al club", action: "enter" },
    { label: "Tengo contraseña", action: "pass" },
    { label: "Mesas abiertas", action: "tables" },
  ];
  const run = (action: Action) => {
    if (action === "enter") onEnter();
    else if (action === "pass") setPassOpen((v) => !v);
    else onEnter("/jugar?p=list");
  };

  useEffect(() => {
    if (passOpen) passInput.current?.focus({ preventScroll: true });
  }, [passOpen]);

  // Arrow keys move the spade, Enter picks, like any title screen.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (phase !== "titled" || window.scrollY > window.innerHeight * 0.4) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.closest("dialog"))) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((active + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
      playChip();
    } else if (e.key === "Enter" && !(t && t.closest("[data-menu]"))) {
      e.preventDefault();
      run(items[active].action);
    }
  });
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function pass(e: FormEvent) {
    e.preventDefault();
    const v = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (v.length < 4) {
      setMsg("Son cuatro letras o números. Pídela a quien abrió la mesa.");
      return;
    }
    setMsg(`Mesa ${v}. Te abren.`);
    onPass(v);
  }

  return (
    <section ref={stage} id="adentro" data-phase={phase} className="title-stage relative h-[400vh]" aria-label="Noir, club de póker">
      <div className="sticky top-0 h-dvh overflow-hidden bg-[#07060a]">
        <iframe
          src={sceneUrl("embed", { pan: 0.26 })}
          title="Partida simulada en vivo en la trastienda"
          tabIndex={-1}
          className="stage-scene pointer-events-none absolute inset-0 h-full w-full border-0"
        />
        <div className="stage-shade pointer-events-none absolute inset-0" aria-hidden />

        {/* Title screen */}
        <div className="title-layer absolute inset-0 flex flex-col justify-end px-[clamp(18px,5vw,72px)] pb-[clamp(40px,9vh,96px)] min-[900px]:justify-center min-[900px]:pb-0">
          <div className="title-logo flex items-end gap-[clamp(10px,1.4vw,20px)]">
            <span style={delay(0)}>
              <KeyholeMark className="h-[clamp(64px,9vw,128px)] w-auto" />
            </span>
            <span style={delay(0.08)}>
              <b className="stencil block text-[clamp(84px,13vw,196px)] leading-[.78] tracking-[.04em]">NOIR</b>
            </span>
          </div>
          <p className="title-in mt-4 font-pix text-[clamp(13px,1.1vw,16px)] tracking-[.22em] text-brass-200" style={delay(0.35)}>
            CLUB DE PÓKER · 1929
          </p>
          <p className="title-in mt-3 max-w-[36ch] text-[clamp(17px,1.4vw,21px)] text-paper-dim" style={delay(0.45)}>
            Nadie aquí enseña la cara. Póker entre amigos, cada uno desde su teléfono.
          </p>

          <ul className="mt-[clamp(22px,4vh,40px)] grid w-fit list-none gap-1 p-0" data-menu>
            {items.map((it, i) => {
              const on = i === active;
              const cls = `group flex h-12 items-center gap-3 pr-4 font-stencil text-[clamp(24px,2.3vw,32px)] font-extrabold uppercase tracking-[.06em] no-underline transition-[color,translate] duration-200 ${
                on ? "translate-x-2 text-tungsten-400" : "text-paper hover:text-paper"
              }`;
              const inner = (
                <>
                  <Spade className={`h-5 w-5 flex-none fill-current transition-opacity duration-200 ${on ? "opacity-100" : "opacity-0"}`} aria-hidden />
                  {it.label}
                </>
              );
              return (
                <li key={it.label} className="title-in" style={delay(0.6 + i * 0.07)}>
                  <button type="button" className={cls} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => run(it.action)} aria-expanded={it.action === "pass" ? passOpen : undefined}>
                    {inner}
                  </button>
                  {i === 1 && passOpen && (
                    <form className="mt-1 mb-2 ml-8 flex max-w-[420px] items-stretch" onSubmit={pass} autoComplete="off">
                      <label htmlFor="pass-code" className="sr-only">
                        Contraseña de la mesa
                      </label>
                      <input
                        ref={passInput}
                        id="pass-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setPassOpen(false);
                        }}
                        maxLength={8}
                        placeholder="Contraseña"
                        aria-describedby="pass-msg"
                        className="slot-input h-12 min-w-0 flex-1 px-4 font-pix text-xl font-bold uppercase tracking-[.3em] placeholder:text-base placeholder:tracking-[.12em] placeholder:text-paper-mute"
                      />
                      <button type="submit" className="tk tk-sm tk-right">
                        Pasar
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          <p id="pass-msg" role="status" className="mt-1 ml-8 min-h-[1.5em] font-pix text-[15px] text-tungsten-400">
            {msg}
          </p>
        </div>

        {/* Beats that replace the title as you scroll */}
        <div className="stage-meta pointer-events-none invisible opacity-0">
          <p className="absolute right-[clamp(18px,4vw,48px)] top-24 m-0 flex items-center gap-2 border-l-2 border-blood-400 bg-soot-900/80 px-3 py-1.5 font-pix text-[13px] text-paper">
            <i className="onair-dot h-2 w-2 rounded-full bg-blood-400" aria-hidden />
            Mano simulada en directo
          </p>
          <div className="absolute bottom-8 left-[clamp(18px,5vw,72px)] flex gap-1.5" aria-hidden>
            {BEATS.map((b) => (
              <i key={b.h} className="h-1 w-10 overflow-hidden bg-paper/15">
                <b className="meter-bar block h-full origin-left scale-x-0 bg-tungsten-400" />
              </i>
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute left-[clamp(18px,5vw,72px)] top-1/2 w-[min(430px,80vw)] -translate-y-1/2">
          {BEATS.map((b) => (
            <article key={b.h} className="beat invisible absolute left-0 top-0 -translate-y-1/2 opacity-0">
              <span className="kick">{b.n}</span>
              <h2 className="stencil mt-2.5 mb-3.5 text-[clamp(46px,5.4vw,84px)]">{b.h}</h2>
              <p className="m-0 max-w-[32ch] text-paper-dim">{b.p}</p>
            </article>
          ))}
        </div>

        {/* The club door, closed until the peephole has seen you */}
        <div className="door pointer-events-none absolute inset-0" aria-hidden>
          <i className="door-half door-top" />
          <i className="door-half door-bottom" />
          <span className="peep-slot">
            <span className="peep-eyes">
              <b />
              <b />
            </span>
            <span className="peep-cover" />
          </span>
        </div>
      </div>
    </section>
  );
}
