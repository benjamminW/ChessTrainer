/** Everything the single-game review screen shows, derived from the cached analysis. */
import type { Color } from 'chess.js';
import { buildGameReview, winPercent, type GameReview, type KeyMoment } from '../coach/gameReview';
import { describeIdea } from '../coach/ruleBased';
import { clampCp } from '../coach/classify';
import { REVIEW_CONFIG } from '../config/review';
import { toPlies, withReviews } from './analyzer';
import type { ImportedGame } from './pgn';
import type { GameAnalysis } from './types';

export interface GoodMoment {
  index: number;
  san: string;
  /** How much better it was than the second-best move (centipawns). */
  gap: number;
  idea: string;
}

export interface TimeUse {
  /** Seconds spent on each ply (null where unknown). */
  spent: (number | null)[];
  /** Your moves made with under REVIEW_CONFIG.timeTroubleSec on the clock. */
  troubleMoves: number;
  /** Of those, how many were mistakes or blunders. */
  troubleErrors: number;
  /** Index of your first move in time trouble. */
  troubleFrom: number | null;
  /** Your moves where you thought a long time and still made a mistake or blunder. */
  longThinkErrors: { index: number; spent: number }[];
}

export interface GameSummary {
  review: GameReview;
  /** The largest drops in your winning chances (3–5 when available), biggest first. */
  keyMoments: KeyMoment[];
  goodMoments: GoodMoment[];
  /** Ply counts (1-based) of the three biggest eval swings, for graph markers. */
  swings: number[];
  time: TimeUse | null;
}

const ERRORS = ['Mistake', 'Blunder'];

export function summarizeGame(game: ImportedGame, a: GameAnalysis): GameSummary {
  const user = a.userColor;
  const plies = withReviews(toPlies(game, user), a);
  const review = buildGameReview(plies, user);

  const keyMoments = [...review.moments].sort((x, y) => y.winDrop - x.winDrop).slice(0, REVIEW_CONFIG.keyMoments.max);

  const goodMoments: GoodMoment[] = a.moves
    .map((m, i) => ({ m, i }))
    .filter(({ m, i }) => plies[i].color === user && m.classification === 'Best' && m.gap !== null && m.gap >= REVIEW_CONFIG.onlyMoveGapCp)
    .sort((x, y) => clampCp(y.m.gap!) - clampCp(x.m.gap!))
    .slice(0, REVIEW_CONFIG.goodMoments)
    .sort((x, y) => x.i - y.i)
    .map(({ m, i }) => ({
      index: i,
      san: plies[i].san,
      gap: m.gap!,
      idea: describeIdea(plies[i].fenBefore, plies[i].uci, user),
    }));

  const swings = a.moves
    .map((m, i) => ({ i, d: Math.abs(winPercent(m.evalAfter) - winPercent(m.evalBefore)) }))
    .sort((x, y) => y.d - x.d)
    .slice(0, 3)
    .filter((s) => s.d >= 15)
    .map((s) => s.i + 1);

  return { review, keyMoments, goodMoments, swings, time: game.hasClocks ? timeUse(a, user) : null };
}

export function timeUse(a: GameAnalysis, user: Color): TimeUse {
  const t: TimeUse = { spent: a.moves.map((m) => m.spent), troubleMoves: 0, troubleErrors: 0, troubleFrom: null, longThinkErrors: [] };
  a.moves.forEach((m, i) => {
    // Imported games start from the initial position, so White plays the even plies.
    const mine = (i % 2 === 0 ? 'w' : 'b') === user;
    if (!mine || m.clockBefore === null) return;
    const error = ERRORS.includes(m.classification);
    if (m.clockBefore < REVIEW_CONFIG.timeTroubleSec) {
      t.troubleMoves++;
      if (error) t.troubleErrors++;
      t.troubleFrom ??= i;
    }
    const threshold = Math.max(REVIEW_CONFIG.longThinkMinSec, REVIEW_CONFIG.longThinkShare * m.clockBefore);
    if (error && m.spent !== null && m.spent >= threshold) t.longThinkErrors.push({ index: i, spent: m.spent });
  });
  return t;
}
