import { Chess, type PieceSymbol } from 'chess.js';
import { VALUE, piecesOf } from '../coach/facts';
import type { Color } from '../types';

export interface MaterialSide {
  /** Opponent pieces this side has captured, cheapest first (pawns, knights, bishops, rooks, queens). */
  captured: PieceSymbol[];
  /** Material lead in pawns (0 for the side that isn't ahead). */
  lead: number;
}

const START: Partial<Record<PieceSymbol, number>> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const ORDER: PieceSymbol[] = ['p', 'n', 'b', 'r', 'q'];

/**
 * Captured pieces for each side, relative to the standard starting set, and the
 * material lead. A promoted pawn shows as captured, but the lead is exact.
 */
export function materialSummary(fen: string): Record<Color, MaterialSide> {
  const chess = new Chess(fen);
  const count = (c: Color) => {
    const n: Partial<Record<PieceSymbol, number>> = {};
    for (const p of piecesOf(chess, c)) n[p.type] = (n[p.type] ?? 0) + 1;
    return n;
  };
  const have = { w: count('w'), b: count('b') };
  const capturedBy = (c: Color): PieceSymbol[] => {
    const theirs = have[c === 'w' ? 'b' : 'w'];
    return ORDER.flatMap((t) => Array(Math.max(0, (START[t] ?? 0) - (theirs[t] ?? 0))).fill(t));
  };
  const total = (c: Color) => ORDER.reduce((s, t) => s + (have[c][t] ?? 0) * VALUE[t], 0);
  const diff = total('w') - total('b');
  return {
    w: { captured: capturedBy('w'), lead: Math.max(0, diff) },
    b: { captured: capturedBy('b'), lead: Math.max(0, -diff) },
  };
}
