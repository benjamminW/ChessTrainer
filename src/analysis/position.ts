/**
 * Pure helpers for the Best move tab: reading a pasted FEN or PGN, and turning a
 * hand-set-up board into a legal FEN.
 */
import { Chess, validateFen } from 'chess.js';
import type { Color } from '../types';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface LoadedPosition {
  startFen: string;
  /** Moves from startFen, in UCI. */
  moves: string[];
}

export type ParseResult = { ok: true; position: LoadedPosition } | { ok: false; error: string };

const PLACEMENT = /^([pnbrqkPNBRQK1-8]{1,8}\/){7}[pnbrqkPNBRQK1-8]{1,8}$/;

/** Reads a FEN (full, or just the piece placement), a PGN, or a plain move list like "1. e4 e5 2. Nf3". */
export function parsePosition(text: string): ParseResult {
  const t = text.trim();
  if (!t) return { ok: false, error: 'Paste a FEN or a PGN first.' };
  const first = t.split(/\s+/)[0];
  if (PLACEMENT.test(first)) {
    const fields = t.split(/\s+/);
    // Fill in whatever is missing: side to move, castling, en passant, clocks.
    const defaults = ['', 'w', '-', '-', '0', '1'];
    const fen = defaults.map((d, i) => fields[i] ?? d).join(' ');
    const v = validateFen(fen);
    if (!v.ok) return { ok: false, error: cleanError(v.error) };
    const setup = checkSetup(fen);
    if (setup) return { ok: false, error: setup };
    return { ok: true, position: { startFen: new Chess(fen).fen(), moves: [] } };
  }
  const chess = new Chess();
  try {
    chess.loadPgn(t);
  } catch (e) {
    return { ok: false, error: `That isn't a FEN or a PGN I can read (${cleanError(e instanceof Error ? e.message : String(e))}).` };
  }
  const history = chess.history({ verbose: true });
  const startFen = history[0]?.before ?? chess.fen();
  return { ok: true, position: { startFen, moves: history.map((m) => m.from + m.to + (m.promotion ?? '')) } };
}

function cleanError(e: string | undefined): string {
  return (e ?? 'invalid position').replace(/^Invalid FEN:\s*/i, '').replace(/\.$/, '');
}

/** Castling rights that the king and rook placement allows (both on their home squares). */
export function autoCastling(placement: string): string {
  const board = expand(placement);
  const at = (sq: string) => board.get(sq);
  let r = '';
  if (at('e1') === 'K') {
    if (at('h1') === 'R') r += 'K';
    if (at('a1') === 'R') r += 'Q';
  }
  if (at('e8') === 'k') {
    if (at('h8') === 'r') r += 'k';
    if (at('a8') === 'r') r += 'q';
  }
  return r || '-';
}

/** Placement string → square → piece letter. */
export function expand(placement: string): Map<string, string> {
  const out = new Map<string, string>();
  placement.split('/').forEach((row, i) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) file += Number(ch);
      else {
        out.set(`${'abcdefgh'[file]}${8 - i}`, ch);
        file++;
      }
    }
  });
  return out;
}

/** Square → piece letter map → placement string. */
export function compress(board: Map<string, string>): string {
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (const f of 'abcdefgh') {
      const p = board.get(`${f}${rank}`);
      if (p) {
        if (empty) row += empty;
        row += p;
        empty = 0;
      } else empty++;
    }
    rows.push(row + (empty ? empty : ''));
  }
  return rows.join('/');
}

/** Builds and checks the FEN of a hand-set-up position. Returns the FEN or an error in plain words. */
export function setupFen(placement: string, turn: Color, castling: string): { ok: true; fen: string } | { ok: false; error: string } {
  const board = expand(placement);
  const count = (p: string) => [...board.values()].filter((x) => x === p).length;
  if (count('K') !== 1 || count('k') !== 1) return { ok: false, error: 'Each side needs exactly one king.' };
  for (const [sq, p] of board) if ((p === 'P' || p === 'p') && (sq[1] === '1' || sq[1] === '8')) return { ok: false, error: `A pawn can't stand on ${sq}.` };
  // Keep only the castling rights the placement still allows.
  const allowed = autoCastling(placement);
  const rights = [...castling].filter((c) => allowed.includes(c)).join('') || '-';
  const fen = `${placement} ${turn} ${rights} - 0 1`;
  const v = validateFen(fen);
  if (!v.ok) return { ok: false, error: cleanError(v.error) };
  const err = checkSetup(fen);
  return err ? { ok: false, error: err } : { ok: true, fen };
}

/** The side that just moved can't be in check (that position can't arise in a game). */
function checkSetup(fen: string): string | null {
  const parts = fen.split(' ');
  const other = parts[1] === 'w' ? 'b' : 'w';
  try {
    const flipped = new Chess([parts[0], other, '-', '-', '0', '1'].join(' '));
    if (flipped.inCheck()) return `${other === 'w' ? 'White' : 'Black'} is in check but it's ${parts[1] === 'w' ? 'White' : 'Black'}'s move. Change the side to move.`;
  } catch {
    return 'That position is not legal.';
  }
  return null;
}
