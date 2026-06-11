"use client";
// Server-backed online game: wraps useGameSocket with the signed-in identity
// and a Firebase ID token getter. The token rides the WS handshake (?token=)
// so the Go server can verify the uid; the getter is re-invoked on reconnects
// so sessions longer than the token TTL (1 h) keep reconnecting cleanly.
import { useCallback } from "react";
import { useAuth } from "./useAuth";
import { useGameSocket, type GameSocket } from "./useGameSocket";

export type ServerGame = GameSocket & {
  uid: string | null;
  name: string;
  seed: string;
  isGuest: boolean;
  ready: boolean;
  getToken: () => Promise<string | null>;
};

export function useServerGame(code: string | null, spectator = false): ServerGame {
  const { uid, profile, user, isGuest } = useAuth();

  // getIdToken() returns the cached token when still valid and refreshes it
  // otherwise — exactly what each (re)connect attempt needs.
  const getToken = useCallback(async () => {
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }, [user]);

  const name = profile?.nickname || profile?.displayName || "Jugador";
  const seed = profile?.avatarSeed || uid || "seed";

  // Only open the WS once authenticated (auth mode requires a token at
  // handshake time; without it the Go server rejects the connection).
  const sock = useGameSocket(
    uid && user ? code : null,
    uid ?? "",
    name,
    getToken,
    spectator,
    seed,
  );

  return { ...sock, uid, name, seed, isGuest, ready: !!uid && !!user, getToken };
}
