/**
 * This app's own game-quality estimates (not Chess.com's, which are proprietary):
 *   - a performance rating from the average drop in winning chance per move
 *   - grades per game phase from the same drop
 * The tables are hand-set and documented in the README; treat them as rough guides.
 */

/**
 * Average win-chance drop per move (percentage points) → estimated rating. Linear between rows.
 * Calibrated by feel against typical club-to-master play: a 2000 player loses ~3 points a move,
 * a beginner 15–20.
 */
export const RATING_TABLE: [avgDrop: number, rating: number][] = [
  [0.5, 2800],
  [1, 2500],
  [2, 2150],
  [3, 1900],
  [4, 1700],
  [5, 1550],
  [7, 1300],
  [10, 1050],
  [14, 800],
  [20, 550],
  [30, 300],
];

export const ESTIMATE_CONFIG = {
  ratingFloor: 100,
  ratingCeiling: 3000,
  /** ± range at `fullSample` moves; widens as √(fullSample / moves) on shorter games. */
  baseRange: 150,
  fullSample: 40,
  /** Under this many moves the estimate is flagged as unreliable. */
  shortGame: 15,
};

export interface RatingEstimate {
  rating: number;
  low: number;
  high: number;
  moves: number;
  /** Too few moves to say much. */
  short: boolean;
}

export function ratingFromDrop(avgDrop: number, table = RATING_TABLE): number {
  const c = ESTIMATE_CONFIG;
  if (avgDrop <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (avgDrop >= last[0]) return Math.max(c.ratingFloor, last[1]);
  const i = table.findIndex(([d]) => d > avgDrop);
  const [d0, r0] = table[i - 1];
  const [d1, r1] = table[i];
  const r = r0 + ((avgDrop - d0) / (d1 - d0)) * (r1 - r0);
  return Math.max(c.ratingFloor, Math.min(c.ratingCeiling, r));
}

/** Estimated performance rating for one side from its per-move win-chance drops. Null with no moves. */
export function estimateRating(drops: number[]): RatingEstimate | null {
  if (!drops.length) return null;
  const c = ESTIMATE_CONFIG;
  const avg = drops.reduce((a, b) => a + b, 0) / drops.length;
  const rating = Math.round(ratingFromDrop(avg) / 10) * 10;
  const range = Math.round((c.baseRange * Math.sqrt(c.fullSample / Math.max(drops.length, 4))) / 10) * 10;
  return {
    rating,
    low: Math.max(c.ratingFloor, rating - range),
    high: Math.min(c.ratingCeiling, rating + range),
    moves: drops.length,
    short: drops.length < c.shortGame,
  };
}

export type PhaseGrade = 'Excellent' | 'Good' | 'Inaccurate' | 'Poor';

/** Upper bounds of average win-chance drop per move for each phase grade. */
export const PHASE_GRADES: [maxAvgDrop: number, grade: PhaseGrade][] = [
  [2, 'Excellent'],
  [4, 'Good'],
  [7, 'Inaccurate'],
  [Infinity, 'Poor'],
];

export function phaseGrade(avgDrop: number): PhaseGrade {
  return PHASE_GRADES.find(([max]) => avgDrop <= max)![1];
}
