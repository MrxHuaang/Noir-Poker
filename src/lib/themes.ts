export type TableThemeId =
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
      "radial-gradient(ellipse at center, #1c1c2e 0%, #0d0d18 55%, #050508 100%)",
    ringColor: "rgba(168,162,212,0.18)",
    accent: "#a78bfa",
    accentSoft: "rgba(167,139,250,0.12)",
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
  return TABLE_THEMES.emerald;
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
    label: "Showdown",
    background:
      "linear-gradient(135deg,#0f3d2e 0%,#06140f 60%,#020806 100%)",
    pattern:
      "radial-gradient(circle at center, rgba(52,211,153,0.18) 0%, transparent 60%)",
    centerColor: "#34d399",
  },
};

export const CARD_BACK_LIST: CardBack[] = Object.values(CARD_BACKS);

export function getCardBack(id?: string | null): CardBack {
  if (id && id in CARD_BACKS) return CARD_BACKS[id as CardBackId];
  return CARD_BACKS["classic-blue"];
}

/* ── Card Face designs ─────────────────────────────────────────────── */

export type CardFaceId = "classic" | "dark" | "neon" | "showdown";

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
  showdown: {
    id: "showdown",
    label: "Showdown",
    description: "Estilo de marca esmeralda",
  },
};

export const CARD_FACE_LIST: CardFace[] = Object.values(CARD_FACES);

export function getCardFace(id?: string | null): CardFace {
  if (id && id in CARD_FACES) return CARD_FACES[id as CardFaceId];
  return CARD_FACES.classic;
}
