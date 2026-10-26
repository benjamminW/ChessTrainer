import type { Analysis } from '../engine/uci';
import type { Color, Explanation, PlyRecord } from '../types';
import type { ReviewNumbers } from './review';

/** Everything an explanation provider gets to explain one move. */
export interface MoveContext {
  ply: PlyRecord;
  /** The ply before this one, if any (e.g. to recognise recaptures). */
  prev: PlyRecord | null;
  userColor: Color;
  /** Coach analysis of the position before the move. */
  before: Analysis;
  /** Coach analysis of the position after the move; null if the game ended. */
  after: Analysis | null;
  numbers: ReviewNumbers;
}

/**
 * Turns engine data into plain-English text. The app ships with the rule-based
 * provider; an LLM-backed provider could implement this interface later (e.g. by
 * sending the context plus the rule-based facts to a model) and be swapped in
 * in main.ts without touching the rest of the app.
 */
export interface ExplanationProvider {
  readonly id: string;
  explain(ctx: MoveContext): Promise<Explanation>;
}
