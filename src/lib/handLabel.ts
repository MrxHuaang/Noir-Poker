import type { Card, Rank } from "./poker";
import { bestHand, categoryFor, RANK_VAL } from "./handEval";

const RANK_ES: Record<Rank, string> = {
  "2": "dos",
  "3": "tres",
  "4": "cuatro",
  "5": "cincos",
  "6": "seis",
  "7": "sietes",
  "8": "ochos",
  "9": "nueves",
  T: "dieces",
  J: "jotas",
  Q: "reinas",
  K: "reyes",
  A: "ases",
};

const RANK_ES_SINGULAR: Record<Rank, string> = {
  "2": "dos",
  "3": "tres",
  "4": "cuatro",
  "5": "cinco",
  "6": "seis",
  "7": "siete",
  "8": "ocho",
  "9": "nueve",
  T: "diez",
  J: "jota",
  Q: "reina",
  K: "rey",
  A: "as",
};

const RANK_TO_CHAR: Record<number, Rank> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "T",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

function rankPlural(n: number): string {
  return RANK_ES[RANK_TO_CHAR[n]] ?? "";
}

function rankSingular(n: number): string {
  return RANK_ES_SINGULAR[RANK_TO_CHAR[n]] ?? "";
}

export function describeHand(holeAndCommunity: Card[]): string {
  if (holeAndCommunity.length < 5) {
    if (holeAndCommunity.length === 2) {
      const [a, b] = holeAndCommunity;
      if (a.rank === b.rank) {
        return `Par de ${RANK_ES[a.rank]}`;
      }
      const hi = RANK_VAL[a.rank] >= RANK_VAL[b.rank] ? a : b;
      const lo = hi === a ? b : a;
      return `${RANK_ES_SINGULAR[hi.rank]} y ${RANK_ES_SINGULAR[lo.rank]} altos`;
    }
    return "Esperando…";
  }
  const score = bestHand(holeAndCommunity);
  const cat = categoryFor(score);
  switch (cat) {
    case 8: {
      const high = score[1];
      if (high === 14) return "Escalera real";
      return `Escalera de color al ${rankSingular(high)}`;
    }
    case 7:
      return `Póker de ${rankPlural(score[1])}`;
    case 6:
      return `Full de ${rankPlural(score[1])} con ${rankPlural(score[2])}`;
    case 5:
      return `Color al ${rankSingular(score[1])}`;
    case 4: {
      const high = score[1];
      if (high === 5) return "Escalera al cinco";
      return `Escalera al ${rankSingular(high)}`;
    }
    case 3:
      return `Trío de ${rankPlural(score[1])}`;
    case 2:
      return `Doble par ${rankPlural(score[1])} y ${rankPlural(score[2])}`;
    case 1:
      return `Par de ${rankPlural(score[1])}`;
    case 0:
      return `Carta alta ${rankSingular(score[1])}`;
    default:
      return "—";
  }
}
