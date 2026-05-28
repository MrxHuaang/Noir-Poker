"use client";
import { useEffect } from "react";
import { heartbeat, markOffline } from "@/lib/presence";

const INTERVAL_MS = 30_000;

export function usePresence(code: string | null, uid: string | null): void {
  useEffect(() => {
    if (!code || !uid) return;
    heartbeat(code, uid).catch(() => {});
    const t = setInterval(() => heartbeat(code, uid).catch(() => {}), INTERVAL_MS);
    return () => {
      clearInterval(t);
      markOffline(code, uid).catch(() => {});
    };
  }, [code, uid]);
}
