// Player stats from authoritative hand records. Pure: the server turns the
// deltas into Firestore increments on playerStats/{uid}.
import type { OnlineHandDoc, PlayerStatsDoc } from "./protocol";

export type StatDelta = Omit<PlayerStatsDoc, "updatedAt" | "biggestPot">;

export function statDeltas(rec: OnlineHandDoc): Record<string, StatDelta> {
  const out: Record<string, StatDelta> = {};
  const vpip = new Set(rec.vpip ?? []);
  const pfr = new Set(rec.pfr ?? []);
  const flop = new Set(rec.sawFlop ?? []);
  // A showdown is two or more hands turned face up when the pot was settled.
  const shown = Object.keys(rec.reveals ?? {});
  const atShowdown = new Set(shown.length >= 2 ? shown : []);
  const won = new Map<string, number>();
  for (const w of rec.winners ?? []) won.set(w.id, (won.get(w.id) ?? 0) + w.amount);
  for (const id of rec.dealtIds ?? []) {
    const amount = won.get(id) ?? 0;
    out[id] = {
      hands: 1,
      vpip: vpip.has(id) ? 1 : 0,
      pfr: pfr.has(id) ? 1 : 0,
      sawFlop: flop.has(id) ? 1 : 0,
      showdowns: atShowdown.has(id) ? 1 : 0,
      showdownsWon: atShowdown.has(id) && amount > 0 ? 1 : 0,
      potsWon: amount > 0 ? 1 : 0,
      chipsWon: amount,
    };
  }
  return out;
}

export type StatsView = {
  hands: number;
  vpip: number; // % of hands
  pfr: number;
  sawFlop: number;
  wtsd: number; // went to showdown, % of hands that saw the flop
  wsd: number; // won at showdown, % of showdowns
  potsWon: number;
  biggestPot: number;
};

/** How the player plays, in the club's words, once there are enough hands. */
export function styleOf(v: StatsView): string | null {
  if (v.hands < 30) return null;
  const loose = v.vpip >= 30;
  const aggressive = v.vpip > 0 && v.pfr / v.vpip >= 0.5;
  if (!loose && aggressive) return "Juega pocas y las juega fuerte";
  if (!loose) return "Juega pocas y espera";
  if (aggressive) return "Entra a muchas y empuja";
  return "Entra a muchas y paga para ver";
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export function statsView(d: Partial<PlayerStatsDoc> | null | undefined): StatsView {
  const n = (v: unknown) => Math.max(0, Math.floor(Number(v ?? 0)) || 0);
  const hands = n(d?.hands);
  const flop = n(d?.sawFlop);
  const sd = n(d?.showdowns);
  return {
    hands,
    vpip: pct(n(d?.vpip), hands),
    pfr: pct(n(d?.pfr), hands),
    sawFlop: pct(flop, hands),
    wtsd: pct(sd, flop),
    wsd: pct(n(d?.showdownsWon), sd),
    potsWon: n(d?.potsWon),
    biggestPot: n(d?.biggestPot),
  };
}
