/**
 * Which moves count toward the estimated game rating, and how much each one cost.
 *
 * Shared by the app (coach/estimate.ts) and the calibration script
 * (scripts/build-rating-calibration.mjs runs this file directly with Node's type stripping),
 * so the rating table is fitted with exactly the rules it is applied with. Keep this file
 * free of local imports for that reason.
 */
import { Chess } from 'chess.js';

export const RATING_COUNT_CONFIG = {
  /** Once the side to move is above this win% (or below 100 − this), the game is decided and counting stops. */
  decidedWin: 95,
  /** A move is "all equal" when it had at most this many legal moves and they were all within `allEqualMargin`. */
  allEqualMaxMoves: 2,
  /** Win% points: candidates this close to the best make the choice too easy to tell anything. */
  allEqualMargin: 2,
};

/** Chance of winning (0–100) for a centipawn eval from the mover's POV (lichess's formula). Mates are ±100000-ish and map to 100/0. */
export function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export type ExcludeReason = 'book' | 'forced' | 'allEqual' | 'recapture' | 'decided';

export interface RatedMove {
  color: 'w' | 'b';
  /** Mover's win% before the move (with best play) and after the move played. */
  winBefore: number;
  winAfter: number;
  inBook: boolean;
  legalMoves: number;
  /** Win% gap between the best and second-best move, or null if unknown. */
  gapWin: number | null;
  /** The first recapture after an even trade (e.g. BxN, then taking back the bishop). */
  evenRecapture: boolean;
}

export interface CountedSide {
  /** Win% drop of each counted move. */
  drops: number[];
  excluded: Record<ExcludeReason, number>;
}

export interface CountedGame {
  w: CountedSide;
  b: CountedSide;
  /** Index of the first move made in a decided position, or null if the game was never decided. */
  decidedAt: number | null;
  /** Per move: why it was left out, or null if it counted. */
  reasons: (ExcludeReason | null)[];
}

const emptySide = (): CountedSide => ({ drops: [], excluded: { book: 0, forced: 0, allEqual: 0, recapture: 0, decided: 0 } });

/** Why a move doesn't count (decided positions are handled by countMoves), or null if it counts. */
export function excludeReason(m: RatedMove, c = RATING_COUNT_CONFIG): ExcludeReason | null {
  if (m.inBook) return 'book';
  if (m.legalMoves <= 1) return 'forced';
  if (m.legalMoves <= c.allEqualMaxMoves && m.gapWin !== null && m.gapWin <= c.allEqualMargin) return 'allEqual';
  if (m.evenRecapture) return 'recapture';
  return null;
}

/** Splits a game's moves into counted drops per side; counting stops for both sides once the game is decided. */
export function countMoves(moves: RatedMove[], c = RATING_COUNT_CONFIG): CountedGame {
  const out: CountedGame = { w: emptySide(), b: emptySide(), decidedAt: null, reasons: [] };
  moves.forEach((m, i) => {
    const side = out[m.color];
    if (out.decidedAt === null && (m.winBefore > c.decidedWin || m.winBefore < 100 - c.decidedWin)) out.decidedAt = i;
    const why = out.decidedAt !== null ? 'decided' : excludeReason(m, c);
    out.reasons.push(why);
    if (why) side.excluded[why]++;
    else side.drops.push(Math.max(0, m.winBefore - m.winAfter));
  });
  return out;
}

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * True when this move takes back on the square where the opponent just captured, and that capture
 * was an even trade (the piece taken was worth the same as the piece that took it).
 */
export function isEvenRecapture(fenBefore: string, uci: string, prev: { fenBefore: string; uci: string } | null): boolean {
  if (!prev) return false;
  const sq = prev.uci.slice(2, 4);
  if (uci.slice(2, 4) !== sq) return false;
  try {
    const before = new Chess(prev.fenBefore);
    const taken = before.get(sq as never);
    const taker = before.get(prev.uci.slice(0, 2) as never);
    if (!taken || !taker) return false;
    const now = new Chess(fenBefore).get(sq as never);
    // We must be capturing the piece that just captured.
    return !!now && now.color !== new Chess(fenBefore).turn() && VALUES[taken.type] === VALUES[taker.type];
  } catch {
    return false;
  }
}
