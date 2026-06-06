"use client";
import { useEffect, useState } from "react";
import { subscribeReactions, type Reaction } from "@/lib/reactions";

export function useReactions(code: string | null): Reaction[] {
  const [list, setList] = useState<Reaction[]>([]);
  useEffect(() => {
    if (!code) return;
    return subscribeReactions(code, setList);
  }, [code]);

  // Sweep expired entries every second
  useEffect(() => {
    const t = setInterval(() => {
      setList((prev) => {
        const now = Date.now();
        const next = prev.filter((r) => now - r.ts < 4000);
        return next.length === prev.length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return code ? list : [];
}
