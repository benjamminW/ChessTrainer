/** Choosing the next puzzle. Pure functions (no fetching), so they're easy to test. */
import type { Puzzle } from './types';

export const SELECT_CONFIG = {
  bandSize: 100,
  /** Pick at random among this many puzzles closest to the target rating, for variety. */
  closest: 12,
};

export function bandOf(rating: number, bands: number[]): number {
  const b = Math.floor(rating / SELECT_CONFIG.bandSize) * SELECT_CONFIG.bandSize;
  return bands.reduce((best, x) => (Math.abs(x - b) < Math.abs(best - b) ? x : best), bands[0]);
}

/** Bands to search, nearest first: [1300, 1200, 1400, 1100, 1500, …]. */
export function bandsToTry(target: number, bands: number[]): number[] {
  const start = bandOf(target, bands);
  return [...bands].sort((a, b) => Math.abs(a - start) - Math.abs(b - start) || a - b);
}

export interface PickOptions {
  target: number;
  /** IDs not to serve (recently seen or already solved). */
  exclude: ReadonlySet<string>;
  /** Lichess theme tag, or 'all'. */
  theme: string;
  random: () => number;
}

/** Picks a puzzle near the target rating from a pool, skipping excluded IDs and off-theme puzzles. */
export function pickPuzzle(pool: Puzzle[], o: PickOptions): Puzzle | null {
  const ok = pool.filter((p) => !o.exclude.has(p.id) && (o.theme === 'all' || p.themes.includes(o.theme)));
  if (!ok.length) return null;
  const nearest = ok
    .map((p) => ({ p, d: Math.abs(p.rating - o.target) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, SELECT_CONFIG.closest);
  return nearest[Math.floor(o.random() * nearest.length)].p;
}
