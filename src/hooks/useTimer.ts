"use client";
import { useEffect, useRef, useState } from "react";

export function useCountdown(deadline: number | null): number {
  const [remaining, setRemaining] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (deadline === null) {
      setRemaining(0);
      return;
    }
    function tick() {
      const r = Math.max(0, deadline! - Date.now());
      setRemaining(r);
      if (r > 0) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [deadline]);

  return remaining;
}
