// The club's regulars. Ids match the archetypes of the 3D scene
// (public/noir/scene.html, ARCH) and the names must match it. Keep ids stable:
// they are stored in player profiles.

export type CastId =
  | "bruma"
  | "ofelia"
  | "malaquias"
  | "iturbe"
  | "nicanor"
  | "kessler"
  | "lulu"
  | "arrieta"
  | "enzo"
  | "gaetano"
  | "rosalba"
  | "anselmo";

export type CastMember = { name: string; alias: string; tag: string };

export const CAST: Record<CastId, CastMember> = {
  bruma: { name: "Vito Scaletti", alias: "Capo de la calle Mulberry", tag: "Vito" },
  ofelia: { name: "Eliza Comstock", alias: "Viuda de luto riguroso", tag: "Eliza" },
  malaquias: { name: "Revólver Ocampo", alias: "Pistolero de Sonora", tag: "Ocampo" },
  iturbe: { name: "Jimbo Balatri", alias: "Arlequín de feria", tag: "Jimbo" },
  nicanor: { name: "Nikola Voltz", alias: "Electricista de la trastienda", tag: "Nikola" },
  kessler: { name: "Gustav Zeitmann", alias: "Relojero de Zúrich", tag: "Gustav" },
  lulu: { name: "Tifa Lockwood", alias: "Pianista del bar", tag: "Tifa" },
  arrieta: { name: "Corvo Pestana", alias: "Médico de la peste", tag: "Corvo" },
  enzo: { name: "Enzo Auditore", alias: "Sastre de la calle Mott", tag: "Enzo" },
  gaetano: { name: "Tano Warisco", alias: "Dueño del puerto", tag: "Tano" },
  rosalba: { name: "Esmeralda Vance", alias: "Adivina de feria", tag: "Esmeralda" },
  anselmo: { name: "Cranky Colombo", alias: "Veterano del crack del 29", tag: "Cranky" },
};

/** Characters earned by rank; one of them is lent to everyone each week. */
export const LOCKED: CastId[] = ["iturbe", "kessler", "arrieta", "rosalba", "anselmo"];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Character of the week: rotates through the locked ones, Monday to Monday. */
export function featuredCast(now = Date.now()): CastId {
  // 1970-01-05 was a Monday: weeks start on Monday.
  const week = Math.floor((now - 4 * 24 * 60 * 60 * 1000) / WEEK_MS);
  return LOCKED[((week % LOCKED.length) + LOCKED.length) % LOCKED.length];
}

/** URL of the 3D scene in one of its stage modes. */
export function sceneUrl(mode: "door" | "embed" | "cameo" | "lineup" | "select" | "table", params: Record<string, string | number> = {}): string {
  const q = new URLSearchParams({ mode, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  return `/noir/scene.html?${q.toString()}`;
}

export const CAST_IDS = Object.keys(CAST) as CastId[];

const SEED_PREFIX = "cast:";

/** The chosen character is stored in the profile's avatarSeed as "cast:<id>". */
export function seedForCast(id: CastId): string {
  return `${SEED_PREFIX}${id}`;
}

export function isCastId(v: string): v is CastId {
  return (CAST_IDS as string[]).includes(v);
}

/**
 * Character for a seat: the chosen one when the seed carries it, otherwise a
 * stable pick from the seed (old DiceBear seeds, guests), so a player keeps the
 * same face across hands and devices.
 */
export function castFromSeed(seed: string): CastId {
  if (seed.startsWith(SEED_PREFIX)) {
    const id = seed.slice(SEED_PREFIX.length);
    if (isCastId(id)) return id;
  }
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return CAST_IDS[(h >>> 0) % CAST_IDS.length];
}
