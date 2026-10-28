/**
 * Post-game review: accuracy, move-quality counts, the game's turning point and
 * the user's key mistakes, built from the per-move reviews the coach already stored.
 */
import { Chess } from 'chess.js';
import type { Classification, Color, PlyRecord } from '../types';
import { gamePhase, type Phase } from './facts';
import { formatEval } from './format';

export const CLASSES: Classification[] = ['Best', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'];

/** Chance of winning (0–100) for a centipawn eval from the mover's POV (lichess's formula). */
export function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Accuracy of one move (0–100) from the mover's win% before and after it (lichess's formula). */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, winBefore - winAfter)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

export interface SideStats {
  moves: number;
  counts: Record<Classification, number>;
  /** Average move accuracy, or null with no reviewed moves. */
  accuracy: number | null;
  /** Average centipawn loss, or null with no reviewed moves. */
  acpl: number | null;
}

export interface KeyMoment {
  /** Index into plies. */
  index: number;
  ply: PlyRecord;
  classification: Classification;
  /** How much the move cost in win chance, in percentage points. */
  winDrop: number;
  /** The opponent had just blundered and this move didn't punish it. */
  missedChance: boolean;
  /** The single most costly move of the game. */
  turningPoint: boolean;
  bestSan: string | null;
  bestEval: string;
  /** Short reason, from the move's explanation. */
  reason: string;
  tip?: string;
}

export interface PhaseStats {
  phase: Phase;
  moves: number;
  accuracy: number | null;
  mistakes: number;
}

export interface GameReview {
  stats: Record<Color, SideStats>;
  /** Plies still waiting for the coach's analysis. */
  pending: number;
  /** The user's inaccuracies, mistakes and blunders, in game order. */
  moments: KeyMoment[];
  /** The user's accuracy by game phase (phases with no moves are left out). */
  phases: PhaseStats[];
  /** White-POV eval before the first move and after each ply (null = not analysed yet). */
  evals: (number | null)[];
  /** Plain-English summary lines. */
  summary: string[];
}

const BAD: Classification[] = ['Inaccuracy', 'Mistake', 'Blunder'];
const sign = (c: Color) => (c === 'w' ? 1 : -1);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function emptyCounts(): Record<Classification, number> {
  return { Best: 0, Good: 0, Inaccuracy: 0, Mistake: 0, Blunder: 0 };
}

const PHASE_NAMES: Record<Phase, string> = { opening: 'opening', middlegame: 'middlegame', endgame: 'endgame' };

