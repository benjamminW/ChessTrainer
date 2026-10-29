/** Coach (analysis + explanation) tuning. Independent of the bot's strength. */

export const COACH_CONFIG = {
  /** Fixed depth for the coach's own analysis of every position. */
  depth: 13,
  /** Lines analysed per position (the played move is often among them). */
  multiPv: 3,
  /** Evals are clamped to ±clampCp before computing loss, so +12 → +9 isn't a "blunder". */
  clampCp: 1000,
  /** Moves of the principal variation shown under an explanation. */
  pvLength: 6,
};

/**
 * Move classification (model 2). Everything is measured in the mover's winning chance,
 * win% = 50 + 50 × (2 / (1 + e^(−0.00368208 × cp)) − 1) (Lichess's curve; see coach/gameReview.ts),
 * and a move's "drop" is win% after the engine's best move minus win% after the move played.
 * All numbers are percentage points.
 */
export const MOVE_CLASS = {
  /** The engine's top move, or anything within this of it, is Best. */
  best: 0.5,
  excellent: 2,
  good: 5,
  inaccuracy: 10,
  mistake: 20,
  // more than `mistake` is a Blunder
  /** Miss: you had a clear win and let it go, but aren't losing afterwards. */
  miss: { minBestWin: 75, minDrop: 10, minWinAfter: 40 },
  /** Great: the only good move (the next best is this much worse) in an equal or worse position. */
  great: { minGap: 15, maxWinBefore: 60 },
  /** Brilliant: a sound sacrifice of at least a minor piece, checked by an extra engine search. */
  brilliant: { minSacrifice: 3, maxWinBefore: 90, minWinAfter: 50, maxDrop: 2, verifyDepth: 12 },
};

export type MoveClassConfig = typeof MOVE_CLASS;

/** Centipawn value used for "mate in N": MATE_CP - N, so faster mates score higher. */
export const MATE_CP = 100000;
