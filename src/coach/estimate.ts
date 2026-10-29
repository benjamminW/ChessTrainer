/**
 * This app's own game-quality estimates (not any site's official numbers):
 *   - an estimated rating range from how much winning chance each counted move gave away
 *   - grades per game phase from the same drop
 *
 * The rating is a heuristic. Which moves count is decided in coach/ratingMoves.ts; the
 * drop → rating table is fitted from Lichess games by scripts/build-rating-calibration.mjs
 * (ratingCalibration.json, Lichess rating scale). See the README's "Estimated rating" section.
 */
import { ELO_MAX, ELO_MIN } from '../config/strength';
import CALIBRATION from './ratingCalibration.json';
import type { CountedSide, ExcludeReason } from './ratingMoves';

export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'daily';

export const ESTIMATE_CONFIG = {
  /** Under this many counted moves: "Not enough moves to estimate". */
  minMoves: 15,
  /** A time class needs this many calibration player-games for its own table; otherwise the general one is used. */
  minClassSamples: 2000,
  /** Shrinkage toward the known rating: the raw estimate's weight is n / (n + shrinkK) for n counted moves. */
  shrinkK: 25,
  /** Until `capUntilMoves` counted moves, the estimate can't exceed the known rating by more than this. */
  capMargin: 200,
  capUntilMoves: 30,
  /** Analysis shallower than this misses tactics, so the estimate is flagged "low confidence". */
  minDepth: 16,
  /** Displayed estimates are clamped to the app's Elo range (config/strength.ts). */
  floor: ELO_MIN,
  ceiling: ELO_MAX,
  /** Half-width of the displayed range = z × σ(n) × weight, at least `minHalfRange`; σ(n) = σ40·√(40/n). */
  rangeZ: 0.674,
  minHalfRange: 75,
  /** Displayed numbers are rounded to this. */
  round: 50,
  /** Games played or analyzed before this moment (ISO, UTC) had their estimate computed the old way; the card says it was recalculated. */
  methodSince: '2026-10-29T09:58:26Z',
};

interface ClassTable {
  samples: number;
  sigma40: number;
  table: [number, number][];
}

export interface Calibration {
  source: string;
  scale: string;
  classes: Partial<Record<TimeClass | 'all', ClassTable>>;
}

export const RATING_CALIBRATION = CALIBRATION as unknown as Calibration;

export interface RatingContext {
  timeClass?: TimeClass | null;
  /** The player's rating from the game header (none for games against the coach: its strength isn't a real rating). */
  known?: number | null;
  /** Shallowest engine depth among the counted moves. */
  depth?: number | null;
}

export interface RatingEstimate {
  /** 'few': fewer than minMoves counted moves, no number shown. */
  status: 'ok' | 'few';
  /** Displayed range and its middle (rounded, clamped). */
  low: number;
  high: number;
  mid: number;
  /** The table's value before shrinkage, cap and clamp. */
  raw: number;
  counted: number;
  excluded: Record<ExcludeReason, number>;
  depth: number | null;
  lowConfidence: boolean;
  /** Which calibration table was used ('all' when the time class has too little data). */
  table: TimeClass | 'all';
  shrunk: boolean;
  capped: boolean;
  clamped: boolean;
}

/** The drop → rating table for a time class, falling back to the general one. */
export function tableFor(tc: TimeClass | null | undefined, cal = RATING_CALIBRATION): { id: TimeClass | 'all'; t: ClassTable } {
  const own = tc ? cal.classes[tc] : undefined;
  if (tc && own && own.samples >= ESTIMATE_CONFIG.minClassSamples) return { id: tc, t: own };
  return { id: 'all', t: cal.classes.all! };
}

/** Average win% drop per counted move → rating, linear between table rows (sorted by drop). */
export function ratingFromDrop(avgDrop: number, table: [number, number][]): number {
  if (avgDrop <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (avgDrop >= last[0]) return last[1];
  const i = table.findIndex(([d]) => d > avgDrop);
  const [d0, r0] = table[i - 1];
  const [d1, r1] = table[i];
  return r0 + ((avgDrop - d0) / (d1 - d0)) * (r1 - r0);
}

/** Estimated rating range for one side from its counted moves. Null when it made no reviewed moves at all. */
export function estimateRating(side: CountedSide, ctx: RatingContext = {}, cal = RATING_CALIBRATION): RatingEstimate | null {
  const c = ESTIMATE_CONFIG;
  const n = side.drops.length;
  const total = n + Object.values(side.excluded).reduce((a, b) => a + b, 0);
  if (!total) return null;
  const { id, t } = tableFor(ctx.timeClass, cal);
  const depth = ctx.depth ?? null;
  const base = {
    counted: n,
    excluded: side.excluded,
    depth,
    lowConfidence: depth === null || depth < c.minDepth,
    table: id,
  };
  if (n < c.minMoves) {
    return { ...base, status: 'few', low: 0, high: 0, mid: 0, raw: 0, shrunk: false, capped: false, clamped: false };
  }
  const avg = side.drops.reduce((a, b) => a + b, 0) / n;
  const raw = ratingFromDrop(avg, t.table);
  const known = ctx.known ?? null;
  // Weight on the raw estimate grows with the number of counted moves.
  const w = known === null ? 1 : n / (n + c.shrinkK);
  let mid = w * raw + (1 - w) * (known ?? 0);
  let capped = false;
  if (known !== null && n < c.capUntilMoves && mid > known + c.capMargin) {
    mid = known + c.capMargin;
    capped = true;
  }
  const half = Math.max(c.minHalfRange, c.rangeZ * t.sigma40 * Math.sqrt(40 / n) * w);
  const r = (x: number) => Math.round(x / c.round) * c.round;
  const clamp = (x: number) => Math.max(c.floor, Math.min(c.ceiling, x));
  const low = clamp(r(mid - half));
  const high = clamp(r(mid + half));
  const clampedMid = clamp(r(mid));
  return {
    ...base,
    status: 'ok',
    low,
    high: Math.max(low, high),
    mid: clampedMid,
    raw: Math.round(raw),
    shrunk: known !== null,
    capped,
    clamped: low !== r(mid - half) || high !== r(mid + half),
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
