/**
 * The move order of a Lichess puzzle:
 *   fen      = position before the opponent's move
 *   moves[0] = the opponent's move (auto-played)
 *   moves[1] = the solver's first move, moves[2] = auto reply, moves[3] = solver, …
 * The solver is the side NOT to move in `fen`.
 */
import { Chess, type Color, type Move } from 'chess.js';
import { parseUci, uciOf } from '../game/session';
import type { Puzzle } from './types';

export type MoveResult =
  /** The listed solution move (or an alternate mate). `reply` is the opponent's answer to auto-play, if any. */
  | { kind: 'correct'; move: Move; reply: string | null; solved: boolean }
  | { kind: 'wrong'; move: Move }
  | { kind: 'illegal' };

export class PuzzleLine {
  readonly puzzle: Puzzle;
  readonly solver: Color;
  /** Index in puzzle.moves of the next move to be played (by either side). */
  step = 0;
  chess: Chess;

  constructor(puzzle: Puzzle) {
    this.puzzle = puzzle;
    this.chess = new Chess(puzzle.fen);
    this.solver = this.chess.turn() === 'w' ? 'b' : 'w';
  }

  get fen(): string {
    return this.chess.fen();
  }

  get solved(): boolean {
    return this.step >= this.puzzle.moves.length;
  }

  /** The solver's expected move now, or null if it's not the solver's turn / the line is over. */
  expected(): string | null {
    if (this.solved || this.chess.turn() !== this.solver) return null;
    return this.puzzle.moves[this.step];
  }

  /** Plays the next listed move (the opponent's setup move or an auto reply). */
  playScripted(): Move {
    const uci = this.puzzle.moves[this.step];
    const move = this.chess.move(parseUci(uci));
    this.step++;
    return move;
  }

  /**
   * Checks a solver move. Accepts the listed move, or any move that gives checkmate
   * (Lichess puzzles can have alternate mates). A correct move is played on the line;
   * a wrong one is not, so the solver can retry the same position.
   */
  tryMove(uci: string): MoveResult {
    const expected = this.expected();
    if (!expected) return { kind: 'illegal' };
    const probe = new Chess(this.chess.fen());
    let move: Move;
    try {
      move = probe.move(parseUci(uci));
    } catch {
      return { kind: 'illegal' };
    }
    const exact = uciOf(move) === expected;
    if (!exact && !probe.isCheckmate()) return { kind: 'wrong', move };

    this.chess.move(parseUci(uciOf(move)));
    this.step++;
    if (!exact || this.solved) {
      // An alternate mate ends the puzzle even if the listed line was longer.
      this.step = this.puzzle.moves.length;
      return { kind: 'correct', move, reply: null, solved: true };
    }
    return { kind: 'correct', move, reply: this.puzzle.moves[this.step], solved: false };
  }

  /** Remaining listed moves from the current position (for "view solution"). */
  remaining(): string[] {
    return this.puzzle.moves.slice(this.step);
  }
}
