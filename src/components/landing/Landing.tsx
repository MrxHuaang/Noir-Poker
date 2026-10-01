"use client";
// Landing: walk into the club. Title screen over the live table, two posters,
// the house menu, the rank ladder, the club door and the neon sign-off. Regulars step into
// the gaps between sections; the full cast is kept for after sign-in.
//
// Motion has two owners, on purpose:
// - Entrances are CSS transitions (noir.css, [data-group] / [data-reveal]),
//   armed by an IntersectionObserver. They cannot get stuck half-hidden when
//   ScrollTrigger refreshes or React remounts.
// - Scroll-linked motion (parallax, the pinned table beats)
//   is GSAP scrub: its state is always derived from the scroll.
// Reduced motion calms both instead of freezing the room: fades instead of
// slides, and parallax at a third of the travel.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Atmosphere } from "@/components/landing/Atmosphere";
import { Cameo, Walker } from "@/components/landing/Cameo";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNav } from "@/components/landing/LandingNav";
import { LoginDoor } from "@/components/landing/LoginDoor";
import { RankLadder } from "@/components/landing/RankLadder";
import { useShutter } from "@/components/landing/Shutter";
import { TitleStage, type Phase } from "@/components/landing/TitleStage";
import { useAuth } from "@/hooks/useAuth";
import { CAST, featuredCast, sceneUrl } from "@/lib/noirCast";
import { TITLES } from "@/lib/progression";
import { playKnock } from "@/lib/sound";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const MENU = [
  { name: "Run it twice", tag: "Dos tableros", p: "En un all-in se reparte dos veces y el bote se parte." },
  { name: "Reloj por turno", tag: "30 segundos", p: "Nadie se queda pensando la noche entera." },
  { name: "Voz en la mesa", tag: "Entre teléfonos", p: "Habla con los tuyos sin salir de la mano." },
  { name: "Cartas privadas", tag: "Solo tuyas", p: "El mazo vive en el servidor; tus cartas llegan solo a tu teléfono." },
  { name: "Fichas de la casa", tag: "A cuenta", p: "Te sientas con las que traes y vuelven a tu perfil al levantarte." },
  { name: "Mesa sin fichas", tag: "Para probar", p: "Recompras libres y los invitados también se sientan." },
  { name: "Historial de manos", tag: "Cada showdown", p: "Quién ganó, con qué y cuánto, mano por mano." },
  { name: "Fila de espera", tag: "Por llegada", p: "Mesa llena: miras desde la barra y te sientas en cuanto hay silla." },
];

const noop = () => () => {};
const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

function useFeatured() {
  return useSyncExternalStore(noop, () => featuredCast(), () => null);
}

/** Stencil heading revealed line by line. */
function Lines({ lines, className }: { lines: string[]; className: string }) {
  return (
    <h2 className={`stencil ${className}`} data-group aria-label={lines.join(" ")}>
      {lines.map((l, i) => (
        <span key={l} className="-mt-[.14em] block overflow-hidden pt-[.14em]" aria-hidden>
          <span className="inline-block" data-reveal="line" style={delay(i * 0.1)}>
            {l}
          </span>
        </span>
      ))}
    </h2>
  );
}

