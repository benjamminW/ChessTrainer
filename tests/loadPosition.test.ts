import { beforeEach, describe, expect, it } from 'vitest';
import { exportPgn } from '../src/game/pgn';
import { loadGame, saveGame } from '../src/game/persistence';
import { playableFen } from '../src/game/position';
import { Session, startFromPosition } from '../src/game/session';
import type { GameState } from '../src/types';

function start(fen: string, userColor: 'w' | 'b' = 'w'): Session {
  const r = startFromPosition(fen, { userColor, elo: 1200 });
  if (!r.ok) throw new Error(r.error);
  return new Session(r.state);
}

describe('startFromPosition', () => {
  it('keeps side to move, castling rights, en passant square and move counters', () => {
    // After 1. e4 c5 2. e5 d5: White may take en passant on d6; Black to move counters 0 and 3.
    const ep = 'rnbqkbnr/pp2pppp/8/2ppP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
    const s = start(ep);
    expect(s.state.startFen).toBe(ep);
    expect(s.turnAt()).toBe('w');
    expect(s.legalDests().get('e5' as never)).toContain('d6');
    expect(s.play('e5d6', 'user')?.san).toBe('exd6');

    const castle = 'r3k2r/pppq1ppp/2npbn2/4p3/4P3/2NPBN2/PPPQ1PPP/R3K2R b Kq - 7 12';
    const c = start(castle, 'b');
    expect(c.state.startFen).toBe(castle);
    expect(c.turnAt()).toBe('b');
    // Black kept only queenside castling, so O-O-O is legal and O-O isn't.
    expect(c.legalDests().get('e8' as never)).toContain('c8');
    expect(c.legalDests().get('e8' as never)).not.toContain('g8');
    expect(c.play('e8c8', 'user')?.san).toBe('O-O-O');
    expect(c.fenAt().split(' ').slice(4).join(' ')).toBe('8 13');
  });

  it('refuses positions that are illegal or already finished, with a reason', () => {
    const bad = (fen: string) => {
      const r = startFromPosition(fen, { userColor: 'w', elo: 1200 });
      return r.ok ? null : r.error;
    };
    expect(bad('not a fen')).toBeTruthy();
    expect(bad('8/8/8/8/8/8/8/4K3 w - - 0 1')).toBeTruthy();
    expect(bad('4k3/8/8/8/8/8/4r3/4K3 b - - 0 1')).toMatch(/White is in check/);
    expect(bad('k7/1Q6/1K6/8/8/8/8/8 b - - 0 1')).toMatch(/checkmate/);
    expect(bad('k7/8/1Q6/8/8/8/8/2K5 b - - 0 1')).toMatch(/stalemate/);
    expect(bad('k7/8/8/8/8/8/8/2K5 w - - 0 1')).toMatch(/enough material/);
    expect(playableFen('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1')).toEqual({ ok: true, fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1' });
  });

  it('records where the position came from without replaying it', () => {
    const r = startFromPosition('4k3/8/8/8/8/8/4P3/4K3 w - - 0 40', {
      userColor: 'w', elo: 1500, context: { label: 'your game vs someone, move 40.', history: { startFen: 'x', moves: ['e2e4'] } },
    });
    expect(r.ok && r.state.context?.label).toBe('your game vs someone, move 40.');
    expect(r.ok && r.state.plies).toEqual([]);
  });
});

describe('a game from a loaded position', () => {
  it('cannot take back past the starting position', () => {
    // Black (the coach) moves first; you play White.
    const s = start('4k3/8/8/8/8/8/4P3/4K3 b - - 0 1', 'w');
    expect(s.takebackSize()).toBe(0);
    s.play('e8d7', 'bot');
    expect(s.takebackSize()).toBe(0); // only the coach's move: nothing of yours to undo
    s.play('e2e4', 'user');
    expect(s.takebackSize()).toBe(1);
    s.play('d7e6', 'bot');
    expect(s.takebackSize()).toBe(2);
    s.takeBack();
    expect(s.plies.map((p) => p.uci)).toEqual(['e8d7']);
    expect(s.takebackSize()).toBe(0);
    expect(s.fenAt(0)).toBe('4k3/8/8/8/8/8/4P3/4K3 b - - 0 1');
  });

  it('counts repetition from the loaded position only', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const s = start(fen);
    const shuffle = ['e1d1', 'e8d8', 'd1e1', 'd8e8'];
    shuffle.forEach((m, i) => s.play(m, i % 2 ? 'bot' : 'user'));
    // Back to the start position: 2 occurrences.
    expect(s.chessAt().isThreefoldRepetition()).toBe(false);
    shuffle.forEach((m, i) => s.play(m, i % 2 ? 'bot' : 'user'));
    expect(s.chessAt().isThreefoldRepetition()).toBe(true);
    expect(s.result()?.reason).toBe('threefold repetition');
  });

  it('exports PGN with SetUp and FEN headers', () => {
    const fen = 'r3k2r/pppq1ppp/2npbn2/4p3/4P3/2NPBN2/PPPQ1PPP/R3K2R b Kq - 7 12';
    const s = start(fen, 'b');
    s.play('e8c8', 'user');
    s.play('e1g1', 'bot');
    const pgn = exportPgn(s.state);
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain(`[FEN "${fen}"]`);
    expect(pgn).toMatch(/12\. \.\.\. O-O-O 13\. O-O|12\.\.\. O-O-O 13\. O-O/);
  });
});

describe('saving a game from a loaded position', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
  });

  it('stores the starting FEN and context, and restores the game', () => {
    const fen = 'rnbqkbnr/pp2pppp/8/2ppP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
    const r = startFromPosition(fen, { userColor: 'w', elo: 1300, context: { label: 'test position' } });
    if (!r.ok) throw new Error(r.error);
    const s = new Session(r.state);
    s.play('e5d6', 'user');
    saveGame(s.state);
    const back = loadGame() as GameState;
    expect(back.startFen).toBe(fen);
    expect(back.context?.label).toBe('test position');
    const restored = new Session(back);
    expect(restored.plies.map((p) => p.san)).toEqual(['exd6']);
    expect(restored.fenAt(0)).toBe(fen);
    expect(restored.takebackSize()).toBe(1);
  });
});
