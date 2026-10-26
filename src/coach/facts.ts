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

// ---------------------------------------------------------------- geometry

const fileOf = (sq: Square) => sq.charCodeAt(0) - 97;
const rankOf = (sq: Square) => Number(sq[1]) - 1;
const toSquare = (f: number, r: number): Square | null =>
  f >= 0 && f < 8 && r >= 0 && r < 8 ? (`${String.fromCharCode(97 + f)}${r + 1}` as Square) : null;

const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export interface Pin {
  pinner: PieceAt;
  pinned: PieceAt;
  /** The piece behind the pinned one (king = absolute pin). */
  target: PieceAt;
}

/** Pins created by `byColor`'s bishops, rooks and queens against the other side. */
export function findPins(chess: Chess, byColor: Color): Pin[] {
  const pins: Pin[] = [];
  for (const p of piecesOf(chess, byColor)) {
    const dirs = p.type === 'b' ? BISHOP_DIRS : p.type === 'r' ? ROOK_DIRS : p.type === 'q' ? [...ROOK_DIRS, ...BISHOP_DIRS] : [];
    for (const [df, dr] of dirs) {
      let first: PieceAt | null = null;
      for (let i = 1; i < 8; i++) {
        const sq = toSquare(fileOf(p.square) + df * i, rankOf(p.square) + dr * i);
        if (!sq) break;
        const occ = chess.get(sq);
        if (!occ) continue;
        if (occ.color === byColor) break;
        const here: PieceAt = { square: sq, type: occ.type, color: occ.color };
        if (!first) {
          if (occ.type === 'k') break; // that's a check, not a pin
          first = here;
          continue;
        }
        // Pinned to the king, or to a rook/queen worth more than the pinned piece that the
        // pinner could actually win (worth more than the pinner, or undefended).
        const winnable = VALUE[occ.type] > VALUE[p.type] || chess.attackers(sq, occ.color).length === 0;
        if (occ.type === 'k' || (VALUE[occ.type] >= 5 && VALUE[occ.type] > VALUE[first.type] && winnable)) {
          pins.push({ pinner: p, pinned: first, target: here });
        }
        break;
      }
    }
  }
  return pins;
}

// ---------------------------------------------------------------- mates and threats

/** Moves that checkmate immediately, for the side to move. */
export function matingMoves(fen: string): Move[] {
  const chess = new Chess(fen);
  return chess.moves({ verbose: true }).filter((m) => m.san.endsWith('#'));
}

/**
 * The same position with the other side to move ("what if I passed?"), used to
 * find the opponent's threats. Null if the side to move is in check (a pass would be illegal).
 */
export function threatFen(fen: string): string | null {
  const chess = new Chess(fen);
  if (chess.inCheck()) return null;
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    return new Chess(parts.join(' ')).fen();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- structure

export type Phase = 'opening' | 'middlegame' | 'endgame';

/** Non-pawn material (pawns = 0, minors = 3, rook = 5, queen = 9) of one side. */
export function pieceMaterial(chess: Chess, color: Color): number {
  return piecesOf(chess, color).reduce((s, p) => s + (p.type === 'p' ? 0 : VALUE[p.type]), 0);
}

export function gamePhase(chess: Chess): Phase {
  const total = pieceMaterial(chess, 'w') + pieceMaterial(chess, 'b');
  const queens = piecesOf(chess, 'w').concat(piecesOf(chess, 'b')).filter((p) => p.type === 'q').length;
  if (total <= 20 || (queens === 0 && total <= 26)) return 'endgame';
  const fullmove = Number(chess.fen().split(' ')[5]);
  return fullmove <= 10 ? 'opening' : 'middlegame';
}

const FILES = 'abcdefgh';

export interface PawnInfo {
  square: Square;
  isolated: boolean;
  doubled: boolean;
  passed: boolean;
}

/** Isolated / doubled / passed status of each pawn of `color`. */
export function pawnStructure(chess: Chess, color: Color): PawnInfo[] {
  const mine = piecesOf(chess, color).filter((p) => p.type === 'p');
  const theirs = piecesOf(chess, other(color)).filter((p) => p.type === 'p');
  const countOnFile = (ps: PieceAt[], f: number) => ps.filter((p) => fileOf(p.square) === f).length;
  const ahead = (from: Square, to: Square) => (color === 'w' ? rankOf(to) > rankOf(from) : rankOf(to) < rankOf(from));
  return mine.map((p) => {
    const f = fileOf(p.square);
    return {
      square: p.square,
      isolated: countOnFile(mine, f - 1) === 0 && countOnFile(mine, f + 1) === 0,
      doubled: countOnFile(mine, f) > 1,
      passed: !theirs.some((t) => Math.abs(fileOf(t.square) - f) <= 1 && ahead(p.square, t.square)),
    };
  });
}

/** Files with no pawns at all ('open') or none of `color`'s pawns but some of the opponent's ('half-open'). */
export function fileStatus(chess: Chess, color: Color): { open: string[]; halfOpen: string[] } {
  const pawns = (c: Color) => new Set(piecesOf(chess, c).filter((p) => p.type === 'p').map((p) => p.square[0]));
  const mine = pawns(color);
  const theirs = pawns(other(color));
  const open: string[] = [];
  const halfOpen: string[] = [];
  for (const f of FILES) {
    if (!mine.has(f) && !theirs.has(f)) open.push(f);
    else if (!mine.has(f)) halfOpen.push(f);
  }
  return { open, halfOpen };
}

/** True if the king of `color` sits on its back rank with every forward square blocked by its own pieces. */
export function backRankWeak(chess: Chess, color: Color): Square | null {
  const king = piecesOf(chess, color).find((p) => p.type === 'k');
  if (!king) return null;
  const back = color === 'w' ? 0 : 7;
  if (rankOf(king.square) !== back) return null;
  const fwd = color === 'w' ? 1 : -1;
  for (let df = -1; df <= 1; df++) {
    const sq = toSquare(fileOf(king.square) + df, back + fwd);
    if (!sq) continue;
    const occ = chess.get(sq);
    if (!occ || occ.color !== color) return null;
  }
  // Only a weakness if the opponent has a heavy piece to exploit it.
  const heavy = piecesOf(chess, other(color)).some((p) => p.type === 'r' || p.type === 'q');
  return heavy ? king.square : null;
}
