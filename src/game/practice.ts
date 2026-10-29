/**
 * "Play from here": a practice game from a review position, with a goal judged at the end
 * and a way back to the exact review position it came from.
 */
import { winPercent } from '../coach/ratingMoves';
import type { Color, GameResult, GameState } from '../types';

export type PracticeGoal = 'convert' | 'hold' | 'win' | 'free';

export const GOAL_LABELS: Record<PracticeGoal, string> = {
  convert: 'Convert the win',
  hold: 'Hold the draw',
  win: 'Win from here',
  free: 'Free play',
};

/** Your winning chance (0–100) at the start decides the suggested goal. */
export const GOAL_CONFIG = {
  /** At or above this: you're winning, so convert it. */
  convertFrom: 70,
  /** At or above this (and below convertFrom): an edge worth playing for a win. Below: hold the draw. */
  winFrom: 55,
};

/** The suggested goal for the side you'll play, from the White-POV eval of the start position (null if unknown). */
export function suggestGoal(evalWhite: number | null, userColor: Color, c = GOAL_CONFIG): PracticeGoal {
  if (evalWhite === null) return 'free';
  const win = winPercent(userColor === 'w' ? evalWhite : -evalWhite);
  if (win >= c.convertFrom) return 'convert';
  if (win >= c.winFrom) return 'win';
  return 'hold';
}

export interface GoalVerdict {
  /** null for Free play (nothing to judge). */
  met: boolean | null;
  text: string;
}

/** Whether the finished game met its goal. */
export function judgeGoal(goal: PracticeGoal, result: GameResult, userColor: Color): GoalVerdict {
  const won = (result.score === '1-0' && userColor === 'w') || (result.score === '0-1' && userColor === 'b');
  const drew = result.score === '1/2-1/2';
  const outcome = won ? 'You won' : drew ? 'You drew' : 'You lost';
  if (goal === 'free') return { met: null, text: `${outcome}.` };
  const met = goal === 'hold' ? won || drew : won;
  const what = GOAL_LABELS[goal].toLowerCase();
  return { met, text: met ? `${outcome}: goal met (${what}).` : `${outcome}: goal missed (${what}).` };
}

/** Where a practice game came from, so "Back to review" can return to that exact position. */
export interface PracticeOrigin {
  /** 'review': a Chess.com game in Review mode. 'play': the review of a finished game against the coach. */
  source: 'review' | 'play';
  /** Review mode: the game's URL. */
  url?: string;
  /** Play: the finished game being reviewed, restored on the way back. */
  game?: GameState;
  /** Review step to return to (plies applied). */
  step: number;
  goal: PracticeGoal;
  /** White-POV eval of the start position (null if it wasn't analyzed). */
  evalStart: number | null;
  /** White-POV evals of the original game from this position on (index 0 = the start position). */
  originalEvals: (number | null)[];
  /** "Try this position again": started from just before one of your blunders. */
  retry: boolean;
  /** e.g. "your game vs magnus, move 23 with Black to play". */
  label: string;
}

/** What a review hands to Play for "Play from here". */
export interface PracticeRequest {
  fen: string;
  evalWhite: number | null;
  originalEvals: (number | null)[];
  label: string;
  retry: boolean;
  /** Where to go back to (Play adds the finished game itself for source 'play'). */
  back: { source: 'review' | 'play'; url?: string; step: number };
}

/** "move 23 with Black to play", from a FEN. */
export function positionLabel(fen: string): string {
  const [, turn, , , , full] = fen.split(' ');
  return `move ${full} with ${turn === 'w' ? 'White' : 'Black'} to play`;
}

/** Your winning chance after each ply (index 0 = start), from White-POV evals; nulls stay null. */
export function winTrajectory(evals: (number | null)[], userColor: Color): (number | null)[] {
  return evals.map((e) => (e === null ? null : winPercent(userColor === 'w' ? e : -e)));
}
