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
  PRESENCE_STALE_MS,
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
  /** Signed-in people watching without a seat (fresh heartbeat). */
  watchers: number;
  /** False while the connection to the room is down (cached state only). */
  online: boolean;
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
  vote: (n: number) => Promise<string | null>;
  away: (on: boolean) => Promise<string | null>;
  approve: (target: string) => Promise<string | null>;
  deny: (target: string) => Promise<string | null>;
  kick: (target: string) => Promise<string | null>;
  show: () => Promise<string | null>;
  react: (kind: string) => Promise<string | null>;
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
  const [watchSet, setWatchSet] = useState<Set<string>>(() => new Set());
  const [live, setLive] = useState(true);
  const [netUp, setNetUp] = useState(true);
  const [busy, setBusy] = useState<OnlineAction | null>(null);

  // Public state. Waits for auth: the rules require a signed-in reader.
  useEffect(() => {
    if (!code || !user) return;
    setStatus("loading");
    return subscribeOnlineRoom(
      code,
      (doc, fresh) => {
        setLive(fresh);
        // A cache-only miss right after a drop is not "the room is gone".
        if (!doc && !fresh) return;
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
    return subscribeOnlinePresence(code, (at, w) => {
      setPresence(at);
      setWatchSet(w);
    });
  }, [code, user]);

  // The browser's own idea of the network, for an instant "reconnecting".
  useEffect(() => {
    const up = () => setNetUp(true);
    const down = () => setNetUp(false);
    setNetUp(typeof navigator === "undefined" ? true : navigator.onLine);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

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
      state.joining?.includes(uid) ||
      state.requests?.some((r) => r.id === uid))
  );
  const presentRef = useRef(present);
  useEffect(() => {
    presentRef.current = present;
  }, [present]);

  // Heartbeat while we hold a seat (or a place in the queue); observers beat
  // too, marked as watchers, so the table knows who is looking on. A beat
  // also goes out the moment the tab comes back or the network returns.
  useEffect(() => {
    if (!code || !uid || !user) return;
    const beat = () => {
      writeOnlinePresence(code, uid, !present).catch(() => {});
    };
    beat();
    const id = setInterval(beat, PRESENCE_HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", beat);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", beat);
    };
  }, [code, uid, user, present]);

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

  // Back from a dropped connection: the server kept the seat but skips us
  // until we say we are here again.
  const gone = !!(uid && state?.seats.some((s) => s.id === uid && s.gone));
  const connected = live && netUp;
  useEffect(() => {
    if (!gone || !connected || !code || !uid) return;
    let cancelled = false;
    (async () => {
      await writeOnlinePresence(code, uid).catch(() => {});
      const token = await getToken();
      if (token && !cancelled) callOnline(token, "back", { code }).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [gone, connected, code, uid, getToken]);

  // Onlookers with a fresh heartbeat (re-counted when presence changes).
  const watchers = useMemo(() => {
    const seated = new Set(state?.seats.map((s) => s.id) ?? []);
    const now = Date.now();
    let n = 0;
    for (const id of watchSet) if (!seated.has(id) && now - (presence[id] ?? 0) < PRESENCE_STALE_MS) n++;
    return n;
  }, [watchSet, presence, state?.seats]);

  // Turn timer: once the deadline passes, ask the server to apply the
  // auto-action. The player on the clock fires first; everyone else backs off
  // with jitter so only one request usually lands (the server is idempotent).
  const deadline = state?.deadline ?? 0;
  const toAct = state?.toAct ?? "";
  const paused = !!state?.paused;
  // At showdown the deadline is the pause before the automatic next deal.
  const nextDeal = state?.phase === "showdown";
  const voting = !!state?.runVote;
  useEffect(() => {
    if (!code || !uid || !deadline || (!toAct && !nextDeal && !voting) || paused) return;
    const mine = toAct === uid || ((nextDeal || voting) && state?.owner === uid);
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
  }, [code, uid, deadline, toAct, nextDeal, voting, paused, getToken]);

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
      vote: (n: number) => call("vote", { n }),
      away: (on: boolean) => call("away", { away: on }),
      approve: (target: string) => call("approve", { target }),
      deny: (target: string) => call("deny", { target }),
      kick: (target: string) => call("kick", { target }),
      show: () => call("show"),
      react: (kind: string) => call("react", { kind }),
    }),
    [call],
  );

  return { status, error, state, hole, presence, watchers, online: connected, busy, ...actions };
}
