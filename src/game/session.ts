import { Chess, DEFAULT_POSITION, type Move, type Square } from 'chess.js';
import type { Color, GameResult, GameState, PlyRecord, PositionContext } from '../types';
import { playableFen } from './position';

export function uciOf(m: Pick<Move, 'from' | 'to' | 'promotion'>): string {
  return m.from + m.to + (m.promotion ?? '');
}

export function parseUci(uci: string): { from: Square; to: Square; promotion?: string } {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

export function newGameState(userColor: Color, elo: number, startFen = DEFAULT_POSITION): GameState {
  return {
    version: 1,
    startFen,
    userColor,
    elo,
    plies: [],
    takebacks: 0,
    hintsUsed: 0,
    resigned: null,
    startedAt: new Date().toISOString(),
  };
}

/**
 * The one way to start a game from any position (Review's "Play from here", the Best move tab,
 * Learn's practice steps). Checks the FEN and keeps its side to move, castling rights,
 * en passant square and move counters. The game's history starts at this position: repetition
 * is counted from here and takebacks can't go back past it. `context` (optional) records where
 * the position came from, for display.
 */
export function startFromPosition(
  fen: string,
  o: { userColor: Color; elo: number; context?: PositionContext },
): { ok: true; state: GameState } | { ok: false; error: string } {
  const r = playableFen(fen);
  if (!r.ok) return r;
  const state = newGameState(o.userColor, o.elo, r.fen);
  if (o.context) state.context = o.context;
  return { ok: true, state };
}

/** Game result for the position reached after the given chess.js history, or null if ongoing. */
export function resultOf(chess: Chess, resigned: Color | null): GameResult | null {
  if (resigned) return { score: resigned === 'w' ? '0-1' : '1-0', reason: 'resignation' };
  if (chess.isCheckmate()) return { score: chess.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
  if (chess.isStalemate()) return { score: '1/2-1/2', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { score: '1/2-1/2', reason: 'insufficient material' };
  if (chess.isThreefoldRepetition()) return { score: '1/2-1/2', reason: 'threefold repetition' };
  if (chess.isDrawByFiftyMoves()) return { score: '1/2-1/2', reason: '50-move rule' };
  return null;
}

/**
 * The game as a linear list of plies plus a review cursor.
 * `cursor` = number of plies applied to the displayed position (0 = start).
 */
export class Session {
  state: GameState;
  cursor: number;

  constructor(state: GameState) {
    this.state = state;
    this.cursor = state.plies.length;
  }

  get plies(): PlyRecord[] {
    return this.state.plies;
  }

  get atLatest(): boolean {
    return this.cursor === this.plies.length;
  }

  /** A chess.js instance with the first `n` plies played (keeps history for repetition detection). */
  chessAt(n = this.cursor): Chess {
    const chess = new Chess(this.state.startFen);
    for (let i = 0; i < n; i++) chess.move(parseUci(this.plies[i].uci));
    return chess;
  }

  fenAt(n = this.cursor): string {
    if (n === 0) return this.state.startFen;
    return this.plies[n - 1].fenAfter;
  }

  /** Result at the end of the game (latest position). */
  result(): GameResult | null {
    return resultOf(this.chessAt(this.plies.length), this.state.resigned);
  }

  isOver(): boolean {
    return this.result() !== null;
  }

  turnAt(n = this.cursor): Color {
    return this.fenAt(n).split(' ')[1] as Color;
  }

  /**
   * Plays a move at the cursor. If the cursor is behind the latest ply, later plies
   * are discarded (the caller is responsible for confirming that with the user).
   * Returns the new ply, or null if illegal.
   */
  play(move: { from: string; to: string; promotion?: string } | string, by: 'user' | 'bot'): PlyRecord | null {
    const chess = this.chessAt(this.cursor);
    let m: Move;
    try {
      m = chess.move(typeof move === 'string' ? parseUci(move) : move);
    } catch {
      return null;
    }
    this.truncate();
    const ply: PlyRecord = {
      san: m.san,
      uci: uciOf(m),
      color: m.color,
      by,
      fenBefore: m.before,
      fenAfter: m.after,
    };
    this.plies.push(ply);
    this.cursor = this.plies.length;
    return ply;
  }

  /** Discards plies after the cursor (branching). A resignation is undone if anything was discarded. */
  truncate(): void {
    if (this.cursor < this.plies.length) {
      this.state.plies = this.plies.slice(0, this.cursor);
      this.state.resigned = null;
    }
  }

  /** Number of plies a takeback would remove (0 = takeback not possible). */
  takebackSize(): number {
    if (this.state.resigned) return 0;
    const user = this.state.userColor;
    const n = this.plies.length;
    if (n === 0) return 0;
    const last = this.plies[n - 1];
    // Bot hasn't replied yet (or my move ended the game): undo just my move.
    if (last.color === user) return 1;
    // Undo the bot's reply and my move before it — if I have a move to undo.
    if (n >= 2 && this.plies[n - 2].color === user) return 2;
    return 0;
  }

  /** Undoes my last move and the bot's reply. Returns the removed plies (oldest first). */
  takeBack(): PlyRecord[] {
    const k = this.takebackSize();
    if (k === 0) return [];
    const removed = this.plies.splice(this.plies.length - k, k);
    this.state.takebacks++;
    this.cursor = this.plies.length;
    return removed;
  }

  resign(): void {
    this.state.resigned = this.state.userColor;
    this.cursor = this.plies.length;
  }

  goTo(n: number): void {
    this.cursor = Math.max(0, Math.min(this.plies.length, n));
  }

  /** Dests map (from -> [to]) for the side to move at the cursor. */
  legalDests(): Map<Square, Square[]> {
    const chess = this.chessAt(this.cursor);
    const dests = new Map<Square, Square[]>();
    for (const m of chess.moves({ verbose: true })) {
      const list = dests.get(m.from) ?? [];
      list.push(m.to);
      dests.set(m.from, list);
    }
    return dests;
  }

  isPromotion(from: string, to: string): boolean {
    const chess = new Chess(this.fenAt(this.cursor));
    return chess
      .moves({ verbose: true })
      .some((m) => m.from === from && m.to === to && m.promotion !== undefined);
  }
}
