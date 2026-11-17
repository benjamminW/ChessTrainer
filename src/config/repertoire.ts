/** Repertoire training (spaced repetition). */
export const REPS_CONFIG = {
  /** A missed or newly shown move comes back after this many minutes. */
  relearnMinutes: 10,
  startEase: 2.5,
  minEase: 1.3,
  maxEase: 3,
  maxIntervalDays: 365,
  /** Pause before the opponent's move, so it doesn't appear instantly (ms). */
  replyDelayMs: 450,
  /** Engine depth for the eval shown while building. */
  evalDepth: 16,
  /** Book moves listed under the board while building. */
  bookMovesShown: 8,
};
