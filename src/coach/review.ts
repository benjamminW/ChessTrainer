import { Chess } from 'chess.js';
import { MATE_CP } from '../config/coach';
import type { Analysis, SearchOptions } from '../engine/uci';
import type { Classification, Color, MoveReview, PlyRecord } from '../types';
import type { ExplanationProvider } from './provider';
import { cpLoss } from './classify';
import { lineToSan } from './facts';
import { CLASS_MODEL, boardFacts, brilliantCandidate, classifyMove, confirmBrilliant, findSacrifice, winDrop, type Sacrifice } from './moveClass';

export interface ReviewNumbers {
  classification: Classification;
  /** Centipawn loss (clamped), kept for ACPL. */
  cpLoss: number;
  /** Drop in the mover's winning chance, percentage points. */
  winDrop: number;
  /** Mover-POV scores used for the classification. */
  bestCp: number;
  playedCp: number;
  /** Second-best line, mover POV (null with a single line). */
  secondCp: number | null;
  /** White-POV evals for display. */
  evalBefore: number;
  evalAfter: number;
  bestUci: string | null;
  bestSan: string | null;
  isEngineBest: boolean;
  /** A sacrifice that could make this move Brilliant, pending confirmBrilliant(). */
  sacrifice: Sacrifice | null;
  model: number;
}

export interface ScoreOptions {
  /** The previous ply (to recognise recaptures). */
  prev?: PlyRecord | null;
  /** This move is still inside opening theory. */
  inBook?: boolean;
}

const sign = (c: Color) => (c === 'w' ? 1 : -1);

/** Mover-POV score of a finished game position reached by the mover's move, or null if not terminal. */
export function terminalScore(fenAfter: string): number | null {
  const chess = new Chess(fenAfter);
  if (chess.isCheckmate()) return MATE_CP;
  if (chess.isStalemate() || chess.isInsufficientMaterial() || chess.isDrawByFiftyMoves()) return 0;
  return null;
}

/**
 * Scores and classifies a played move against the coach's analysis of the position before it
 * (`before`) and after it (`after`, null if the game ended).
 *
 * The played move's score comes from the "before" MultiPV lines when the move is among them
 * (same search, directly comparable); otherwise from the "after" search. Brilliant needs one
 * more engine search, so it's applied afterwards by `upgradeBrilliant()`.
 */
export function scoreMove(ply: PlyRecord, before: Analysis, after: Analysis | null, o: ScoreOptions = {}): ReviewNumbers {
  const mover = ply.color;
  const top = before.lines[0];
  const bestCp = top?.cp ?? 0;
  const bestUci = top?.pv[0] ?? before.bestmove;
  const isEngineBest = bestUci === ply.uci;

  const terminal = terminalScore(ply.fenAfter);
  const fromLines = before.lines.find((l) => l.pv[0] === ply.uci)?.cp;
  const afterTop = after?.lines[0];
  let playedCp: number;
  if (terminal !== null) playedCp = terminal;
  else if (fromLines !== undefined) playedCp = fromLines;
  else if (afterTop) playedCp = -afterTop.cp;
  else playedCp = bestCp;
  // The engine's own top move can't be worse than "best".
  if (isEngineBest) playedCp = Math.max(playedCp, bestCp);

  const secondCp = before.lines[1]?.cp ?? null;
  const classification = classifyMove({
    bestCp,
    playedCp,
    secondCp,
    isEngineBest,
    inBook: !!o.inBook,
    ...boardFacts(ply, o.prev ?? null),
  });
  const found = classification === 'Best' || classification === 'Excellent' || classification === 'Great' ? findSacrifice(ply.fenBefore, ply.uci) : null;
  const sac = brilliantCandidate(classification, bestCp, playedCp, found) ? found : null;
  const afterMoverCp = terminal ?? (afterTop ? -afterTop.cp : playedCp);
  return {
    classification,
    cpLoss: cpLoss(bestCp, playedCp),
    winDrop: isEngineBest ? 0 : winDrop(bestCp, playedCp),
    bestCp,
    playedCp,
    secondCp,
    evalBefore: bestCp * sign(mover),
    evalAfter: afterMoverCp * sign(mover),
    bestUci: bestUci ?? null,
    bestSan: bestUci ? (lineToSan(ply.fenBefore, [bestUci])[0] ?? null) : null,
    isEngineBest,
    sacrifice: sac,
    model: CLASS_MODEL,
  };
}

/** Runs the Brilliant check for a candidate move and upgrades the class if the sacrifice holds. */
export async function upgradeBrilliant(
  n: ReviewNumbers,
  ply: PlyRecord,
  analyze: (fen: string, opts: SearchOptions) => Promise<Analysis>,
  owner?: string,
): Promise<ReviewNumbers> {
  if (!n.sacrifice) return n;
  try {
    if (await confirmBrilliant(ply.fenAfter, n.sacrifice, n.bestCp, analyze, owner)) return { ...n, classification: 'Brilliant' };
  } catch {
    /* a cancelled or failed check just means "not Brilliant" */
  }
  return n;
}

/**
 * Classifies and explains one move: scoring, the Brilliant check, and the coach's explanation.
 * Shared by Play reviews and Review mode so both use exactly the same rules.
 */
export async function reviewPly(
  ply: PlyRecord,
  prev: PlyRecord | null,
  before: Analysis,
  after: Analysis | null,
  o: {
    userColor: Color;
    inBook: boolean;
    provider: ExplanationProvider;
    analyze: (fen: string, opts: SearchOptions) => Promise<Analysis>;
    owner?: string;
    /** Whether to explain the move, decided after it's classified (default: always). */
    explain?: (cls: Classification) => boolean;
  },
): Promise<{ review: MoveReview; numbers: ReviewNumbers }> {
  let numbers = scoreMove(ply, before, after, { prev, inBook: o.inBook });
  numbers = await upgradeBrilliant(numbers, ply, o.analyze, o.owner);
  const explanation = o.explain && !o.explain(numbers.classification)
    ? { headline: '', details: [], pvSan: [] }
    : await o.provider.explain({ ply, prev, userColor: o.userColor, before, after, numbers });
  return {
    numbers,
    review: {
      classification: numbers.classification,
      cpLoss: numbers.cpLoss,
      evalBefore: numbers.evalBefore,
      evalAfter: numbers.evalAfter,
      bestUci: numbers.bestUci,
      bestSan: numbers.bestSan,
      explanation,
      model: numbers.model,
      winDrop: numbers.winDrop,
    },
  };
}
