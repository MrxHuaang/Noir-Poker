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
  chips: number;
  bet: number;
  status: string;
  hasCards: boolean;
};

export type GameWinner = { id: string; amount: number };

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
};

export type RunResult = {
  board: string[];
  pot: number;
  winners: GameWinner[];
};

export type GameSocket = {
  connected: boolean;
  error: string | null;
  state: PublicState | null;
  hole: string[] | null;
  start: () => void;
  action: (action: string, amount?: number) => void;
  config: (sb: number, bb: number, stack: number, runItN?: number, blindLevelSecs?: number) => void;
};

export function useGameSocket(room: string | null, id: string, name = "", token?: string, spectator = false): GameSocket {
  const [connected, setConnected] = useState(false);
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
    const nameQ = name ? `&name=${encodeURIComponent(name)}` : "";
    const tokenQ = token ? `&token=${encodeURIComponent(token)}` : "";
    const spectatorQ = spectator ? "&spectator=1" : "";
    const url = `${wsBase}/ws?room=${encodeURIComponent(room)}&id=${encodeURIComponent(id)}${nameQ}${tokenQ}${spectatorQ}`;

    let attempt = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let dead = false; // set on cleanup to stop reconnect loop

    const connect = () => {
      if (dead) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
      };

      ws.onclose = () => {
        setConnected(false);
        if (!dead) {
          const delay = Math.min(1000 * 2 ** attempt, 10_000);
          attempt++;
          timeoutId = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => setError("Error de conexión al servidor de juego");

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

    connect();

    return () => {
      dead = true;
      if (timeoutId) clearTimeout(timeoutId);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [room, id, name, token, spectator]);

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

  return { connected, error, state, hole, start, action, config };
}
