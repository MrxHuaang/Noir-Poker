"use client";
// Client connection to the authoritative Go game server over WebSocket.
// Base URL from NEXT_PUBLIC_GAME_WS_URL (e.g. http://localhost:8080 in dev, the
// Render URL in prod). Receives public "state" (broadcast) + private "hole" (only
// ours); sends "start" / "action". The deck and opponents' holes never arrive.
// Reconnects with exponential backoff (mirrors cli/net.ts).
import { useCallback, useEffect, useRef, useState } from "react";

export type PublicSeat = {
  id: string;
  name: string;
  seed?: string; // avatar seed (client-provided at join)
  chips: number;
  bet: number;
  totalBet?: number; // committed across the whole hand
  status: string;
  hasCards: boolean;
};

export type GameWinner = { id: string; amount: number };

export type LastAction = {
  seatId: string;
  action: string;
  amount?: number;
  ts: number; // Unix ms
};

export type PublicState = {
  handNum: number;
  phase: string;
  board: string[];
  pot: number;
  toAct: string;
  deadline?: number; // Unix ms when ToAct's turn expires; absent/0 = no timer
  seats: PublicSeat[];
  winners?: GameWinner[];
  reveals?: Record<string, string[]>; // seatId -> 2 card ids, at showdown
  runs?: RunResult[]; // populated for run-it-N all-in outcomes (N > 1)
  sb?: number; // current small blind
  bb?: number; // current big blind
  startStack: number; // stack granted to new players (and the coin buy-in to escrow)
  currentBet?: number; // live betting round: bet to match
  minRaise?: number; // live betting round: minimum raise increment
  dealer?: string; // seat id holding the button this hand
  owner?: string; // uid with start/configure authority
  lastAction?: LastAction; // most recent successful action (for UI feedback)
  paused?: boolean; // true during a tournament break
  bustedOrder?: string[]; // seat IDs in bust-out order (tournament rankings)
  handCategories?: Record<string, number>; // seatId -> 0-8 at showdown
};

export type RunResult = {
  board: string[];
  pot: number;
  winners: GameWinner[];
};

export type ConnStatus = "connecting" | "reconnecting" | "connected" | "error";

// Static token or an async getter. The getter is re-invoked on every reconnect
// attempt so a session that outlives the Firebase ID token (1 h) does not get
// stuck in a 401 retry loop with the stale token baked into the URL.
export type TokenSource = string | (() => Promise<string | null>);

export type GameSocket = {
  connected: boolean;
  status: ConnStatus;
  error: string | null;
  state: PublicState | null;
  hole: string[] | null;
  start: () => void;
  action: (action: string, amount?: number) => void;
  config: (sb: number, bb: number, stack: number, runItN?: number, blindLevelSecs?: number) => void;
  pause: () => void;
  resume: () => void;
};

export function useGameSocket(
  room: string | null,
  id: string,
  name = "",
  token?: TokenSource,
  spectator = false,
  seed = "",
): GameSocket {
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<PublicState | null>(null);
  const [hole, setHole] = useState<string[] | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_GAME_WS_URL;
    if (!room || !id || !base) {
      if (!base) setError("Falta NEXT_PUBLIC_GAME_WS_URL");
      return;
    }
    setError(null);

    const wsBase = base.replace(/^http/, "ws").replace(/\/$/, "");

    let attempt = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let dead = false;

    const scheduleRetry = () => {
      if (dead) return;
      const delay = Math.min(1000 * 2 ** attempt, 10_000);
      attempt++;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(connect, delay);
    };

    const connect = async () => {
      if (dead) return;
      setStatus(attempt === 0 ? "connecting" : "reconnecting");

      // Resolve the auth token per attempt (fresh token on reconnect).
      let tok: string | undefined;
      try {
        tok = typeof token === "function" ? (await token()) ?? undefined : token;
      } catch {
        tok = undefined;
      }
      if (dead) return;

      const nameQ = name ? `&name=${encodeURIComponent(name)}` : "";
      const seedQ = seed ? `&seed=${encodeURIComponent(seed)}` : "";
      const tokenQ = tok ? `&token=${encodeURIComponent(tok)}` : "";
      const spectatorQ = spectator ? "&spectator=1" : "";
      const url = `${wsBase}/ws?room=${encodeURIComponent(room)}&id=${encodeURIComponent(id)}${nameQ}${seedQ}${tokenQ}${spectatorQ}`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        // Bad URL scheme or similar — schedule retry without crashing.
        scheduleRetry();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setStatus("connected");
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!dead) {
          setStatus("reconnecting");
          scheduleRetry();
        }
      };

      ws.onerror = () => {
        setError("Error de conexión al servidor de juego");
        setStatus("error");
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; payload?: unknown };
          if (msg.type === "state") {
            setState(msg.payload as PublicState);
          } else if (msg.type === "hole") {
            setHole((msg.payload as { cards: string[] }).cards);
          }
        } catch {
          /* ignore malformed frame */
        }
      };
    };

    void connect();

    return () => {
      dead = true;
      if (timeoutId) clearTimeout(timeoutId);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [room, id, name, token, spectator, seed]);

  const send = useCallback((type: string, payload?: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload !== undefined ? { type, payload } : { type }));
  }, []);

  const start = useCallback(() => send("start"), [send]);
  const action = useCallback(
    (a: string, amount = 0) => send("action", { action: a, amount }),
    [send],
  );
  const config = useCallback(
    (sb: number, bb: number, stack: number, runItN?: number, blindLevelSecs?: number) =>
      send("config", {
        sb, bb, stack,
        ...(runItN !== undefined ? { runItN } : {}),
        ...(blindLevelSecs !== undefined ? { blindLevelSecs } : {}),
      }),
    [send],
  );
  const pause = useCallback(() => send("pause"), [send]);
  const resume = useCallback(() => send("resume"), [send]);

  return { connected: status === "connected", status, error, state, hole, start, action, config, pause, resume };
}
