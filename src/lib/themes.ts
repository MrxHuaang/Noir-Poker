export type TableThemeId =
  | "noir"
  | "emerald"
  | "ruby"
  | "sapphire"
  | "midnight"
  | "amber";

export type TableTheme = {
  id: TableThemeId;
  label: string;
  feltGradient: string;
  ringColor: string;
  accent: string;
  accentSoft: string;
};

export const TABLE_THEMES: Record<TableThemeId, TableTheme> = {
  noir: {
    id: "noir",
    label: "Noir",
    feltGradient:
      "radial-gradient(ellipse at center, #18152a 0%, #0e0b18 55%, #060410 100%)",
    ringColor: "rgba(167,139,250,0.18)",
    accent: "#a78bfa",
    accentSoft: "rgba(167,139,250,0.10)",
  },
  emerald: {
    id: "emerald",
    label: "Esmeralda",
    feltGradient:
      "radial-gradient(ellipse at center, #0f3d2e 0%, #0a2a20 55%, #06140f 100%)",
    ringColor: "rgba(52,211,153,0.18)",
    accent: "#34d399",
    accentSoft: "rgba(52,211,153,0.12)",
  },
  ruby: {
    id: "ruby",
    label: "Rubí",
    feltGradient:
      "radial-gradient(ellipse at center, #4a0d1e 0%, #2c0712 55%, #150309 100%)",
    ringColor: "rgba(244,114,182,0.18)",
    accent: "#fb7185",
    accentSoft: "rgba(244,114,182,0.12)",
  },
  sapphire: {
    id: "sapphire",
    label: "Zafiro",
    feltGradient:
      "radial-gradient(ellipse at center, #0d2a4a 0%, #07172c 55%, #030915 100%)",
    ringColor: "rgba(96,165,250,0.18)",
    accent: "#60a5fa",
    accentSoft: "rgba(96,165,250,0.12)",
  },
  midnight: {
    id: "midnight",
    label: "Medianoche",
    feltGradient:
      "radial-gradient(ellipse at center, #141220 0%, #0a091a 55%, #040310 100%)",
    ringColor: "rgba(139,111,232,0.16)",
    accent: "#8b6fe8",
    accentSoft: "rgba(139,111,232,0.10)",
  },
  amber: {
    id: "amber",
    label: "Ámbar",
    feltGradient:
      "radial-gradient(ellipse at center, #4a2a0c 0%, #2c1806 55%, #150b03 100%)",
    ringColor: "rgba(251,191,36,0.18)",
    accent: "#fbbf24",
    accentSoft: "rgba(251,191,36,0.12)",
  },
};

export const TABLE_THEME_LIST: TableTheme[] = Object.values(TABLE_THEMES);

export function getTableTheme(id?: string | null): TableTheme {
  if (id && id in TABLE_THEMES) return TABLE_THEMES[id as TableThemeId];
  return TABLE_THEMES.noir;
}

export type CardBackId =
  | "classic-red"
  | "classic-blue"
  | "stripes"
  | "diamonds"
  | "logo";

export type CardBack = {
  id: CardBackId;
  label: string;
  background: string;
  pattern: string;
  centerColor: string;
};

export const CARD_BACKS: Record<CardBackId, CardBack> = {
  "classic-red": {
    id: "classic-red",
    label: "Clásico Rojo",
    background:
      "linear-gradient(135deg,#7f1d1d 0%,#450a0a 60%,#2c0606 100%)",
    pattern:
      "repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 10px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 10px)",
    centerColor: "rgba(255,255,255,0.32)",
  },
  "classic-blue": {
    id: "classic-blue",
    label: "Clásico Azul",
    background:
      "linear-gradient(135deg,#1e3a8a 0%,#0c1f4a 60%,#06122c 100%)",
    pattern:
      "repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0 2px, transparent 2px 10px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 10px)",
    centerColor: "rgba(255,255,255,0.32)",
  },
  stripes: {
    id: "stripes",
    label: "Rayas",
    background:
      "linear-gradient(135deg,#1a1f3a 0%,#0c1024 60%,#0a0d1c 100%)",
    pattern:
      "repeating-linear-gradient(90deg, rgba(255,255,255,0.1) 0 3px, transparent 3px 12px)",
    centerColor: "rgba(255,255,255,0.3)",
  },
  diamonds: {
    id: "diamonds",
    label: "Diamantes",
    background:
      "linear-gradient(135deg,#2d1f4a 0%,#1a0f2e 60%,#0d0718 100%)",
    pattern:
      "repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 8px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 8px)",
    centerColor: "rgba(255,255,255,0.4)",
  },
  logo: {
    id: "logo",
    label: "Noir",
    background:
      "linear-gradient(135deg,#2e1a52 0%,#1a0f35 55%,#09061a 100%)",
    pattern:
      "repeating-linear-gradient(45deg, rgba(167,139,250,0.09) 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, rgba(167,139,250,0.07) 0 1px, transparent 1px 9px)",
    centerColor: "rgba(167,139,250,0.55)",
  },
};

