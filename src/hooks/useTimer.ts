"use client";
import { useEffect, useRef, useState } from "react";

export function useCountdown(deadline: number | null): number {
  const [remaining, setRemaining] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (deadline === null) return;
    const target = deadline;

    function tick() {
      const r = Math.max(0, target - Date.now());
      setRemaining(r);
      if (r > 0) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [deadline]);

  return deadline === null ? 0 : remaining;
}
