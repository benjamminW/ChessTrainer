/** Review mode (chess.com game import) tuning. */

export interface AnalysisPreset {
  id: 'quick' | 'deep';
  name: string;
  depth: number;
  multiPv: number;
}

/**
 * Engine depth per position. Measured on the bundled Stockfish 19 Lite (MultiPV 3):
 * depth 14 ≈ 0.3 s, depth 18 ≈ 1–2 s per position; a typical game has ~80 positions.
 */
export const PRESETS: Record<AnalysisPreset['id'], AnalysisPreset> = {
  quick: { id: 'quick', name: 'Quick (depth 14, ~30 s/game)', depth: 14, multiPv: 3 },
  deep: { id: 'deep', name: 'Deep (depth 18, a few min/game)', depth: 18, multiPv: 3 },
};

export const REVIEW_CONFIG = {
  /** Games analyzed by "Analyze latest N" unless changed. */
  defaultBatch: 10,
  /** Clock time (seconds) below which you're "in time trouble". */
  timeTroubleSec: 30,
  /** A move counts as a "long think" when it uses at least this share of the remaining clock… */
  longThinkShare: 0.1,
  /** …and at least this many seconds. */
  longThinkMinSec: 20,
  /** Key moments against you shown per game (largest win% drops). */
  keyMoments: { min: 3, max: 5 },
  /** "Played well": best move was at least this many centipawns better than the second best, and you found it. */
  onlyMoveGapCp: 150,
  goodMoments: 2,
  /** Patterns with fewer instances than this are reported as too small to call. */
  minSample: 5,
  /** A saved puzzle's solution stops after this many of your moves. */
  puzzleMaxMoves: 3,
  /** Bumped when the cached per-move data format changes; older entries are migrated (review/migrate.ts). */
  analysisVersion: 3,
};
