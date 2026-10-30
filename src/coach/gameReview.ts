/**
 * Post-game review: accuracy, move-quality counts, the game's turning point and
 * the user's key mistakes, built from the per-move reviews the coach already stored.
 */
import { Chess } from 'chess.js';
import type { Classification, Color, PlyRecord } from '../types';
import { BAD_CLASSES, CLASS_ORDER, ERROR_CLASSES } from './classes';
import { ESTIMATE_CONFIG, estimateRating, phaseGrade, type PhaseGrade, type RatingEstimate, type TimeClass } from './estimate';
import { gamePhase, type Phase } from './facts';
import { formatEval } from './format';
import { boardFacts } from './moveClass';
import { countMoves, isEvenRecapture, winPercent, type RatedMove } from './ratingMoves';

export { winPercent };

/** All classes, best to worst (for count tables). */
export const CLASSES: Classification[] = CLASS_ORDER;

/** Accuracy of one move (0–100) from the mover's win% before and after it (lichess's formula). */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, winBefore - winAfter)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

/**
 * Game accuracy for each side, following Lichess's published method (lila, AccuracyPercent.gameAccuracy):
 * the average of (1) a mean of the move accuracies weighted by how volatile the game was around each
 * move, so critical moments count more, and (2) their harmonic mean, so a few bad moves pull the
 * score down hard instead of being averaged away by many easy ones.
 *
 * `winWhite` is White's win% at the start and after each ply (n + 1 values); `firstMover` is the
 * color that made the first ply. Returns null for a side with no moves.
 */
export function gameAccuracy(winWhite: number[], firstMover: Color): Record<Color, number | null> {
  const n = winWhite.length - 1;
  const out: Record<Color, number | null> = { w: null, b: null };
  if (n < 1) return out;
  const size = Math.max(2, Math.min(8, Math.floor(n / 10)));
  const lead = Math.max(0, Math.min(size, winWhite.length) - 2);
  const windows: number[][] = [...Array(lead).fill(winWhite.slice(0, size))];
  for (let i = 0; i + size <= winWhite.length; i++) windows.push(winWhite.slice(i, i + size));
  const weights = windows.map((xs) => Math.max(0.5, Math.min(12, stdDev(xs))));
  const per: Record<Color, { acc: number; w: number }[]> = { w: [], b: [] };
  for (let i = 0; i < n; i++) {
    const color: Color = (i % 2 === 0) === (firstMover === 'w') ? 'w' : 'b';
    const [before, after] = color === 'w' ? [winWhite[i], winWhite[i + 1]] : [100 - winWhite[i], 100 - winWhite[i + 1]];
    per[color].push({ acc: moveAccuracy(before, after), w: weights[i] ?? 0.5 });
  }
  for (const c of ['w', 'b'] as Color[]) {
    const xs = per[c];
    if (!xs.length) continue;
    const weighted = xs.reduce((a, x) => a + x.acc * x.w, 0) / xs.reduce((a, x) => a + x.w, 0);
    // A 0% move would make the harmonic mean 0; count it as 1% (Lichess's mean has the same blow-up).
    const harmonic = xs.length / xs.reduce((a, x) => a + 1 / Math.max(1, x.acc), 0);
    out[c] = (weighted + harmonic) / 2;
  }
  return out;
}

