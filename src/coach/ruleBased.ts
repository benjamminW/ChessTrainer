import { Chess, type Color, type Square } from 'chess.js';
import { COACH_CONFIG } from '../config/coach';
import type { Analysis } from '../engine/uci';
import type { Explanation, PlyRecord } from '../types';
import { mateIn } from './classify';
import {
  NAME, VALUE, castlingRights, forkTargets, hangingPieces, isCenterPawnMove, isDevelopingMove,
  isHanging, lineToSan, materialAfterLine, materialWords, other, piecesAttackedFrom, tryMove,
  type PieceAt,
} from './facts';
import { formatEval } from './format';
import type { ExplanationProvider, MoveContext } from './provider';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "your" for the user's pieces, "the" for the bot's. */
function whose(color: Color, userColor: Color): string {
  return color === userColor ? 'your' : 'the';
}

function listPieces(ps: PieceAt[], userColor: Color): string {
  const names = ps.map((p) => `${whose(p.color, userColor)} ${NAME[p.type]}${p.type === 'k' ? '' : ` on ${p.square}`}`);
  return names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function joinParts(parts: string[]): string {
  if (parts.length === 0) return '';
  const [a, b] = parts;
  return cap(b ? `${a} and ${lower(b)}` : a) + '.';
}

/**
 * One-sentence idea of a move: develops, captures, attacks X, defends Y, threatens mate…
 * Exported for tests and reuse (e.g. describing the engine's better move).
 */
export function describeIdea(
  fenBefore: string,
  uci: string,
  userColor: Color,
  prev: PlyRecord | null = null,
  after: Analysis | null = null,
): string {
  const r = tryMove(fenBefore, uci);
  if (!r) return '';
  const { chess, move: m } = r;
  const before = new Chess(fenBefore);
  const parts: string[] = [];

  if (chess.isCheckmate()) return 'Delivers checkmate.';
  if (m.isKingsideCastle() || m.isQueensideCastle()) parts.push('Castles, tucking the king away and connecting the rooks');
  if (m.promotion) parts.push(`Promotes to a ${NAME[m.promotion]}`);
  if (m.captured) {
    const recapture = prev && prev.uci.slice(2, 4) === m.to && prev.san.includes('x');
    parts.push(recapture ? `Recaptures on ${m.to}` : `Captures ${whose(other(m.color), userColor)} ${NAME[m.captured]} on ${m.to}`);
  }
  if (!m.captured && isDevelopingMove(m)) parts.push(`Develops the ${NAME[m.piece]}`);
  if (isCenterPawnMove(m)) parts.push('Claims space in the center');
  if (chess.isCheck()) parts.push('Gives check');

  const fork = forkTargets(chess, m.to);
  if (fork.length >= 2) {
    parts.push(`Forks ${listPieces(fork, userColor)}`);
  } else {
    const targets = piecesAttackedFrom(chess, m.to, 1).filter(
      (t) => t.type !== 'k' && (VALUE[t.type] > VALUE[m.piece] || isHanging(chess, t.square)),
    );
    // Only mention attacks that are new with this move.
    const fresh = targets.filter((t) => !before.attackers(t.square, m.color).includes(m.from));
    const t = fresh.sort((a, b) => VALUE[b.type] - VALUE[a.type])[0];
    if (t) parts.push(`Attacks ${whose(t.color, userColor)} ${NAME[t.type]} on ${t.square}`);
  }

  // Defence: was something of ours hanging that no longer is?
  const hangBefore = hangingPieces(before, m.color, 1);
  const movedWasHanging = hangBefore.some((h) => h.square === m.from);
  if (movedWasHanging && !m.captured && !isHanging(chess, m.to)) {
    parts.push(`Moves the ${NAME[m.piece]} out of danger`);
  } else {
    const saved = hangBefore.find((h) => h.square !== m.from && !isHanging(chess, h.square) && chess.get(h.square)?.color === m.color);
    if (saved) parts.push(`Defends ${whose(m.color, userColor)} ${NAME[saved.type]} on ${saved.square}`);
  }

  // Mate threat: after the move, the opponent (to move) is getting mated by force.
  const afterMate = after?.lines[0]?.mate;
  if (!chess.isCheck() && afterMate !== undefined && afterMate !== null && afterMate < 0) {
    parts.push('Threatens mate');
  }

  if (parts.length === 0) {
    parts.push(m.piece === 'p' ? `Pushes the ${m.to[0]}-pawn to ${m.to}` : `Repositions the ${NAME[m.piece]} to ${m.to}`);
  }
  return joinParts(parts);
}

/** Problems created by the played move, phrased about the mover's pieces. */
function weaknessFacts(ctx: MoveContext, pvAfter: string[]): string[] {
  const { ply, after, userColor } = ctx;
  const mover = ply.color;
  const facts: string[] = [];
  const beforeChess = new Chess(ply.fenBefore);
  const afterChess = new Chess(ply.fenAfter);
  const from = ply.uci.slice(0, 2) as Square;
  const to = ply.uci.slice(2, 4) as Square;
  const own = whose(mover, userColor);

  const oppMate = after?.lines[0]?.mate;
  if (oppMate !== undefined && oppMate !== null && oppMate > 0) {
    facts.push(`Allows mate in ${oppMate}${pvAfter[0] ? `, starting with ${pvAfter[0]}` : ''}.`);
  }

  // Newly hanging pieces (the moved piece maps from → to).
  const hungBefore = new Set(hangingPieces(beforeChess, mover).map((p) => (p.square === from ? to : p.square)));
  const newlyHung = hangingPieces(afterChess, mover)
    .filter((p) => !hungBefore.has(p.square))
    .sort((a, b) => VALUE[b.type] - VALUE[a.type]);
  const explained = new Set<string>();
  for (const p of newlyHung.slice(0, 2)) {
    const defended = afterChess.attackers(p.square, mover).length > 0;
    const piece = `${own} ${NAME[p.type]} on ${p.square}`;
    if (p.square === to) {
      facts.push(defended
        ? `Puts ${piece} where a cheaper piece can win it.`
        : `Leaves ${piece} undefended, so it can simply be taken.`);
    } else {
      facts.push(`Stops protecting ${piece}, which can now be taken.`);
    }
    explained.add(p.square);
  }

  // The opponent's best reply: a fork or a capture?
  const replyUci = after?.lines[0]?.pv[0];
  if (replyUci && !(oppMate && oppMate > 0)) {
    const r = tryMove(ply.fenAfter, replyUci);
    if (r) {
      const fork = forkTargets(r.chess, r.move.to);
      if (fork.length >= 2) {
        facts.push(`Allows a fork: ${r.move.san} hits ${listPieces(fork, userColor)}.`);
      } else if (r.move.captured && !explained.has(r.move.to) && VALUE[r.move.captured] >= 1) {
        facts.push(`Allows ${r.move.san}, capturing ${own} ${NAME[r.move.captured]}.`);
      }
    }
  }

  // Castling rights lost without castling.
  if (!/^O-O/.test(ply.san)) {
    const b = castlingRights(ply.fenBefore, mover);
    const a = castlingRights(ply.fenAfter, mover);
    const lostK = b.k && !a.k;
    const lostQ = b.q && !a.q;
    if (lostK || lostQ) {
      const side = lostK && lostQ ? '' : lostK ? ' kingside' : ' queenside';
      facts.push(`Gives up the right to castle${side}.`);
    }
  }
  return facts;
}

/** What the engine's better move would have achieved. */
function missedFacts(ctx: MoveContext, bestLine: string[], alreadyExplained: boolean): string[] {
  const { ply, numbers, userColor } = ctx;
  const facts: string[] = [];
  const bestUci = numbers.bestUci;
  if (!bestUci || !numbers.bestSan) return facts;
  const bestSan = numbers.bestSan;

  const mate = mateIn(numbers.bestCp);
  const playedMate = mateIn(numbers.playedCp);
  if (mate !== null && mate > 0 && (playedMate === null || playedMate <= 0 || playedMate > mate)) {
    facts.push(`You had mate in ${mate}, starting with ${bestSan}.`);
    return facts;
  }

  const r = tryMove(ply.fenBefore, bestUci);
  if (r) {
    const before = new Chess(ply.fenBefore);
    if (r.move.captured && isHanging(before, r.move.to)) {
      facts.push(`Missed ${bestSan}: the ${NAME[r.move.captured]} on ${r.move.to} was there for the taking.`);
    } else {
      const fork = forkTargets(r.chess, r.move.to);
      if (fork.length >= 2) facts.push(`Missed ${bestSan}, forking ${listPieces(fork, userColor)}.`);
    }
  }

  // Material comparison over the next few moves of each line.
  const s = ply.color === 'w' ? 1 : -1;
  const plies = 6;
  const matBest = materialAfterLine(ply.fenBefore, bestLine, plies) * s;
  const pvAfter = ctx.after?.lines[0]?.pv ?? [];
  const matPlayed = materialAfterLine(ply.fenBefore, [ply.uci, ...pvAfter], plies) * s;
  const diff = matBest - matPlayed;
  if (diff >= 1 && facts.length === 0 && !alreadyExplained) {
    facts.push(`Over the next few moves, ${bestSan} comes out ${materialWords(diff)} ahead of what you played.`);
  }

  const idea = describeIdea(ply.fenBefore, bestUci, userColor, ctx.prev, null);
  if (idea) facts.push(`${bestSan}: ${lower(idea)}`);
  return facts;
}

export class RuleBasedProvider implements ExplanationProvider {
  readonly id = 'rule-based';

  async explain(ctx: MoveContext): Promise<Explanation> {
    const { ply, numbers, after, before, userColor, prev } = ctx;
    const n = COACH_CONFIG.pvLength;
    const pvSan = after?.lines[0] ? lineToSan(ply.fenAfter, after.lines[0].pv, n) : [];
    const bestLineUci = before.lines[0]?.pv ?? [];
    const idea = describeIdea(ply.fenBefore, ply.uci, userColor, prev, after);
    const cls = numbers.classification;
    const bad = cls === 'Inaccuracy' || cls === 'Mistake' || cls === 'Blunder';

    if (ply.by === 'bot') {
      const details: string[] = [];
      if (bad) {
        const w = weaknessFacts(ctx, pvSan);
        details.push(...(w.length ? w : ['This gives you a chance to take over — look for the strongest reply.']));
      }
      return { headline: idea, details, pvSan };
    }

    if (!bad) {
      const headline = cls === 'Best' ? 'Best move.' : 'Good move.';
      const details = idea ? [idea] : [];
      if (cls === 'Good' && numbers.bestSan && !numbers.isEngineBest) {
        details.push(`The engine slightly preferred ${numbers.bestSan} (${formatEval(numbers.evalBefore)}).`);
      }
      return { headline, details, pvSan };
    }

    const headline = numbers.bestSan
      ? `${cls}. ${numbers.bestSan} was better (${formatEval(numbers.evalBefore)}).`
      : `${cls}.`;
    const weak = weaknessFacts(ctx, pvSan);
    const details = [...weak, ...missedFacts(ctx, bestLineUci, weak.length > 0)];
    return {
      headline,
      details,
      pvSan,
      betterLineSan: lineToSan(ply.fenBefore, bestLineUci, n),
    };
  }
}
