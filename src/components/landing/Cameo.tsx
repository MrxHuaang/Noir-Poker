"use client";
import { useSyncExternalStore } from "react";
import type { CastId } from "@/lib/noirCast";
import { sceneUrl } from "@/lib/noirCast";

// Regulars only show from 820px up (max-[820px]:hidden). Below that the
// iframe is not mounted at all: a display:none iframe still boots a full
// three.js scene (browsers load hidden iframes eagerly).
const WIDE = "(min-width: 820px)";
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
function useWide() {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
}

/**
 * A regular stepping into the gap between two sections: one animated
 * character from the 3D scene, cut out on a transparent canvas. Zero height
 * so it never pushes the layout, and painted BEHIND the sections (z-[1]; the
 * sections sit at z-[2]) so it can never cover text. Hidden on narrow
 * screens. Steps in with the CSS entrance system (data-group).
 *
 * `act`: "fall" trips over nothing now and then (a wider frame, to land in).
 */
export function Cameo({
  id,
  turn,
  side,
  y,
  title,
  act,
}: {
  id: CastId;
  turn: number;
  side: "l" | "r";
  y: number;
  title: string;
  act?: "fall";
}) {
  const wide = act === "fall";
  const shown = useWide();
  return (
    <div className={`cameo cameo-${side} pointer-events-none relative z-[1] h-0 max-[820px]:hidden`} data-group>
      <figure
        className={`cameo-fig absolute m-0 ${wide ? "aspect-[2/1] w-[clamp(300px,28vw,440px)]" : "aspect-[3/4] w-[clamp(200px,20vw,300px)]"} ${
          side === "r" ? "right-[clamp(0px,3vw,64px)]" : "left-[clamp(0px,3vw,64px)]"
        }`}
        style={{ top: y }}
      >
        <div className="h-full w-full" data-reveal={side === "r" ? "slide-r" : "slide-l"}>
          {shown && (
            <iframe
              src={sceneUrl("cameo", { id, turn, ...(act ? { act } : {}) })}
              title={title}
              loading="lazy"
              tabIndex={-1}
              className="block h-full w-full border-0 bg-transparent"
            />
          )}
        </div>
      </figure>
    </div>
  );
}

/**
 * A regular crossing the page along a strip at the foot of a section: walks
 * from one side to the other, turns at the edge, now and then stops to tip
 * the hat. Behind the content like the cameos.
 */
export function Walker({ id, title, className = "" }: { id: CastId; title: string; className?: string }) {
  const shown = useWide();
  return (
    <div className={`pointer-events-none absolute inset-x-0 z-[1] h-[clamp(150px,15vw,210px)] max-[820px]:hidden ${className}`} aria-hidden data-group>
      <div className="h-full w-full" data-reveal="up">
        {shown && <iframe src={sceneUrl("cameo", { id, act: "walk" })} title={title} loading="lazy" tabIndex={-1} className="block h-full w-full border-0 bg-transparent" />}
      </div>
    </div>
  );
}
