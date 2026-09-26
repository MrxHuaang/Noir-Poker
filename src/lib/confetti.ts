import { ACCENT } from "./brand";
import confetti from "canvas-confetti";

// Celebratory burst fired at showdown when a winner is decided. Shared by the
// presencial table (PokerTable) and the betting table (RoundPokerTable).
export function fireConfetti(): void {
  const opts = {
    spread: 70,
    ticks: 120,
    gravity: 1,
    decay: 0.92,
    colors: [ACCENT[400], ACCENT[200], "#efebe1", ACCENT[800]],
    disableForReducedMotion: true,
  };
  confetti({ ...opts, particleCount: 80, origin: { x: 0.2, y: 0.4 } });
  confetti({ ...opts, particleCount: 80, origin: { x: 0.8, y: 0.4 } });
  confetti({
    ...opts,
    particleCount: 120,
    origin: { x: 0.5, y: 0.3 },
    startVelocity: 55,
  });
}
