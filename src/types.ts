import type { Color } from 'chess.js';

export type { Color };

export type Classification = 'Best' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';

/**
 * Coach verdict on one move. Evals are in centipawns from White's point of view;
 * forced mates are encoded as ±(MATE_CP − N) (see config/coach.ts).
 */
export interface MoveReview {
  classification: Classification;
  cpLoss: number;
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
}

export interface PlyRecord {
  san: string;
  uci: string;
  color: Color;
  by: 'user' | 'bot';
  fenBefore: string;
  fenAfter: string;
  review?: MoveReview;
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
  resigned: Color | null;
  startedAt: string;
}
