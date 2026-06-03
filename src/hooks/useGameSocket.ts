"use client";
// Client connection to the authoritative Go game server over WebSocket.
// Base URL from NEXT_PUBLIC_GAME_WS_URL (e.g. http://localhost:8080 in dev, the
// Fly URL in prod). Receives public "state" (broadcast) + private "hole" (only
// ours); sends "start" / "action". The deck and opponents' holes never arrive.
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
  seats: PublicSeat[];
  winners?: GameWinner[];
  reveals?: Record<string, string[]>; // seatId -> 2 card ids, at showdown
};

export type GameSocket = {
  connected: boolean;
  error: string | null;
  state: PublicState | null;
  hole: string[] | null;
  start: () => void;
  action: (action: string, amount?: number) => void;
};

export function useGameSocket(room: string | null, id: string, name = ""): GameSocket {
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
    const url = `${wsBase}/ws?room=${encodeURIComponent(room)}&id=${encodeURIComponent(id)}${nameQ}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
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
    return () => {
      ws.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [room, id, name]);

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

  return { connected, error, state, hole, start, action };
}
