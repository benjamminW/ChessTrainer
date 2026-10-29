/**
 * Move classification, model 2: win-probability based, with Book, Miss, Great and Brilliant
 * on top of the base scale. One classifier for Play reviews, Review mode and migration.
 *
 * All quantities are the mover's winning chance in percentage points (see MOVE_CLASS).
 */
import { Chess, type Move } from 'chess.js';
import { MOVE_CLASS } from '../config/coach';
import type { Analysis, SearchOptions } from '../engine/uci';
import { parseUci, uciOf } from '../game/session';
import type { Classification, MoveReview, PlyRecord } from '../types';
import { classify, isMateScore } from './classify';
import { VALUE, isHanging } from './facts';
import { winPercent } from './ratingMoves';

export const CLASS_MODEL = 2;

/** Drop in the mover's win chance when playing a move scored `playedCp` instead of the best (`bestCp`). */
export function winDrop(bestCp: number, playedCp: number): number {
  return Math.max(0, winPercent(bestCp) - winPercent(playedCp));
}

export interface ClassInput {
  /** Mover-POV centipawns (mates as ±(MATE_CP − N)). */
  bestCp: number;
  playedCp: number;
  /** Second-best line, mover POV; null if the engine returned only one line. */
  secondCp: number | null;
  isEngineBest: boolean;
  /** Still inside opening theory (this move and every move before it are book moves). */
  inBook: boolean;
  legalMoves: number;
  /** Takes back on the square where the opponent just captured. */
  isRecapture: boolean;
}

/** The class without the Brilliant check (which needs an engine search, see confirmBrilliant). */
export function classifyMove(i: ClassInput, t = MOVE_CLASS): Classification {
  if (i.inBook) return 'Book';
  const drop = winDrop(i.bestCp, i.playedCp);
  const base = classify(drop, i.isEngineBest, t);
  const winBest = winPercent(i.bestCp);
  const winPlayed = winPercent(i.playedCp);

  if (base === 'Best' && i.secondCp !== null && i.legalMoves > 1 && !i.isRecapture) {
    const gap = winBest - winPercent(i.secondCp);
    if (gap >= t.great.minGap && winBest <= t.great.maxWinBefore) return 'Great';
  }
  const hadWin = winBest >= t.miss.minBestWin || (isMateScore(i.bestCp) && i.bestCp > 0);
  if (hadWin && drop >= t.miss.minDrop && winPlayed >= t.miss.minWinAfter) return 'Miss';
  return base;
}

export interface Sacrifice {
  /** The opponent's capture that wins the material (UCI). */
  captureUci: string;
  /** Net material the opponent wins by taking (pawns). */
  gain: number;
}

/**
 * Static check for a real sacrifice: after the move, the opponent can capture a piece worth at
 * least a minor piece and come out ahead by 2+ pawns, the target wasn't already hanging before
 * the move, and the move itself didn't capture as much. Trades and pawn sacs don't count.
 */
export function findSacrifice(fenBefore: string, uci: string, minValue = MOVE_CLASS.brilliant.minSacrifice): Sacrifice | null {
  const before = new Chess(fenBefore);
  let move: Move;
  const after = new Chess(fenBefore);
  try {
    move = after.move(parseUci(uci));
  } catch {
    return null;
  }
  const me = move.color;
  const taken = move.captured ? VALUE[move.captured] : 0;
  let best: Sacrifice | null = null;
  for (const m of after.moves({ verbose: true })) {
    if (!m.captured || VALUE[m.captured] < minValue) continue;
    // A piece that was already hanging before this move isn't being sacrificed by it.
    if (m.to !== move.to && before.get(m.to)?.color === me && isHanging(before, m.to)) continue;
    const reply = new Chess(m.after);
    const recapture = reply.attackers(m.to, me).length > 0;
    const gain = VALUE[m.captured] - (recapture ? VALUE[m.piece] || 100 : 0) - taken;
    if (gain >= 2 && (!best || gain > best.gain)) best = { captureUci: uciOf(m), gain };
  }
  return best;
}

/** Brilliant candidate: Best/Excellent, a real sacrifice, not already winning, and still fine after it. */
export function brilliantCandidate(cls: Classification, bestCp: number, playedCp: number, sac: Sacrifice | null, t = MOVE_CLASS): boolean {
  if (!sac || (cls !== 'Best' && cls !== 'Excellent' && cls !== 'Great')) return false;
  return winPercent(bestCp) <= t.brilliant.maxWinBefore && winPercent(playedCp) >= t.brilliant.minWinAfter;
}

/**
 * Verifies a sacrifice with a short engine search of the opponent actually taking the material.
 * Brilliant only if, after the capture, the mover is still at least `minWinAfter` and has lost
 * no more than `maxDrop` from the best line. Conservative on purpose.
 */
export async function confirmBrilliant(
  fenAfter: string,
  sac: Sacrifice,
  bestCp: number,
  analyze: (fen: string, opts: SearchOptions) => Promise<Analysis>,
  owner?: string,
  t = MOVE_CLASS,
): Promise<boolean> {
  const a = await analyze(fenAfter, { depth: t.brilliant.verifyDepth, multiPv: 1, searchMoves: [sac.captureUci], owner });
  const line = a.lines[0];
  if (!line || line.pv[0] !== sac.captureUci) return false;
  const moverWin = winPercent(-line.cp); // the search is from the opponent's side
  return moverWin >= t.brilliant.minWinAfter && moverWin >= winPercent(bestCp) - t.brilliant.maxDrop;
}

/** Facts about the position needed by classifyMove that come from the board itself. */
export function boardFacts(ply: Pick<PlyRecord, 'fenBefore' | 'uci'>, prev: Pick<PlyRecord, 'uci' | 'san'> | null): { legalMoves: number; isRecapture: boolean } {
  const legalMoves = new Chess(ply.fenBefore).moves().length;
  const isRecapture = !!prev && prev.san.includes('x') && prev.uci.slice(2, 4) === ply.uci.slice(2, 4);
  return { legalMoves, isRecapture };
}

// ---------------------------------------------------------------- migration

/**
 * Upgrades a review saved by the old centipawn classifier (model 1) to model 2, using only the
 * stored evals: no engine needed. Great needs the second-best line and Brilliant an engine search,
 * so migrated reviews never get those (a deeper re-analysis fills them in). Book is applied when
 * `inBook` is known.
 */
export function migrateReview(r: MoveReview, ply: Pick<PlyRecord, 'color' | 'uci' | 'fenBefore'>, prev: Pick<PlyRecord, 'uci' | 'san'> | null, inBook = false): MoveReview {
  if ((r.model ?? 1) >= CLASS_MODEL) return r;
  const s = ply.color === 'w' ? 1 : -1;
  const bestCp = r.evalBefore * s;
  const playedCp = r.evalAfter * s;
  const isEngineBest = r.bestUci === ply.uci;
  const facts = boardFacts(ply, prev);
  const classification = classifyMove({ bestCp, playedCp, secondCp: null, isEngineBest, inBook, ...facts });
  return { ...r, classification, winDrop: isEngineBest ? 0 : winDrop(bestCp, playedCp), model: CLASS_MODEL };
}
