import type { PracticeOrigin } from './game/practice';

import type { Color } from 'chess.js';

export type { Color };

/**
 * Move classes, best to worst. Reviews saved before model 2 only use Best, Good, Inaccuracy,
 * Mistake and Blunder; they're migrated on load (see coach/moveClass.ts).
 */
export type Classification =
  | 'Brilliant'
  | 'Great'
  | 'Best'
  | 'Excellent'
  | 'Good'
  | 'Book'
  | 'Inaccuracy'
  | 'Mistake'
  | 'Miss'
  | 'Blunder';

/**
 * Coach verdict on one move. Evals are in centipawns from White's point of view;
 * forced mates are encoded as ±(MATE_CP − N) (see config/coach.ts).
 */
export interface MoveReview {
  classification: Classification;
  cpLoss: number;
  /** Classification model: 2 = win-probability classes (missing on older saves = 1). */
  model?: number;
  /** Drop in the mover's winning chance, percentage points (model 2). */
  winDrop?: number;
  /** Best line minus second-best line (mover's POV, cp), null with one line; missing on older saves. */
  gap?: number | null;
  /** Engine depth of the analysis behind this review; missing on older saves. */
  depth?: number;
  evalBefore: number;
  evalAfter: number;
  bestUci: string | null;
  bestSan: string | null;
  explanation: Explanation;
}

export interface Explanation {
  headline: string;
  details: string[];
  /** Engine's principal variation after the move, in SAN. */
  pvSan: string[];
  /** For non-best moves by the user: the engine's preferred line, in SAN. */
  betterLineSan?: string[];
  /** A general lesson matching the error (e.g. "Blunder check: …"). */
  tip?: string;
  /** Which errors were detected (e.g. 'hangs', 'allows-fork'), for counting patterns across games. */
  kinds?: string[];
}

export interface PlyRecord {
  san: string;
  uci: string;
  color: Color;
  by: 'user' | 'bot';
  fenBefore: string;
  fenAfter: string;
  review?: MoveReview;
  /** Highest hint level the user looked at before playing this move (1–3). */
  hint?: number;
}

export type ResultReason =
  | 'checkmate'
  | 'stalemate'
  | 'threefold repetition'
  | 'insufficient material'
  | '50-move rule'
  | 'resignation';

export interface GameResult {
  /** '1-0', '0-1' or '1/2-1/2' */
  score: '1-0' | '0-1' | '1/2-1/2';
  reason: ResultReason;
}

export interface GameState {
  version: 1;
  startFen: string;
  userColor: Color;
  elo: number;
  plies: PlyRecord[];
  takebacks: number;
  /** Positions where the user asked for a hint. Missing in games saved before hints existed. */
  hintsUsed?: number;
  resigned: Color | null;
  startedAt: string;
  /** Set when the game started from a position other than the opening: where it came from. */
  context?: PositionContext;
  /** Set for "Play from here" practice games: the goal and the review position to go back to. */
  practice?: PracticeOrigin;
}

/** Where a game loaded from a position came from (shown in Play; not replayed). */
export interface PositionContext {
  /** e.g. "Your game vs magnus, move 23". */
  label: string;
  /** The earlier moves that led here (UCI from `startFen`), for reference. */
  history?: { startFen: string; moves: string[] };
}