export function buildGameReview(plies: PlyRecord[], userColor: Color): GameReview {
  const acc: Record<Color, number[]> = { w: [], b: [] };
  const loss: Record<Color, number[]> = { w: [], b: [] };
  const counts: Record<Color, Record<Classification, number>> = { w: emptyCounts(), b: emptyCounts() };
  const moves: Record<Color, number> = { w: 0, b: 0 };
  const phaseAcc = new Map<Phase, { acc: number[]; mistakes: number }>();
  const moments: KeyMoment[] = [];
  let pending = 0;

  plies.forEach((p, i) => {
    moves[p.color]++;
    const r = p.review;
    if (!r) {
      pending++;
      return;
    }
    const s = sign(p.color);
    const winBefore = winPercent(r.evalBefore * s);
    const winAfter = winPercent(r.evalAfter * s);
    const a = moveAccuracy(winBefore, winAfter);
    acc[p.color].push(a);
    loss[p.color].push(r.cpLoss);
    counts[p.color][r.classification]++;

    if (p.color !== userColor) return;
    const phase = gamePhase(new Chess(p.fenBefore));
    const ph = phaseAcc.get(phase) ?? { acc: [], mistakes: 0 };
    ph.acc.push(a);
    if (BAD.includes(r.classification)) ph.mistakes++;
    phaseAcc.set(phase, ph);

    if (!BAD.includes(r.classification)) return;
    const prev = i > 0 ? plies[i - 1] : null;
    const prevBad = prev?.review && (prev.review.classification === 'Mistake' || prev.review.classification === 'Blunder');
    const e = r.explanation;
    moments.push({
      index: i,
      ply: p,
      classification: r.classification,
      winDrop: Math.max(0, winBefore - winAfter),
      missedChance: !!prevBad,
      turningPoint: false,
      bestSan: r.bestSan,
      bestEval: formatEval(r.evalBefore),
      reason: e.details[0] ?? e.headline,
      tip: e.tip,
    });
  });

  // The turning point: the user's costliest move, if it really changed the game.
  const worst = moments.reduce<KeyMoment | null>((w, m) => (!w || m.winDrop > w.winDrop ? m : w), null);
  if (worst && worst.winDrop >= 20) worst.turningPoint = true;

  const evals: (number | null)[] = [plies[0]?.review?.evalBefore ?? (plies.length ? null : 0)];
  for (const p of plies) evals.push(p.review ? p.review.evalAfter : null);

  const stats = (c: Color): SideStats => ({
    moves: moves[c],
    counts: counts[c],
    accuracy: mean(acc[c]),
    acpl: mean(loss[c]),
  });
  const phases: PhaseStats[] = (['opening', 'middlegame', 'endgame'] as Phase[])
    .filter((ph) => phaseAcc.has(ph))
    .map((ph) => ({ phase: ph, moves: phaseAcc.get(ph)!.acc.length, accuracy: mean(phaseAcc.get(ph)!.acc), mistakes: phaseAcc.get(ph)!.mistakes }));

  return {
    stats: { w: stats('w'), b: stats('b') },
    pending,
    moments,
    phases,
    evals,
    summary: summarize(counts[userColor], moments, phases, moves[userColor]),
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function summarize(c: Record<Classification, number>, moments: KeyMoment[], phases: PhaseStats[], moves: number): string[] {
  const lines: string[] = [];
  if (moves === 0) return ['No moves to review yet.'];

  const parts = [
    c.Blunder && plural(c.Blunder, 'blunder'),
    c.Mistake && plural(c.Mistake, 'mistake'),
    c.Inaccuracy && `${c.Inaccuracy} ${c.Inaccuracy === 1 ? 'inaccuracy' : 'inaccuracies'}`,
  ].filter(Boolean) as string[];
  if (parts.length === 0) {
    lines.push('No inaccuracies, mistakes or blunders. A clean game!');
  } else {
    const list = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
    lines.push(`You made ${list}.`);
  }

  const turning = moments.find((m) => m.turningPoint);
  if (turning) {
    lines.push(
      `The turning point was ${label(turning.ply)}: it cost about ${Math.round(turning.winDrop)}% of your winning chances.` +
        (turning.bestSan ? ` ${turning.bestSan} was the move.` : ''),
    );
  }
  const missed = moments.filter((m) => m.missedChance).length;
  if (missed) lines.push(`You missed ${plural(missed, 'chance')} to punish the coach's mistakes.`);

  const rated = phases.filter((p) => p.accuracy !== null && p.moves >= 3);
  if (rated.length >= 2) {
    const best = rated.reduce((a, b) => (b.accuracy! > a.accuracy! ? b : a));
    const worst = rated.reduce((a, b) => (b.accuracy! < a.accuracy! ? b : a));
    if (best !== worst) {
      lines.push(`Your strongest phase was the ${PHASE_NAMES[best.phase]} (${Math.round(best.accuracy!)}%); the ${PHASE_NAMES[worst.phase]} is where to improve (${Math.round(worst.accuracy!)}%).`);
    }
  }
  return lines;
}

export function label(p: PlyRecord): string {
  const n = p.fenBefore.split(' ')[5];
  return p.color === 'w' ? `${n}. ${p.san}` : `${n}… ${p.san}`;
}
