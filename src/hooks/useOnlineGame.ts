"use client";
// Client of the serverless online mode. State arrives through Firestore
// (onlineRooms/{code} public doc + our own holes/{uid} doc); moves go out as
// POST /api/online, where one transaction validates and applies them. This
// hook also keeps our presence heartbeat alive while we hold a seat and fires
// the turn timer (`tick`) once the public deadline passes: there is no
// background server, so the clients drive the clock and the server checks it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  callOnline,
  subscribeOnlineHole,
  subscribeOnlinePresence,
  subscribeOnlineRoom,
  writeOnlinePresence,
} from "@/lib/online/client";
import {
  PRESENCE_HEARTBEAT_MS,
  type OnlineAction,
  type OnlineConfigInput,
  type OnlineHoleDoc,
  type PublicState,
} from "@/lib/online/protocol";

export type OnlineStatus = "loading" | "ready" | "missing" | "error";

export type OnlineGame = {
  status: OnlineStatus;
  error: string | null;
  state: PublicState | null;
  hole: string[] | null;
  presence: Record<string, number>;
  busy: OnlineAction | null;
  // Every action resolves to an error message (Spanish, from the server) or null.
  sit: () => Promise<string | null>;
  leave: () => Promise<string | null>;
  start: () => Promise<string | null>;
  act: (move: string, amount?: number) => Promise<string | null>;
  config: (cfg: OnlineConfigInput) => Promise<string | null>;
  pause: () => Promise<string | null>;
  resume: () => Promise<string | null>;
  rebuy: () => Promise<string | null>;
};

// Deferred stand-up on unmount, keyed by room. React Strict Mode unmounts and
// immediately remounts in development; the remount cancels the pending leave.
const pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>();

export function useOnlineGame(code: string | null): OnlineGame {
  const { uid, user, getToken } = useAuth();
  const [room, setRoom] = useState<{ state: PublicState } | null>(null);
  const [status, setStatus] = useState<OnlineStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [holeDoc, setHoleDoc] = useState<OnlineHoleDoc | null>(null);
  const [presence, setPresence] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<OnlineAction | null>(null);

  // Public state. Waits for auth: the rules require a signed-in reader.
  useEffect(() => {
    if (!code || !user) return;
    setStatus("loading");
    return subscribeOnlineRoom(
      code,
      (doc) => {
        setRoom(doc ? { state: doc.state } : null);
        setStatus(doc ? "ready" : "missing");
      },
      (err) => {
        setError(
          err.message.includes("permission")
            ? "Sin permiso para leer la sala (faltan las reglas de Firestore de onlineRooms)"
            : "No se pudo conectar con la sala",
        );
        setStatus("error");
      },
    );
  }, [code, user]);

  useEffect(() => {
    if (!code || !uid) return;
    return subscribeOnlineHole(code, uid, setHoleDoc);
  }, [code, uid]);

  useEffect(() => {
    if (!code || !user) return;
    return subscribeOnlinePresence(code, setPresence);
  }, [code, user]);

  const state = room?.state ?? null;
  const hole =
    state && holeDoc && holeDoc.handNum === state.handNum && state.phase !== "idle"
      ? holeDoc.cards
      : null;

  const present = !!(
    uid &&
    state &&
    (state.seats.some((s) => s.id === uid) ||
      state.waiting?.includes(uid) ||
      state.joining?.includes(uid))
  );
  const presentRef = useRef(present);
  useEffect(() => {
    presentRef.current = present;
  }, [present]);

  // Heartbeat while we hold a seat (or a place in the queue).
  useEffect(() => {
    if (!code || !uid || !present) return;
    const beat = () => {
      writeOnlinePresence(code, uid).catch(() => {});
    };
    beat();
    const id = setInterval(beat, PRESENCE_HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code, uid, present]);

  const call = useCallback(
    async (action: OnlineAction, params: Record<string, unknown> = {}) => {
      if (!code) return "Sala invalida";
      const token = await getToken();
      if (!token) return "No autenticado";
      setBusy(action);
      try {
        await callOnline(token, action, { code, ...params });
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "Error desconocido";
      } finally {
        setBusy((b) => (b === action ? null : b));
      }
    },
    [code, getToken],
  );

  // Turn timer: once the deadline passes, ask the server to apply the
  // auto-action. The player on the clock fires first; everyone else backs off
  // with jitter so only one request usually lands (the server is idempotent).
  const deadline = state?.deadline ?? 0;
  const toAct = state?.toAct ?? "";
  const paused = !!state?.paused;
  useEffect(() => {
    if (!code || !uid || !deadline || !toAct || paused) return;
    const mine = toAct === uid;
    const seated = !!state?.seats.some((s) => s.id === uid);
    const backoff = mine ? 400 : seated ? 1200 + Math.random() * 1800 : 5000 + Math.random() * 3000;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const fire = async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      try {
        const res = await callOnline<{ applied: boolean; retryInMs: number }>(token, "tick", { code });
        if (!cancelled && !res.applied && res.retryInMs > 0) {
          timer = setTimeout(fire, res.retryInMs + 300);
        }
      } catch {
        /* next state change reschedules */
      }
    };
    timer = setTimeout(fire, Math.max(0, deadline - Date.now()) + backoff);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // state?.seats intentionally omitted: only the clock inputs reschedule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, uid, deadline, toAct, paused, getToken]);

  // Stand up when leaving the page inside the app (back button, links). A
  // reload or closed tab keeps the seat: the heartbeat goes stale and the
  // server stands us up (cashing out) at the next deal or turn timeout.
  useEffect(() => {
    if (!code) return;
    const pending = pendingLeaves.get(code);
    if (pending) {
      clearTimeout(pending);
      pendingLeaves.delete(code);
    }
    return () => {
      if (!presentRef.current) return;
      const t = setTimeout(() => {
        pendingLeaves.delete(code);
        getToken().then((token) => {
          if (token) callOnline(token, "leave", { code }, { keepalive: true }).catch(() => {});
        });
      }, 1200);
      pendingLeaves.set(code, t);
    };
  }, [code, getToken]);

  const actions = useMemo(
    () => ({
      sit: () => call("sit"),
      leave: () => call("leave"),
      start: () => call("start"),
      act: (move: string, amount = 0) => call("act", { move, amount }),
      config: (cfg: OnlineConfigInput) => call("config", { config: cfg }),
      pause: () => call("pause"),
      resume: () => call("resume"),
      rebuy: () => call("rebuy"),
    }),
    [call],
  );

  return { status, error, state, hole, presence, busy, ...actions };
}
