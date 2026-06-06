// Sistema de progresion por VOLUMEN de juego (no por victorias).
// Nivel numerico 1..100 derivado del XP acumulado + titulos desbloqueables.
// Funciones puras y deterministas — testeadas en progression.test.ts.

export const MAX_LEVEL = 100;

// XP que se otorga por accion. La progresion premia jugar, no ganar:
// ganar una mano da un bono pequenho que NO domina el volumen.
export const XP_PER_HAND = 10;
export const XP_PER_SESSION = 50;
export const XP_WIN_BONUS = 5;

export type Title = { level: number; name: string; emblem: string };

// Titulos desbloqueables por umbral de nivel (ordenados ascendente).
export const TITLES: Title[] = [
  { level: 1,  name: "Peon",     emblem: "/rangos/peon.png"     },
  { level: 10, name: "Timador",  emblem: "/rangos/timador.png"  },
  { level: 20, name: "Sicario",  emblem: "/rangos/sicario.png"  },
  { level: 35, name: "Capo",     emblem: "/rangos/capo.png"     },
  { level: 50, name: "Verdugo",  emblem: "/rangos/verdugo.png"  },
  { level: 70, name: "Espectro", emblem: "/rangos/espectro.png" },
  { level: 90, name: "Noir",     emblem: "/rangos/noir.png"     },
];

export function rankForLevel(level: number): Title {
  const lvl = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  let rank = TITLES[0];
  for (const t of TITLES) {
    if (t.level <= lvl) rank = t;
    else break;
  }
  return rank;
}

// XP total acumulado necesario para ALCANZAR un nivel dado.
// Nivel 1 = 0 XP. Curva creciente: 100 * (n-1)^1.6.
export function totalXpForLevel(level: number): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  if (n <= 1) return 0;
  return Math.floor(100 * Math.pow(n - 1, 1.6));
}

// Nivel correspondiente a una cantidad de XP (saturado en MAX_LEVEL).
export function levelFromXp(xp: number): number {
  const x = Math.max(0, Math.floor(xp));
  let level = 1;
  for (let n = 2; n <= MAX_LEVEL; n++) {
    if (totalXpForLevel(n) <= x) level = n;
    else break;
  }
  return level;
}

// Titulo desbloqueado para un nivel (el de mayor umbral <= nivel).
export function titleForLevel(level: number): string {
  return rankForLevel(level).name;
}

export type LevelProgress = {
  level: number;
  title: string;
  xpIntoLevel: number; // XP ganado dentro del nivel actual
  xpForNextLevel: number; // XP total que requiere el siguiente nivel (0 si max)
  span: number; // ancho del nivel actual en XP (0 si max)
  ratio: number; // 0..1 progreso hacia el siguiente nivel
  isMax: boolean;
};

// Desglose para la barra de progreso del perfil.
export function levelProgress(xp: number): LevelProgress {
  const x = Math.max(0, Math.floor(xp));
  const level = levelFromXp(x);
  const isMax = level >= MAX_LEVEL;
  const floorXp = totalXpForLevel(level);
  const nextXp = isMax ? floorXp : totalXpForLevel(level + 1);
  const span = Math.max(0, nextXp - floorXp);
  const xpIntoLevel = x - floorXp;
  const ratio = isMax || span === 0 ? 1 : Math.min(1, xpIntoLevel / span);
  return {
    level,
    title: titleForLevel(level),
    xpIntoLevel,
    xpForNextLevel: nextXp,
    span,
    ratio,
    isMax,
  };
}

// Aplica XP a un par {xp,level,title} y recalcula nivel + titulo.
export function addXp<T extends { xp: number; level: number; title: string }>(
  profile: T,
  amount: number,
): T {
  const xp = Math.max(0, Math.floor(profile.xp + Math.max(0, amount)));
  const level = levelFromXp(xp);
  return { ...profile, xp, level, title: titleForLevel(level) };
}

// XP de una sesion/sala: por manos jugadas, manos ganadas y completar la sesion.
export function sessionXp(handsPlayed: number, handsWon: number): number {
  return (
    Math.max(0, handsPlayed) * XP_PER_HAND +
    Math.max(0, handsWon) * XP_WIN_BONUS +
    XP_PER_SESSION
  );
}
