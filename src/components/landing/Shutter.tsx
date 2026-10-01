"use client";
// Peephole shutter: two black panels close over the page with a pair of
// amber eyes in the slit, then the route changes. Used when leaving the
// landing for the club, so walking in feels like being let through a door.
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "open" | "slit" | "shut";

export function useShutter() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("open");
  const busy = useRef(false);

  const go = useCallback(
    (href: string) => {
      if (busy.current) return;
      busy.current = true;
      router.prefetch(href);
      setPhase("slit");
      window.setTimeout(() => setPhase("shut"), 520);
      window.setTimeout(() => router.push(href), 900);
    },
    [router],
  );

  const node = <ShutterPanels phase={phase} />;
  return { go, node };
}

function ShutterPanels({ phase }: { phase: Phase }) {
  const closed = phase !== "open";
  const panel = "absolute inset-x-0 h-1/2 bg-soot-950 transition-transform duration-[420ms] ease-[cubic-bezier(.2,.8,.2,1)]";
  const top = phase === "open" ? "-translate-y-[101%]" : phase === "slit" ? "-translate-y-[26px]" : "translate-y-0";
  const bottom = phase === "open" ? "translate-y-[101%]" : phase === "slit" ? "translate-y-[26px]" : "translate-y-0";
  return (
    <div className={`fixed inset-0 z-[200] ${closed ? "pointer-events-auto" : "pointer-events-none"}`} aria-hidden>
      <i className={`${panel} top-0 shadow-[inset_0_-2px_0_var(--color-brass-700)] ${top}`} />
      <i className={`${panel} bottom-0 shadow-[inset_0_2px_0_var(--color-brass-700)] ${bottom}`} />
      <span
        className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-[30px] transition-opacity duration-150 ${
          phase === "slit" ? "opacity-100" : "opacity-0"
        }`}
      >
        <b className="h-[7px] w-[14px] rounded-full bg-tungsten-400 shadow-[0_0_12px_rgb(232_178_92/.6)]" />
        <b className="h-[7px] w-[14px] rounded-full bg-tungsten-400 shadow-[0_0_12px_rgb(232_178_92/.6)]" />
      </span>
    </div>
  );
}