export function Landing() {
  const scope = useRef<HTMLDivElement>(null);
  const { user, isGuest } = useAuth();
  const member = Boolean(user && !isGuest);
  const { go, node: shutter } = useShutter();
  const [door, setDoor] = useState(false);
  const [phase, setPhase] = useState<Phase>("closed");
  const [knocked, setKnocked] = useState(false);
  const doorFrame = useRef<HTMLIFrameElement>(null);
  const featured = useFeatured();

  // Every way in lands in the club panel, on the right pane (?p=): members go
  // straight there, everyone else passes the login door first.
  const target = useRef("/jugar");
  const enter = useCallback(
    (to = "/jugar") => {
      target.current = to;
      if (member) go(to);
      else setDoor(true);
    },
    [member, go],
  );
  const walkIn = useCallback(() => {
    setDoor(false);
    go(target.current);
  }, [go]);

  const pass = useCallback(
    (code: string) => {
      playKnock();
      window.setTimeout(() => go(`/join?code=${code}`), 900);
    },
    [go],
  );

  // Knocking on the door: the peephole slides open, then someone lets you in.
  const knockDoor = useCallback(() => {
    playKnock();
    doorFrame.current?.contentWindow?.postMessage({ knock: true }, window.location.origin);
    setKnocked(true);
    window.setTimeout(() => {
      setKnocked(false);
      enter();
    }, 1400);
  }, [enter]);

  // Entrances: each [data-group] gets data-in once it scrolls into view.
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.setAttribute("data-in", "");
          io.unobserve(e.target);
        }),
      { rootMargin: "0px 0px -12% 0px" },
    );
    root.querySelectorAll("[data-group]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Scroll-linked motion.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { full: "(prefers-reduced-motion: no-preference)", calm: "(prefers-reduced-motion: reduce)" },
        (ctx) => {
          const k = ctx.conditions?.full ? 1 : 0.35;
          const scrub = (trigger: string, start = "top bottom", end = "bottom top") => ({ trigger, start, end, scrub: true });

          // Title stage: the title screen dissolves, then three beats pass
          // over the same pinned scene.
          const beats = gsap.utils.toArray<HTMLElement>(".beat");
          const bars = gsap.utils.toArray<HTMLElement>(".meter-bar");
          const tl = gsap.timeline({ scrollTrigger: { trigger: "#adentro", start: "top top", end: "bottom bottom", scrub: 0.6 } });
          tl.to(".title-layer", { autoAlpha: 0, y: -60 * k, duration: 0.6 }, 0.15);
          tl.to(".stage-meta", { autoAlpha: 1, duration: 0.4 }, 0.6);
          beats.forEach((b, i) => {
            tl.fromTo(b, { autoAlpha: 0, y: 40 * k }, { autoAlpha: 1, y: 0, duration: 0.5 }, 0.8 + i);
            tl.to(bars[i], { scaleX: 1, duration: 1, ease: "none" }, 0.8 + i);
            if (i < beats.length - 1) tl.to(b, { autoAlpha: 0, y: -40 * k, duration: 0.5 }, 1.55 + i);
          });

          // Regulars drift up while you pass them.
          gsap.utils.toArray<HTMLElement>(".cameo").forEach((c) =>
            gsap.to(c.querySelector(".cameo-fig"), { yPercent: -18 * k, ease: "none", scrollTrigger: { trigger: c, start: "top bottom", end: "top top", scrub: true } }),
          );

          // Posters swing apart; the menu card tilts as it passes.
          gsap.fromTo(".poster-light", { yPercent: 7 * k, rotate: 1.5 * k }, { yPercent: -7 * k, rotate: -2.5 * k, ease: "none", scrollTrigger: scrub("#carteles") });
          gsap.fromTo(".poster-dark", { yPercent: -5 * k, rotate: -1.5 * k }, { yPercent: 6 * k, rotate: 2.5 * k, ease: "none", scrollTrigger: scrub("#carteles") });
          gsap.fromTo(".menu-card", { rotate: -1.5 * k, y: 40 * k }, { rotate: 0.6 * k, y: -30 * k, ease: "none", scrollTrigger: scrub("#carta") });

          // Rank ladder: the follow spot climbs one step per stretch of scroll.
          const ladder = document.querySelector<HTMLElement>(".ranks");
          if (ladder) {
            let last = -1;
            const paint = (p: number) => {
              ladder.style.setProperty("--p", p.toFixed(3));
              const on = Math.min(TITLES.length - 1, Math.floor(p * TITLES.length * 0.999));
              if (on === last && !ladder.querySelector("[data-i]:not([data-state])")) return;
              last = on;
              ladder.dataset.rank = String(on);
              // Queried each time: React may have replaced the nodes (remount, refresh).
              ladder.querySelectorAll<HTMLElement>("[data-i]").forEach((el) => {
                const i = Number(el.dataset.i);
                el.dataset.state = i < on ? "past" : i === on ? "on" : "next";
              });
            };
            paint(0);
            ScrollTrigger.create({ trigger: ladder, start: "top top", end: "bottom bottom", onUpdate: (st) => paint(st.progress), onRefresh: (st) => paint(st.progress) });
          }


        },
      );
      // Revert explicitly: under StrictMode the hook mounts twice.
      return () => mm.revert();
    },
    { scope, dependencies: [] },
  );

  return (
    <div ref={scope} className="motion relative isolate overflow-x-clip bg-soot-900 text-paper">
      <noscript>
        <style>{".motion [data-reveal]{opacity:1!important;translate:none!important;rotate:none!important;scale:none!important}"}</style>
      </noscript>
      <Atmosphere />
      <LandingNav member={member} onEnter={() => enter()} show={phase === "titled"} />
      <TitleStage member={member} onEnter={enter} onPass={pass} onPhase={setPhase} />

      {/* Ticker */}
      <div className="relative z-[6] overflow-hidden border-y border-brass-700 bg-[#0e0b09] shadow-[0_1px_0_#050404,0_-1px_0_#050404]" aria-label="Lo que hay en el club">
        <div className="ticker-run flex w-max gap-14 py-3.5">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex gap-14" aria-hidden={dup === 1}>
              {[
                ["Mesas de hasta", "9 sillas"],
                ["Cada turno dura", "30 s"],
                ["En cada all-in", "Run it twice"],
                ["Voz", "Entre teléfonos"],
                ["Personaje de la semana", featured ? CAST[featured].name : ""],
              ].map(([a, b]) => (
                <span key={a} className="flex items-center gap-3.5 whitespace-nowrap font-stencil text-[19px] font-extrabold uppercase tracking-[.08em] text-paper-dim">
                  <i className="h-2 w-2 rotate-45 bg-blood-400" />
                  {a} <b className="font-mono font-semibold tracking-normal text-tungsten-400">{b}</b>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <Cameo id="anselmo" turn={-0.5} side="r" y={-10} title="Cranky Colombo con su bastón" />

      {/* Two ways to play */}
      {/* Sized to the screen: "Modos" in the nav lands on both posters whole. */}
      <section id="carteles" aria-label="Modos de juego" className="relative z-[2] mx-auto grid max-w-[1320px] grid-cols-1 content-center items-end gap-[clamp(20px,3vw,44px)] px-[clamp(18px,4vw,48px)] pt-[clamp(96px,12dvh,130px)] pb-[clamp(48px,7dvh,90px)] min-[820px]:min-h-dvh min-[820px]:grid-cols-2">
        <Lines lines={["Dos maneras de", "perder la camisa"]} className="col-span-full text-[clamp(44px,min(6vw,8.5dvh),104px)]" />
        <div className="poster-light" data-group>
          <article
            className="poster relative flex aspect-[3/4] min-[820px]:aspect-auto min-[820px]:h-[min(60dvh,680px)] -rotate-[1.6deg] flex-col overflow-hidden bg-[#e6dcc6] p-[clamp(22px,2.6vw,36px)] text-card-ink shadow-[0_30px_70px_rgb(0_0_0/.6)]"
            data-reveal="rise"
          >
            <div className="flex justify-between font-pix text-[13px] tracking-[.1em]">
              <span>MESA DE SIEMPRE</span>
              <span>2 A 9 SILLAS</span>
            </div>
            <span className="stencil absolute -right-2.5 top-10 text-[clamp(90px,12vw,200px)] leading-[.8] opacity-10" aria-hidden>9</span>
            <h3 className="stencil mt-auto text-[clamp(56px,min(7.4vw,10dvh),132px)] leading-[.82]">
              Partida <em className="not-italic text-blood-400">abierta</em>
            </h3>
            <p className="mt-[clamp(8px,1.6dvh,16px)] mb-[clamp(10px,2dvh,20px)] max-w-[32ch] text-base opacity-85">
              Entras y sales cuando quieres. Te sientas con las fichas que traes y la casa lleva las cuentas.
            </p>
            <div className="mb-5 flex flex-wrap gap-1.5">
              {["RUN IT TWICE", "FILA DE ESPERA", "SIN FICHAS"].map((f) => (
                <span key={f} className="border-[1.5px] border-current px-2 py-0.5 font-pix text-[13px]">{f}</span>
              ))}
            </div>
            <button type="button" className="tk tk-sm self-start" onClick={() => enter("/jugar?p=open")}>Abrir una mesa</button>
          </article>
        </div>
        <div className="poster-dark min-[820px]:translate-y-6" data-group>
          <article
            className="poster relative flex aspect-[3/4] min-[820px]:aspect-auto min-[820px]:h-[min(60dvh,680px)] rotate-[1.2deg] flex-col overflow-hidden bg-soot-800 p-[clamp(22px,2.6vw,36px)] text-paper shadow-[0_30px_70px_rgb(0_0_0/.6)]"
            data-reveal="rise"
            style={delay(0.15)}
          >
            <span className="stencil absolute -right-[54px] top-[34px] rotate-[38deg] bg-blood-500 px-16 py-1.5 text-[17px] tracking-[.1em] text-white" data-reveal="pop" style={delay(0.7)}>CIEGAS CON RELOJ</span>
            <div className="flex justify-between font-pix text-[13px] tracking-[.1em]">
              <span>TORNEO</span>
            </div>
            <h3 className="stencil mt-auto text-[clamp(56px,min(7.4vw,10dvh),132px)] leading-[.82]">
              Uno <em className="not-italic text-blood-400">solo</em> se levanta
            </h3>
            <p className="mt-[clamp(8px,1.6dvh,16px)] mb-[clamp(10px,2dvh,20px)] max-w-[32ch] text-base opacity-85">
              Todos empiezan con las mismas fichas. Las ciegas suben con el reloj y se paga por puesto.
            </p>
            <TourneyClock />
            <button type="button" className="tk tk-sm tk-red self-start" onClick={() => enter("/jugar?p=tourney")}>Abrir un torneo</button>
          </article>
        </div>
      </section>

      <Cameo id="lulu" turn={0.5} side="l" y={-60} title="Tifa Lockwood junto al micrófono" />

      {/* The house menu */}
      <section id="carta" className="relative z-[2] mx-auto max-w-[1320px] px-[clamp(18px,4vw,48px)] pt-[clamp(80px,10vw,150px)] pb-[clamp(150px,16vw,230px)]">
        <div className="menu-card relative mx-auto max-w-[980px] bg-card px-[clamp(22px,5vw,72px)] py-[clamp(28px,5vw,64px)] text-card-ink shadow-[0_30px_80px_rgb(0_0_0/.6)]" data-group>
          <h2 className="stencil text-center text-[clamp(46px,6vw,90px)]">La carta de la casa</h2>
          <p className="mt-2 mb-9 text-center font-pix text-sm tracking-[.14em] text-[#5a4d3e]">SE SIRVE EN TODAS LAS MESAS</p>
          <ul className="m-0 grid list-none grid-cols-1 gap-x-14 gap-y-6 p-0 min-[760px]:grid-cols-2">
            {MENU.map((m, i) => (
              <li key={m.name} className="grid gap-0.5" data-reveal="up" style={delay(0.2 + i * 0.06)}>
                <div className="flex items-baseline gap-2.5 font-stencil text-2xl font-extrabold uppercase tracking-[.02em]">
                  {m.name}
                  <i className="flex-1 origin-left -translate-y-1.5 border-b-2 border-dotted border-[#8a7f6d]" data-reveal="draw" style={delay(0.35 + i * 0.06)} />
                  <b className="whitespace-nowrap font-pix text-sm font-bold uppercase tracking-[.06em] text-blood-500" data-reveal="stamp" style={delay(0.7 + i * 0.06)}>
                    {m.tag}
                  </b>
                </div>
                <p className="m-0 text-[15px] text-[#4a4034]">{m.p}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Tano crosses the room under the menu card, behind everything */}
      <div className="relative z-[1] h-0">
        <Walker id="gaetano" title="Tano Warisco cruza la sala" className="bottom-2" />
      </div>

      {/* Rank ladder: a follow spot climbs the seven ranks with the scroll */}
      <RankLadder />

      <Cameo id="iturbe" turn={-0.3} side="l" y={10} act="fall" title="Jimbo Balatri tropieza y se cae" />

      {/* The door: the last thing before the club. The door itself is the button. */}
      <section id="abrir" className="relative z-[2] mx-auto max-w-[1320px] px-[clamp(18px,4vw,48px)] pt-[clamp(170px,17vw,250px)] pb-[clamp(80px,10vw,140px)]" data-group>
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#07060a] shadow-[0_0_0_1px_var(--color-brass-700),0_40px_90px_rgb(0_0_0/.6)] min-[760px]:aspect-[2/1]" data-reveal="rise">
          <iframe
            ref={doorFrame}
            src={sceneUrl("door")}
            loading="lazy"
            tabIndex={-1}
            title="Puerta del club con mirilla"
            className="pointer-events-none absolute inset-0 h-full w-full border-0"
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgb(11_9_8/.88),rgb(11_9_8/.35)_38%,transparent_55%)] max-[759px]:bg-[linear-gradient(0deg,rgb(11_9_8/.92),transparent_55%)]" />
          <button
            type="button"
            onClick={knockDoor}
            aria-label={member ? "Tocar la puerta y volver al club" : "Tocar la puerta para entrar"}
            className="absolute inset-y-[6%] left-1/2 w-[30%] -translate-x-1/2 cursor-pointer transition-[background] duration-500 hover:bg-[radial-gradient(ellipse_at_50%_45%,rgb(232_178_92/.14),transparent_62%)] focus-visible:outline-2 focus-visible:outline-tungsten-400 max-[759px]:w-[56%]"
          />
          <div className="pointer-events-none absolute bottom-[clamp(24px,5vw,56px)] left-[clamp(20px,4vw,56px)] max-w-[22ch]">
            <Lines lines={["Quedan sillas", "libres esta noche"]} className="text-[clamp(44px,5.6vw,88px)]" />
            <p className="mt-4 mb-1 font-pix text-[15px] tracking-[.1em] text-tungsten-400" data-reveal="up" style={delay(0.3)} role="status">
              {knocked ? "Alguien viene a abrir." : "Toca la puerta."}
            </p>
            <a
              href="#adentro"
              onClick={() => window.dispatchEvent(new Event("noir:pass"))}
              className="pointer-events-auto text-[15px] text-paper-dim underline underline-offset-4 hover:text-paper"
              data-reveal="up"
              style={delay(0.4)}
            >
              Tengo contraseña
            </a>
          </div>
        </div>
      </section>

      <LandingFooter member={member} onEnter={enter} />

      <LoginDoor open={door} onClose={() => setDoor(false)} onEnter={walkIn} />
      {shutter}
    </div>
  );
}

/** Example blind clock on the tournament poster. */
function TourneyClock() {
  const [secs, setSecs] = useState(252);
  useEffect(() => {
    const id = window.setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 300)), 1000);
    return () => window.clearInterval(id);
  }, []);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <div className="mb-5 flex items-baseline gap-4 font-pix">
      <b className="text-[44px] tracking-[.04em] text-tungsten-400 tabular-nums">
        {mm}:{ss}
      </b>
      <span className="text-sm opacity-80">
        para el nivel 5
        <br />
        ciegas 75/150
      </span>
    </div>
  );
}
