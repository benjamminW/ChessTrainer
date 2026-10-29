import type { Outcome } from './types';

/**
 * Puzzle rating: a plain Elo update against the puzzle's Lichess rating.
 *   expected = 1 / (1 + 10^((puzzle − player) / 400))
 *   change   = K × (score − expected)
 * K is larger while the rating is provisional so it finds your level quickly.
 *
 * Assisted solves (a hint was used) change nothing: hints can't be used to farm rating,
 * and asking for help is never punished. A wrong move is a normal loss, hint or not.
 */
export const RATING_CONFIG = {
  start: 1200,
  provisionalPuzzles: 20,
  kProvisional: 40,
  k: 20,
  floor: 100,
};

export function expectedScore(player: number, puzzle: number): number {
  return 1 / (1 + 10 ** ((puzzle - player) / 400));
}

export function kFactor(ratedPlayed: number): number {
  return ratedPlayed < RATING_CONFIG.provisionalPuzzles ? RATING_CONFIG.kProvisional : RATING_CONFIG.k;
}

/** Rating change (rounded) for one rated attempt. `ratedPlayed` = rated puzzles before this one. */
export function ratingChange(player: number, puzzle: number, outcome: Outcome, ratedPlayed: number): number {
  if (outcome === 'assisted') return 0;
  const score = outcome === 'solved' ? 1 : 0;
  const change = Math.round(kFactor(ratedPlayed) * (score - expectedScore(player, puzzle)));
  return Math.max(RATING_CONFIG.floor - player, change);
}
