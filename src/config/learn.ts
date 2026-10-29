/** Learn mode tuning. */
export const LEARN_CONFIG = {
  /** A Try move is accepted when it loses at most this many win% points against the engine's best (positions with more than 7 pieces). */
  tryMargin: 3,
  /** Engine depth for judging Try moves and for the coach's replies in Practice (more than 7 pieces, or when the tablebase is unreachable). */
  engineDepth: 16,
  /** A Practice step with a draw goal counts as held after this many of your moves without the result getting worse. */
  holdMoves: 20,
  /** Review → Learn: a phase graded Inaccurate or Poor on at least this many counted moves suggests lessons. */
  suggestMinMoves: 4,
  /** At most this many suggested lessons. */
  suggestMax: 3,
  /** Verify script: engine depth, and the win% a "win" claim needs when the tablebase can't be used. */
  verifyDepth: 20,
  verifyWinPct: 90,
  /** Verify script: a "draw" claim needs the engine eval within this many centipawns of 0 (more than 7 pieces). */
  verifyDrawCp: 60,
};
