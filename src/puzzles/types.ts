/** A Lichess puzzle. `fen` is the position BEFORE the opponent's setup move (moves[0]). */
export interface Puzzle {
  id: string;
  fen: string;
  /** UCI moves: [opponent's setup move, solver, reply, solver, …]. */
  moves: string[];
  rating: number;
  /** Lichess theme tags, e.g. ['fork', 'middlegame', 'short']. */
  themes: string[];
}

/** Compact form stored in public/puzzles/<band>.json: [id, fen, moves, rating, themes]. */
export type PuzzleRecord = [string, string, string, number, string];

export interface PuzzleIndex {
  source: string;
  generated: string;
  bands: { band: number; count: number; themes: Record<string, number> }[];
}

/** How a puzzle attempt ended, for rating and history. */
export type Outcome = 'solved' | 'failed' | 'assisted';
