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
  /**
   * Centipawn-loss thresholds (inclusive upper bounds). A move that equals the
   * engine's top choice is always "Best".
   */
  thresholds: {
    best: 10,
    good: 50,
    inaccuracy: 100,
    mistake: 250,
    // anything above `mistake` is a Blunder
  },
};

export type Thresholds = typeof COACH_CONFIG.thresholds;

/** Centipawn value used for "mate in N": MATE_CP - N, so faster mates score higher. */
export const MATE_CP = 100000;
