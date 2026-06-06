// HUD aggregation over stored hands (normalRooms/{code}/hands). Pure function;
// the UI resolves player names by id. Stats derivable from what HandRecord stores
// (dealt / showdown / winners) — NOT VPIP/PFR, which need preflop action data the
// records don't carry.
import type { HandRecord } from "./handHistory";

export type HudRow = {
  id: string;
  handsPlayed: number;
  handsWon: number;
  wentToShowdown: number;
  wonAtShowdown: number;
  winPct: number; // hands won / played, 0..100
  wtsdPct: number; // went to showdown / played, 0..100
  wsdPct: number; // won at showdown / went to showdown, 0..100
};

const pct = (n: number, d: number): number =>
  d > 0 ? Math.round((n / d) * 1000) / 10 : 0;

export function aggregateHud(hands: HandRecord[]): HudRow[] {
  const acc = new Map<string, { p: number; w: number; sd: number; sdw: number }>();
  const bump = (id: string) => {
    let r = acc.get(id);
    if (!r) {
      r = { p: 0, w: 0, sd: 0, sdw: 0 };
      acc.set(id, r);
    }
    return r;
  };

  for (const h of hands) {
    const dealt = h.dealtIds ?? [];
    const showdown = new Set(h.showdownIds ?? []);
    const won = new Set((h.winners ?? []).map((w) => w.id));
    for (const id of dealt) {
      const r = bump(id);
      r.p++;
      if (won.has(id)) r.w++;
      if (showdown.has(id)) {
        r.sd++;
        if (won.has(id)) r.sdw++;
      }
    }
  }

  return [...acc.entries()]
    .map(([id, r]) => ({
      id,
      handsPlayed: r.p,
      handsWon: r.w,
      wentToShowdown: r.sd,
      wonAtShowdown: r.sdw,
      winPct: pct(r.w, r.p),
      wtsdPct: pct(r.sd, r.p),
      wsdPct: pct(r.sdw, r.sd),
    }))
    .sort((a, b) => b.handsPlayed - a.handsPlayed);
}
