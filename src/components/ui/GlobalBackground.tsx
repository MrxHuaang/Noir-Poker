"use client";
// Static backdrop for the app shell pages: a warm lamp over a dark card room
// and the rail of a table drawn as two hairline ellipses at the bottom of the
// viewport. No shader, no animation: cheap on phones and quiet behind content.
// Game tables render their own felt, so they get nothing here.
import { usePathname } from "next/navigation";

const GAME_PREFIXES = ["/host", "/admin"];
// Pages under /play that are NOT game tables (they keep the backdrop).
const PLAY_LOBBY_PAGES = ["/play/online"];

export function GlobalBackground() {
  const pathname = usePathname();
  const isPlayLobby = PLAY_LOBBY_PAGES.some((p) => pathname === p);
  const isGamePage =
    !isPlayLobby &&
    (GAME_PREFIXES.some((p) => pathname.startsWith(p)) || pathname.startsWith("/play"));
  // The landing paints its own room (Atmosphere).
  if (isGamePage || ["/", "/jugar", "/login", "/join", "/perfil"].includes(pathname)) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" aria-hidden>
      {/* Lamp: a single warm pool of light from above. */}
      <div
        className="absolute inset-x-0 -top-[20vh] h-[80vh]"
        style={{
          background:
            "radial-gradient(ellipse 50% 60% at 50% 30%, oklch(0.93 0.035 85 / 0.07) 0%, oklch(0.93 0.035 85 / 0.025) 45%, transparent 75%)",
        }}
      />
      {/* Table rail, seen from a chair. */}
      <svg
        className="absolute left-1/2 -translate-x-1/2 bottom-[-58vh] w-[180vw] max-w-[2600px] h-[100vh]"
        viewBox="0 0 1000 560"
        preserveAspectRatio="none"
      >
        <ellipse cx="500" cy="280" rx="490" ry="270" fill="none" stroke="oklch(0.93 0.012 85 / 0.07)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <ellipse cx="500" cy="280" rx="440" ry="232" fill="oklch(0.2 0.02 160 / 0.10)" stroke="oklch(0.93 0.012 85 / 0.045)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Vignette keeps the edges dark so content stays the brightest thing. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 110% 85% at 50% 35%, transparent 50%, oklch(0.1 0.005 60 / 0.7) 100%)",
        }}
      />
    </div>
  );
}
