/** Importing chess.com games: PGN → moves, clocks and the facts the review needs. */
import { Chess, type Color } from 'chess.js';
import { uciOf } from '../game/session';
import type { ChessComGame } from './chesscom';

export interface ImportedMove {
  san: string;
  uci: string;
  color: Color;
  fenBefore: string;
  fenAfter: string;
  /** Clock after the move, in seconds, if the PGN has %clk. */
  clock: number | null;
}

export type Ending = 'checkmate' | 'resignation' | 'timeout' | 'draw' | 'abandoned' | 'other';

export interface ImportedGame {
  url: string;
  startFen: string;
  moves: ImportedMove[];
  white: { name: string; rating: number };
  black: { name: string; rating: number };
  /** '1-0', '0-1' or '1/2-1/2'. */
  result: string;
  ending: Ending;
  /** Initial clock and increment in seconds, if known. */
  timeControl: { base: number; increment: number } | null;
  hasClocks: boolean;
}

/** "0:02:59.4" → 179.4 */
export function parseClock(s: string): number {
  return s.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}

/** All %clk values in move order. (chess.js keys comments by position, which loses repeats.) */
export function extractClocks(pgn: string): number[] {
  const body = pgn.replace(/^\[.*\]\s*$/gm, '');
  return [...body.matchAll(/\[%clk\s+([\d:.]+)\]/g)].map((m) => parseClock(m[1]));
}

/** "180+2" → { base: 180, increment: 2 }; daily ("1/86400") → null. */
export function parseTimeControl(tc: string | undefined): ImportedGame['timeControl'] {
  if (!tc || tc.includes('/')) return null;
  const [base, inc] = tc.split('+').map(Number);
  return Number.isFinite(base) ? { base, increment: Number.isFinite(inc) ? inc : 0 } : null;
}

const ENDINGS: Record<string, Ending> = {
  checkmated: 'checkmate',
  resigned: 'resignation',
  timeout: 'timeout',
  abandoned: 'abandoned',
  agreed: 'draw',
  repetition: 'draw',
  stalemate: 'draw',
  insufficient: 'draw',
  '50move': 'draw',
  timevsinsufficient: 'draw',
};

/** How the game ended, from the loser's chess.com result code (or the PGN for draws). */
export function endingOf(white: string, black: string): Ending {
  const code = white === 'win' ? black : black === 'win' ? white : white;
  return ENDINGS[code] ?? 'other';
}

export function importPgn(pgn: string, meta: Partial<Pick<ImportedGame, 'url' | 'ending'>> = {}): ImportedGame {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const h = chess.getHeaders();
  const history = chess.history({ verbose: true });
  const clocks = extractClocks(pgn);
  const hasClocks = clocks.length === history.length && history.length > 0;
  const moves: ImportedMove[] = history.map((m, i) => ({
    san: m.san,
    uci: uciOf(m),
    color: m.color,
    fenBefore: m.before,
    fenAfter: m.after,
    clock: hasClocks ? clocks[i] : null,
  }));
  const result = h.Result ?? '*';
  const term = (h.Termination ?? '').toLowerCase();
  const ending: Ending =
    meta.ending ??
    (chess.isCheckmate() || term.includes('checkmate') ? 'checkmate'
      : term.includes('resignation') ? 'resignation'
      : term.includes('time') ? 'timeout'
      : result === '1/2-1/2' ? 'draw'
      : term.includes('abandon') ? 'abandoned'
      : 'other');
  return {
    url: meta.url ?? h.Link ?? h.Site ?? '',
    startFen: history[0]?.before ?? chess.fen(),
    moves,
    white: { name: h.White ?? 'White', rating: Number(h.WhiteElo) || 0 },
    black: { name: h.Black ?? 'Black', rating: Number(h.BlackElo) || 0 },
    result,
    ending,
    timeControl: parseTimeControl(h.TimeControl),
    hasClocks,
  };
}

export function importChessComGame(g: ChessComGame): ImportedGame {
  return importPgn(g.pgn, { url: g.url, ending: endingOf(g.white.result, g.black.result) });
}

/** Seconds spent on each move (null without clocks). Uses the increment so the first move isn't negative. */
export function timeSpent(game: ImportedGame): (number | null)[] {
  const inc = game.timeControl?.increment ?? 0;
  const base = game.timeControl?.base ?? null;
  const last: Record<Color, number | null> = { w: base, b: base };
  return game.moves.map((m) => {
    if (m.clock === null) return null;
    const prev = last[m.color];
    last[m.color] = m.clock;
    return prev === null ? null : Math.max(0, Math.round((prev + inc - m.clock) * 10) / 10);
  });
}
