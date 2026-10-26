/**
 * Progressive hints for the side to move, built from the coach's analysis:
 *   1. the idea  ("Look for a move that attacks two pieces at once")
 *   2. the piece ("Move the knight on f3")
 *   3. the move  ("Nxe5 is the engine's choice (+1.20)…", with an arrow)
 */
import { Chess, type Square } from 'chess.js';
import type { Analysis } from '../engine/uci';
import type { Color } from '../types';
import { mateIn } from './classify';
import {
  NAME, VALUE, forkTargets, hangingPieces, isCenterPawnMove, isDevelopingMove, isHanging, lineToSan, matingMoves,
  pawnStructure, threatFen, tryMove,
} from './facts';
import { formatEval, formatLine } from './format';
import { describeIdea } from './ruleBased';

export const HINT_LEVELS = 3;

export interface HintStep {
  /** 1 = idea, 2 = piece, 3 = move. */
  level: number;
  text: string;
  /** Squares to circle on the board. */
  circles: string[];
  /** Arrow to draw (level 3 only). */
  arrow: { from: string; to: string } | null;
}

/** The level-1 nudge: what kind of move to look for, without naming it. */
export function hintIdea(fen: string, analysis: Analysis): { text: string; circles: string[] } {
  const top = analysis.lines[0];
  const best = top?.pv[0] ?? analysis.bestmove;
  const before = new Chess(fen);
  const me = before.turn();
  const r = best ? tryMove(fen, best) : null;
  if (!top || !r) return { text: 'No legal moves here.', circles: [] };
  const m = r.move;
  const after = r.chess;

  const mate = mateIn(top.cp);
  if (mate !== null && mate > 0) {
    return mate === 1
      ? { text: 'There is checkmate in one move. Look at every check.', circles: [] }
      : { text: `You have a forced mate in ${mate}. Start with a forcing move.`, circles: [] };
  }
  if (before.inCheck()) {
    return { text: "You're in check. Compare all three ways out: move the king, block, or capture the checking piece.", circles: [] };
  }

  // Winning a loose piece outranks everything below (it's often also the defence).
  if (m.captured && VALUE[m.captured] >= 3 && isHanging(before, m.to)) {
    return { text: "One of your opponent's pieces isn't properly defended. Look for a capture that wins material.", circles: [] };
  }

  const tf = threatFen(fen);
  const threat = tf ? matingMoves(tf)[0] : undefined;
  if (threat && !after.moves({ verbose: true }).some((x) => x.san.endsWith('#'))) {
    return { text: `Your opponent is threatening checkmate (${threat.san}). Defend against it first.`, circles: [threat.to] };
  }

  const threatened = hangingPieces(before, me, 3).sort((a, b) => VALUE[b.type] - VALUE[a.type]);
  const saves = threatened.find((t) => t.square === m.from || (after.get(t.square)?.color === me && !isHanging(after, t.square)));
  if (saves && !(m.captured && isHanging(before, m.to))) {
    return { text: `Your ${NAME[saves.type]} on ${saves.square} is under attack. Deal with that first.`, circles: [saves.square] };
  }
  if (forkTargets(after, m.to).length >= 2) {
    return { text: 'Look for a move that attacks two pieces at once (a fork).', circles: [] };
  }
  if (m.captured && isHanging(before, m.to)) {
    return { text: "One of your opponent's pieces isn't properly defended. Look for a capture that wins material.", circles: [] };
  }
  if (m.captured) return { text: 'Look at the captures. One of them works well here.', circles: [] };
  if (after.inCheck()) return { text: 'A forcing move works here: look at your checks.', circles: [] };
  if (m.isKingsideCastle() || m.isQueensideCastle()) return { text: "Your king isn't safe in the center yet. Think about king safety.", circles: [] };
  if (m.promotion) return { text: 'Your pawn is ready to promote.', circles: [] };
  if (m.piece === 'p' && pawnStructure(before, me).some((p) => p.square === m.from && p.passed)) {
    return { text: 'Passed pawns must be pushed. Look at your passed pawn.', circles: [] };
  }
  if (isDevelopingMove(m)) return { text: 'Bring another piece into the game. Development comes first.', circles: [] };
  if (isCenterPawnMove(m)) return { text: 'Fight for the center with a pawn.', circles: [] };

  const second = analysis.lines[1];
  if (second && top.cp - second.cp >= 150) {
    return { text: 'Careful: only one move keeps your position together here. What is your opponent threatening?', circles: [] };
  }
  return {
    text: m.piece === 'p'
      ? 'No immediate tactic. Think about a useful pawn move that improves your structure.'
      : 'No immediate tactic. Find your worst-placed piece and improve it.',
    circles: [],
  };
}

/** All three hint levels for the side to move in `fen`. Empty if the position has no analysis or no moves. */
export function buildHints(fen: string, analysis: Analysis, userColor: Color): HintStep[] {
  const top = analysis.lines[0];
  const best = top?.pv[0] ?? analysis.bestmove;
  if (!top || !best) return [];
  const r = tryMove(fen, best);
  if (!r) return [];
  const m = r.move;
  const idea = hintIdea(fen, analysis);
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
  const evalText = formatEval(top.cp * sign);
  const why = describeIdea(fen, best, userColor, null, null);
  const line = lineToSan(fen, top.pv, 5);

  return [
    { level: 1, text: idea.text, circles: idea.circles, arrow: null },
    { level: 2, text: `Move the ${NAME[m.piece]} on ${m.from}.`, circles: [m.from], arrow: null },
    {
      level: 3,
      text: `${m.san} is the engine's choice (${evalText}). ${why}` + (line.length > 1 ? ` Line: ${formatLine(fen, line)}` : ''),
      circles: [],
      arrow: { from: m.from as Square, to: m.to as Square },
    },
  ];
}
