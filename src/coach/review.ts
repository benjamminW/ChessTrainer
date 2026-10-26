import { Chess } from 'chess.js';
import { MATE_CP } from '../config/coach';
import type { Analysis } from '../engine/uci';
import type { Classification, Color, PlyRecord } from '../types';
import { classify, cpLoss } from './classify';
import { lineToSan } from './facts';

export interface ReviewNumbers {
  classification: Classification;
  cpLoss: number;
  /** Mover-POV scores used for the loss computation. */
  bestCp: number;
  playedCp: number;
  /** White-POV evals for display. */
  evalBefore: number;
  evalAfter: number;
  bestUci: string | null;
  bestSan: string | null;
  isEngineBest: boolean;
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
 * Scores a played move against the coach's analysis of the position before it
 * (`before`) and after it (`after`, null if the game ended).
 *
 * The played move's score comes from the "before" MultiPV lines when the move is
 * among them (same search, directly comparable); otherwise from the "after" search.
 */
export function scoreMove(ply: PlyRecord, before: Analysis, after: Analysis | null): ReviewNumbers {
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

  const loss = cpLoss(bestCp, playedCp);
  const afterMoverCp = terminal ?? (afterTop ? -afterTop.cp : playedCp);
  return {
    classification: classify(loss, isEngineBest),
    cpLoss: loss,
    bestCp,
    playedCp,
    evalBefore: bestCp * sign(mover),
    evalAfter: afterMoverCp * sign(mover),
    bestUci: bestUci ?? null,
    bestSan: bestUci ? (lineToSan(ply.fenBefore, [bestUci])[0] ?? null) : null,
    isEngineBest,
  };
}
