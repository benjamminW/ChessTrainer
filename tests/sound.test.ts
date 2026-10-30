import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { moveSoundFor } from '../src/ui/sound';

/** Placement before and after a move, with the move's squares, as the board sees them. */
function step(fen: string, move: string) {
  const c = new Chess(fen);
  const m = c.move(move);
  return { before: fen.split(' ')[0], after: c.fen().split(' ')[0], last: [m.from, m.to] as [string, string], check: c.inCheck() };
}
const sound = (fen: string, move: string) => {
  const s = step(fen, move);
  return moveSoundFor(s.before, s.after, s.last, s.check);
};

describe('move sounds', () => {
  const start = new Chess().fen();

  it('tells moves, captures, castling, promotion and check apart', () => {
    expect(sound(start, 'e4')).toBe('move');
    expect(sound('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'exd5')).toBe('capture');
    expect(sound('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'O-O')).toBe('castle');
    expect(sound('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'O-O-O')).toBe('castle');
    expect(sound('8/4P1k1/8/8/8/8/8/4K3 w - - 0 1', 'e8=Q')).toBe('promote');
    expect(sound('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'Ra8+')).toBe('check');
  });

  it('counts en passant as a capture', () => {
    expect(sound('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3', 'exf6')).toBe('capture');
  });

  it('stays quiet when nothing moved or there is no last move', () => {
    const p = start.split(' ')[0];
    expect(moveSoundFor(p, p, ['e2', 'e4'], false)).toBeNull();
    expect(moveSoundFor(null, p, ['e2', 'e4'], false)).toBeNull();
    expect(moveSoundFor('8/8/8/8/8/8/8/4K2k', p, null, false)).toBeNull();
  });
});