export const CARD_BACK_LIST: CardBack[] = Object.values(CARD_BACKS);

export function getCardBack(id?: string | null): CardBack {
  if (id && id in CARD_BACKS) return CARD_BACKS[id as CardBackId];
  return CARD_BACKS["logo"];
}

/* ── Card Face designs ─────────────────────────────────────────────── */

export type CardFaceId = "classic" | "dark" | "neon" | "noir" | "balatro";

export type CardFace = {
  id: CardFaceId;
  label: string;
  description: string;
};

export const CARD_FACES: Record<CardFaceId, CardFace> = {
  classic: {
    id: "classic",
    label: "Clásico",
    description: "Fondo blanco tradicional",
  },
  dark: {
    id: "dark",
    label: "Oscuro",
    description: "Fondo negro, palos iluminados",
  },
  neon: {
    id: "neon",
    label: "Neón",
    description: "Brillo neón por palo",
  },
  noir: {
    id: "noir",
    label: "Noir",
    description: "Estilo de marca blanco y negro",
  },
  balatro: {
    id: "balatro",
    label: "Balatro",
    description: "Color por palo, estilo arcade oscuro",
  },
};

export const CARD_FACE_LIST: CardFace[] = Object.values(CARD_FACES);

export function getCardFace(id?: string | null): CardFace {
  if (id && id in CARD_FACES) return CARD_FACES[id as CardFaceId];
  return CARD_FACES.classic;
}

/* ── Room backgrounds ──────────────────────────────────────────────── */

export type RoomBgId =
  | "onyx"
  | "smoke"
  | "carbon"
  | "ash"
  | "slate"
  | "ink"
  | "coal";

export type RoomBg = {
  id: RoomBgId;
  label: string;
  gradient: string;
};

export const ROOM_BACKGROUNDS: Record<RoomBgId, RoomBg> = {
  onyx: {
    id: "onyx",
    label: "Onyx",
    gradient: "radial-gradient(ellipse at 50% 0%, #1a1a1a 0%, #0b0b0b 55%, #060606 100%)",
  },
  smoke: {
    id: "smoke",
    label: "Humo",
    gradient: "linear-gradient(160deg, #1e1e1e 0%, #111111 40%, #080808 100%)",
  },
  carbon: {
    id: "carbon",
    label: "Carbón",
    gradient: "radial-gradient(ellipse at 30% 20%, #242424 0%, #0f0f0f 50%, #050505 100%)",
  },
  ash: {
    id: "ash",
    label: "Ceniza",
    gradient: "linear-gradient(135deg, #252525 0%, #141414 50%, #090909 100%)",
  },
  slate: {
    id: "slate",
    label: "Pizarra",
    gradient: "linear-gradient(160deg, #1a1d22 0%, #0e1015 50%, #06080b 100%)",
  },
  ink: {
    id: "ink",
    label: "Tinta",
    gradient: "radial-gradient(ellipse at 60% 80%, #15161a 0%, #0a0b0e 55%, #040405 100%)",
  },
  coal: {
    id: "coal",
    label: "Coque",
    gradient: "conic-gradient(from 180deg at 50% 120%, #1c1c1c 0deg, #0d0d0d 120deg, #181818 240deg, #1c1c1c 360deg)",
  },
};

export const ROOM_BG_LIST: RoomBg[] = Object.values(ROOM_BACKGROUNDS);

export function getRoomBg(id?: string | null): RoomBg {
  if (id && id in ROOM_BACKGROUNDS) return ROOM_BACKGROUNDS[id as RoomBgId];
  return ROOM_BACKGROUNDS.onyx;
}
