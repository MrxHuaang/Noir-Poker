"use client";
import { useEffect, useState } from "react";

export type OnlineRoom = { code: string; players: number };

// Polls GET /rooms on the Go server every 5 s. Returns [] when the server URL
// is not configured or the request fails.
export function useOnlineRooms(): OnlineRoom[] {
  const [rooms, setRooms] = useState<OnlineRoom[]>([]);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_GAME_WS_URL;
    if (!base) return;
    const url = `${base.replace(/\/$/, "")}/rooms`;

    const poll = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) setRooms(await res.json() as OnlineRoom[]);
      } catch {
        /* server unreachable — keep last known list */
      }
    };

    poll();
    const id = setInterval(poll, 5_000);
    return () => clearInterval(id);
  }, []);

  return rooms;
}
