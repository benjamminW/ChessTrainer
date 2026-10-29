import type { Phase } from '../coach/facts';
import type { Classification, Color, Explanation } from '../types';

/** Per-move analysis, stored in the IndexedDB cache. Evals are White-POV centipawns (mates as ±(MATE_CP − N)). */
export interface MoveAnalysis {
  evalBefore: number;
  evalAfter: number;
  cpLoss: number;
  classification: Classification;
  bestUci: string | null;
  bestSan: string | null;
  /** Best line minus second-best line (mover's POV), null if only one line. */
  gap: number | null;
  /** Engine's best line from the position before the move (UCI), for "Save as puzzle". */
  bestLine: string[];
  phase: Phase;
  /** The mover's clock before this move (seconds), if the PGN has clocks. */
  clockBefore: number | null;
  /** Seconds spent on this move, if known. */
  spent: number | null;
  /** For your inaccuracies, mistakes and blunders: the coach's explanation (with mistake types in `kinds`). */
  explanation?: Explanation;
}

export interface GameAnalysis {
  url: string;
  version: number;
  depth: number;
  analyzedAt: string;
  userColor: Color;
  moves: MoveAnalysis[];
  /** Our accuracy for each side (see README for the formula). */
  accuracy: { w: number | null; b: number | null };
  opening: { eco: string; name: string } | null;
}
