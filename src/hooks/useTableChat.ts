"use client";
// Canned-phrase chat for the online table.
// Uses Supabase Realtime Broadcast on channel `table:{code}`.
// No Supabase tables — pure ephemeral broadcast, same pattern as voice presence.
import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabaseClient";

const BUBBLE_TTL_MS = 4000;

export const CANNED_PHRASES = [
  "Buena mano",
  "Vamos!",
  "Me la juego",
  "Suerte",
  "No me hagas eso",
  "Igual te gano",
  "Bien jugado",
  "Uf...",
] as const;

export type CannedPhrase = (typeof CANNED_PHRASES)[number];

export interface TableChatHook {
  /** Send a phrase as the current user. Echoed locally immediately. */
  send: (phrase: string) => void;
  /** uid → currently active phrase (expires after BUBBLE_TTL_MS). */
  activePhrases: Record<string, string>;
}

export function useTableChat(
  code: string | null,
  uid: string | null,
): TableChatHook {
  const [activePhrases, setActivePhrases] = useState<Record<string, string>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Stable helper: show phrase for a uid (works for both incoming and local echo).
  const showBubble = useCallback((senderUid: string, phrase: string) => {
    clearTimeout(timersRef.current[senderUid]);
    setActivePhrases((prev) => ({ ...prev, [senderUid]: phrase }));
    timersRef.current[senderUid] = setTimeout(() => {
      setActivePhrases((prev) => {
        const next = { ...prev };
        delete next[senderUid];
        return next;
      });
    }, BUBBLE_TTL_MS);
  }, []);

  useEffect(() => {
    if (!code) return;
    let supabase: ReturnType<typeof getSupabase>;
    try {
      supabase = getSupabase();
    } catch {
      return; // env vars not set — skip silently
    }

    const ch = supabase.channel(`table:${code}`);
    channelRef.current = ch;

    ch.on(
      "broadcast",
      { event: "phrase" },
      ({ payload }: { payload: { uid?: string; phrase?: string } }) => {
        const { uid: senderUid, phrase } = payload;
        if (!senderUid || !phrase) return;
        showBubble(senderUid, phrase);
      },
    ).subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        // ignore cleanup errors
      }
      channelRef.current = null;
      const timers = timersRef.current;
      Object.values(timers).forEach(clearTimeout);
    };
  }, [code, showBubble]);

  const send = useCallback(
    (phrase: string) => {
      if (!uid) return;
      // Echo locally immediately (Supabase broadcast does not echo to sender).
      showBubble(uid, phrase);
      if (!channelRef.current) return;
      channelRef.current
        .send({ type: "broadcast", event: "phrase", payload: { uid, phrase } })
        .catch(() => {});
    },
    [uid, showBubble],
  );

  return { send, activePhrases };
}