function stdDev(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

export interface SideStats {
  moves: number;
  counts: Record<Classification, number>;
  /** Game accuracy (Lichess's method, see gameAccuracy), or null with no reviewed moves. */
  accuracy: number | null;
  /** Average centipawn loss, or null with no reviewed moves. */
  acpl: number | null;
  /** This app's estimated rating range from the counted moves (see coach/estimate.ts). */
  rating: RatingEstimate | null;
  /** Average win% drop over the counted moves, or null with none. */
  countedAvgDrop: number | null;
  /** Per-phase stats and grades for this side (phases that never happened are left out). */
  phases: PhaseStats[];
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
  /** Average centipawn loss in this phase. */
  acpl: number | null;
  /** Average drop in win chance per move, percentage points. */
  avgDrop: number | null;
  grade: PhaseGrade | null;
  mistakes: number;
  /** Moves behind `avgDrop` and `grade` (counted moves only). */
  counted: number;
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
  /** The game was reviewed before the current rating method, so its estimate was recalculated. */
  ratingRecalculated: boolean;
}

/** What the rating estimate needs to know about the game beyond its moves. */
export interface ReviewContext {
  timeClass?: TimeClass | null;
  /** Ratings from the game header (none for games against the coach). */
  known?: Partial<Record<Color, number | null>>;
  /** When the game was analyzed or played (ISO date), to flag estimates made the old way. */
  analyzedAt?: string | null;
}

const BAD = BAD_CLASSES;
const sign = (c: Color) => (c === 'w' ? 1 : -1);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function emptyCounts(): Record<Classification, number> {
  return Object.fromEntries(CLASS_ORDER.map((c) => [c, 0])) as Record<Classification, number>;
}

type PhaseAcc = { acc: number[]; loss: number[]; drop: number[]; mistakes: number };

function phaseList(m: Map<Phase, PhaseAcc>): PhaseStats[] {
  return (['opening', 'middlegame', 'endgame'] as Phase[])
    .filter((ph) => m.has(ph))
    .map((ph) => {
      const x = m.get(ph)!;
      const avgDrop = mean(x.drop);
      return { phase: ph, moves: x.acc.length, accuracy: mean(x.acc), acpl: mean(x.loss), avgDrop, grade: avgDrop === null ? null : phaseGrade(avgDrop), mistakes: x.mistakes, counted: x.drop.length };
    });
}

const PHASE_NAMES: Record<Phase, string> = { opening: 'opening', middlegame: 'middlegame', endgame: 'endgame' };

/** The rating inputs for each reviewed ply (in order), with the index of the ply. */
function ratedMoves(plies: PlyRecord[]): { index: number; move: RatedMove }[] {
  const out: { index: number; move: RatedMove }[] = [];
  plies.forEach((p, i) => {
    const r = p.review;
    if (!r) return;
    const s = sign(p.color);
    const bestCp = r.evalBefore * s;
    const prev = plies[i - 1] ?? null;
    out.push({
      index: i,
      move: {
        color: p.color,
        winBefore: winPercent(bestCp),
        winAfter: winPercent(r.evalAfter * s),
        inBook: r.classification === 'Book',
        legalMoves: boardFacts(p, prev).legalMoves,
        gapWin: r.gap === undefined || r.gap === null ? null : winPercent(bestCp) - winPercent(bestCp - r.gap),
        evenRecapture: isEvenRecapture(p.fenBefore, p.uci, prev),
      },
    });
  });
  return out;
}

export function buildGameReview(plies: PlyRecord[], userColor: Color, ctx: ReviewContext = {}): GameReview {
  const rated = ratedMoves(plies);
  const counting = countMoves(rated.map((r) => r.move));
  /** Ply index → counted (true) or left out of the rating and phase grades (false). */
  const countedAt = new Map(rated.map((r, k) => [r.index, counting.reasons[k] === null]));
  const depthOf = (c: Color) => {
    const ds = plies.filter((p, i) => p.color === c && countedAt.get(i)).map((p) => p.review?.depth).filter((d): d is number => d !== undefined);
    return ds.length ? Math.min(...ds) : null;
  };
  const acc: Record<Color, number[]> = { w: [], b: [] };
  const loss: Record<Color, number[]> = { w: [], b: [] };
  const counts: Record<Color, Record<Classification, number>> = { w: emptyCounts(), b: emptyCounts() };
  const moves: Record<Color, number> = { w: 0, b: 0 };
  const drops: Record<Color, number[]> = { w: [], b: [] };
  const phaseBy: Record<Color, Map<Phase, PhaseAcc>> = { w: new Map(), b: new Map() };
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
    const drop = Math.max(0, winBefore - winAfter);
    const counted = countedAt.get(i) === true;
    acc[p.color].push(a);
    loss[p.color].push(r.cpLoss);
    if (counted) drops[p.color].push(drop);
    counts[p.color][r.classification]++;

    const phase = gamePhase(new Chess(p.fenBefore));
    const ph = phaseBy[p.color].get(phase) ?? { acc: [], loss: [], drop: [], mistakes: 0 };
    ph.acc.push(a);
    ph.loss.push(r.cpLoss);
    // Phase grades use the same counted moves as the rating (no book, forced or decided moves).
    if (counted) ph.drop.push(drop);
    if (BAD.includes(r.classification)) ph.mistakes++;
    phaseBy[p.color].set(phase, ph);

    if (p.color !== userColor) return;

    if (!BAD.includes(r.classification)) return;
    const prev = i > 0 ? plies[i - 1] : null;
    const prevBad = prev?.review && ERROR_CLASSES.includes(prev.review.classification);
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

  // Game accuracy needs every position's eval; while some moves are still being analyzed, show the plain mean.
  const allReviewed = plies.length > 0 && plies.every((p) => p.review);
  const winWhite = allReviewed ? [winPercent(plies[0].review!.evalBefore), ...plies.map((p) => winPercent(p.review!.evalAfter))] : [];
  const gameAcc = allReviewed ? gameAccuracy(winWhite, plies[0].color) : null;
  const stats = (c: Color): SideStats => ({
    moves: moves[c],
    counts: counts[c],
    accuracy: gameAcc ? gameAcc[c] : mean(acc[c]),
    acpl: mean(loss[c]),
    rating: estimateRating(counting[c], { timeClass: ctx.timeClass, known: ctx.known?.[c] ?? null, depth: depthOf(c) }),
    countedAvgDrop: mean(drops[c]),
    phases: phaseList(phaseBy[c]),
  });
  const phases = phaseList(phaseBy[userColor]);

  return {
    stats: { w: stats('w'), b: stats('b') },
    pending,
    moments,
    phases,
    evals,
    summary: summarize(counts[userColor], moments, phases, moves[userColor]),
    ratingRecalculated: !!ctx.analyzedAt && Date.parse(ctx.analyzedAt) < Date.parse(ESTIMATE_CONFIG.methodSince),
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
    c.Miss && plural(c.Miss, 'missed win'),
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
