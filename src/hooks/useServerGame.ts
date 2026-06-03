"use client";
// Server-backed online game: wraps useGameSocket with the signed-in identity.
// The WS id is the Firebase uid (unique); the display name comes from the
// profile and is shown on seats. Game state + actions come from the Go server.
import { useAuth } from "./useAuth";
import { useGameSocket, type GameSocket } from "./useGameSocket";

export type ServerGame = GameSocket & {
  uid: string | null;
  name: string;
  seed: string;
  ready: boolean;
};

export function useServerGame(code: string | null): ServerGame {
  const { uid, profile } = useAuth();
  const name = profile?.nickname || profile?.displayName || "Jugador";
  const seed = profile?.avatarSeed || uid || "seed";
  const sock = useGameSocket(uid ? code : null, uid ?? "", name);
  return { ...sock, uid, name, seed, ready: !!uid };
}
