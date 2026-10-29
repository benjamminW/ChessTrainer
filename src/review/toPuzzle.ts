/** "Save as puzzle": turn one of your mistakes into a Lichess-format puzzle. */
import { Chess, type Color } from 'chess.js';
import { REVIEW_CONFIG } from '../config/review';
import { parseUci } from '../game/session';
import type { Puzzle } from '../puzzles/types';
import type { ImportedGame } from './pgn';
import type { GameAnalysis } from './types';

/** Short id from a chess.com URL: .../game/live/123456 → 123456. */
export function gameId(url: string): string {
  return url.split('/').filter(Boolean).pop() ?? url;
}

/**
 * Builds a puzzle from your move at `index`:
 *   fen      = position before the opponent's previous move (Lichess format: that move is auto-played)
 *   moves    = [opponent's previous move, …engine's best line from your position]
 * The line is cut after REVIEW_CONFIG.puzzleMaxMoves of your moves and always ends on your move.
 * Returns null when there's no previous opponent move (your first move) or no usable line.
 */
export function mistakeToPuzzle(game: ImportedGame, a: GameAnalysis, index: number, maxMine = REVIEW_CONFIG.puzzleMaxMoves): Puzzle | null {
  if (index < 1 || index >= game.moves.length) return null;
  const me: Color = a.userColor;
  const prev = game.moves[index - 1];
  const line = a.moves[index]?.bestLine ?? [];
  const chess = new Chess(prev.fenBefore);
  chess.move(parseUci(prev.uci));
  const moves = [prev.uci];
  let mine = 0;
  for (const uci of line) {
    const mover = chess.turn();
    try {
      chess.move(parseUci(uci));
    } catch {
      break;
    }
    moves.push(uci);
    if (mover === me && ++mine >= maxMine) break;
  }
  // End on your move, never on an opponent reply.
  if (moves.length > 1 && (moves.length - 1) % 2 === 0) moves.pop();
  if (mine === 0 || moves.length < 2) return null;
  const kinds = a.moves[index].explanation?.kinds ?? [];
  return {
    id: `cc-${gameId(game.url)}-${index}`,
    fen: prev.fenBefore,
    moves,
    rating: 0,
    themes: ['myGame', ...kinds],
  };
}
