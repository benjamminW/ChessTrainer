/**
 * Concrete, checkable facts about positions and moves, derived with chess.js.
 * Used by the rule-based explanation provider and by the bot's mistake generator.
 */
import { Chess, SQUARES, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { parseUci } from '../game/session';

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const NAME: Record<PieceSymbol, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

export interface PieceAt {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export function piecesOf(chess: Chess, color: Color): PieceAt[] {
  const out: PieceAt[] = [];
  for (const sq of SQUARES) {
    const p = chess.get(sq);
    if (p && p.color === color) out.push({ square: sq, type: p.type, color: p.color });
  }
  return out;
}

/**
 * A piece "hangs" if the opponent attacks it and either nothing defends it or the
 * cheapest attacker is worth less than it (so taking wins material even if recaptured).
 * Ignores pins and x-rays — good enough for coaching sentences.
 */
export function isHanging(chess: Chess, square: Square): boolean {
  const piece = chess.get(square);
  if (!piece || piece.type === 'k') return false;
  const attackers = chess.attackers(square, other(piece.color));
  if (attackers.length === 0) return false;
  const defenders = chess.attackers(square, piece.color);
  if (defenders.length === 0) return true;
  const cheapest = Math.min(...attackers.map((s) => VALUE[chess.get(s)!.type] || 100));
  return cheapest < VALUE[piece.type];
}

export function hangingPieces(chess: Chess, color: Color, minValue = 1): PieceAt[] {
  return piecesOf(chess, color).filter((p) => VALUE[p.type] >= minValue && isHanging(chess, p.square));
}

/** Material balance in pawns, White minus Black. */
export function material(chess: Chess): number {
  let m = 0;
  for (const sq of SQUARES) {
    const p = chess.get(sq);
    if (p) m += (p.color === 'w' ? 1 : -1) * VALUE[p.type];
  }
  return m;
}

/** Material balance (White POV) after playing up to `plies` moves of a UCI line from `fen`. */
export function materialAfterLine(fen: string, uciLine: string[], plies: number): number {
  const chess = new Chess(fen);
  for (const uci of uciLine.slice(0, plies)) {
    try {
      chess.move(parseUci(uci));
    } catch {
      break;
    }
  }
  return material(chess);
}

/** Plays a UCI move on a copy of the position. Returns null if illegal. */
export function tryMove(fen: string, uci: string): { chess: Chess; move: Move } | null {
  const chess = new Chess(fen);
  try {
    const move = chess.move(parseUci(uci));
    return { chess, move };
  } catch {
    return null;
  }
}

/** UCI line → SAN list (stops at the first illegal move). */
export function lineToSan(fen: string, uciLine: string[], max = Infinity): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of uciLine.slice(0, max)) {
    try {
      out.push(chess.move(parseUci(uci)).san);
    } catch {
      break;
    }
  }
  return out;
}

/** Opponent pieces (value ≥ minValue, or the king) that the piece on `from` attacks. */
export function piecesAttackedFrom(chess: Chess, from: Square, minValue = 1): PieceAt[] {
  const attacker = chess.get(from);
  if (!attacker) return [];
  return piecesOf(chess, other(attacker.color)).filter(
    (p) => (p.type === 'k' || VALUE[p.type] >= minValue) && chess.attackers(p.square, attacker.color).includes(from),
  );
}

/** Pieces forked by the piece that just moved to `to`: ≥2 targets that are the king or worth ≥ 3. */
export function forkTargets(chess: Chess, to: Square): PieceAt[] {
  const mover = chess.get(to);
  if (!mover) return [];
  const targets = piecesAttackedFrom(chess, to, 3).filter(
    (t) => t.type === 'k' || VALUE[t.type] > VALUE[mover.type] || !chess.attackers(t.square, t.color).length,
  );
  return targets.length >= 2 ? targets : [];
}

export function castlingRights(fen: string, color: Color): { k: boolean; q: boolean } {
  const c = new Chess(fen).getCastlingRights(color);
  return { k: c.k, q: c.q };
}

const START_SQUARES: Record<Color, Partial<Record<PieceSymbol, string[]>>> = {
  w: { n: ['b1', 'g1'], b: ['c1', 'f1'] },
  b: { n: ['b8', 'g8'], b: ['c8', 'f8'] },
};

export function isDevelopingMove(m: Move): boolean {
  return START_SQUARES[m.color][m.piece]?.includes(m.from) ?? false;
}

const CENTER = new Set(['c4', 'd4', 'e4', 'f4', 'c5', 'd5', 'e5', 'f5']);
export function isCenterPawnMove(m: Move): boolean {
  return m.piece === 'p' && !m.captured && CENTER.has(m.to) && (m.to[0] === 'd' || m.to[0] === 'e' || m.to[0] === 'c');
}

/** "a knight", "two pawns" etc. for a material amount in pawns. */
export function materialWords(pawns: number): string {
  const n = Math.round(Math.abs(pawns));
  if (n >= 9) return 'about a queen';
  if (n >= 5) return 'about a rook';
  if (n >= 3) return 'about a minor piece';
  if (n === 2) return 'two pawns';
  return 'a pawn';
}
