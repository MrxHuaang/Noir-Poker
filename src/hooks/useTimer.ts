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

export function useTurnTimer(
  deadline: number | null,
  timeBank: number,
  onExpire: () => void,
): { remaining: number; bankRemaining: number; inBank: boolean } {
  const remaining = useCountdown(deadline);
  const calledRef = useRef(false);

  useEffect(() => {
    calledRef.current = false;
  }, [deadline]);

  useEffect(() => {
    if (deadline !== null && remaining === 0 && !calledRef.current) {
      calledRef.current = true;
      onExpire();
    }
  }, [remaining, deadline, onExpire]);

  const baseDone = deadline !== null && remaining === 0;
  const bankRemaining = baseDone ? timeBank : timeBank;
  const inBank = baseDone && timeBank > 0;

  return { remaining, bankRemaining, inBank };
}
