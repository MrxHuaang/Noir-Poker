"use client";
// Server-backed online game: wraps useGameSocket with the signed-in identity
// and a fresh Firebase ID token. The token is sent as ?token= in the WS
// handshake so the Go server can verify the uid (auth mode). Also exposed so
// the page can use it for /api/economy calls (buy-in / cash-out).
import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { useGameSocket, type GameSocket } from "./useGameSocket";

export type ServerGame = GameSocket & {
  uid: string | null;
  name: string;
  seed: string;
  ready: boolean;
  token: string | null;
};

export function useServerGame(code: string | null, spectator = false): ServerGame {
  const { uid, profile, user } = useAuth();
  const [token, setToken] = useState<string | null>(null);

  // Refresh the ID token whenever the Firebase user changes. getIdToken()
  // returns the cached token (valid for 1 h) without a network round-trip.
  useEffect(() => {
    if (!user) {
      setToken(null);
      return;
    }
    user.getIdToken().then(setToken).catch(() => setToken(null));
  }, [user]);

  const name = profile?.nickname || profile?.displayName || "Jugador";
  const seed = profile?.avatarSeed || uid || "seed";

  // Only open the WS when both uid AND token are ready (auth mode requires
  // the token at handshake time; without it the Go server rejects the connection).
  const sock = useGameSocket(
    uid && token ? code : null,
    uid ?? "",
    name,
    token ?? undefined,
    spectator,
  );

  return { ...sock, uid, name, seed, ready: !!uid && !!token, token };
}
