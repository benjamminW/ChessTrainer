import { COACH_CONFIG, MATE_CP, type Thresholds } from '../config/coach';
import type { Classification } from '../types';

export function clampCp(cp: number, clamp = COACH_CONFIG.clampCp): number {
  return Math.max(-clamp, Math.min(clamp, cp));
}

/**
 * Centipawn loss of a move, from the mover's POV: how much worse the played
 * move scores than the engine's best. Both evals are clamped first, so swings
 * inside an already-decided position (e.g. +15 → +9) count as little or nothing.
 */
export function cpLoss(bestCp: number, playedCp: number, clamp = COACH_CONFIG.clampCp): number {
  return Math.max(0, clampCp(bestCp, clamp) - clampCp(playedCp, clamp));
}

export function classify(
  loss: number,
  isEngineBest: boolean,
  t: Thresholds = COACH_CONFIG.thresholds,
): Classification {
  if (isEngineBest || loss <= t.best) return 'Best';
  if (loss <= t.good) return 'Good';
  if (loss <= t.inaccuracy) return 'Inaccuracy';
  if (loss <= t.mistake) return 'Mistake';
  return 'Blunder';
}

/** True if a score (any POV) represents a forced mate. */
export function isMateScore(cp: number): boolean {
  return Math.abs(cp) > MATE_CP - 1000;
}

/** Mate distance encoded in a mate score (positive = the POV side mates). */
export function mateIn(cp: number): number | null {
  if (!isMateScore(cp)) return null;
  return cp > 0 ? MATE_CP - cp : -(MATE_CP + cp);
}
