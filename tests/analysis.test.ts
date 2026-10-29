import { describe, expect, it } from 'vitest';
import { BestMoveMode, type AnalysisDeps } from '../src/analysis/controller';
import { START_FEN, autoCastling, compress, expand, parsePosition, setupFen } from '../src/analysis/position';
import type { Analysis } from '../src/engine/uci';

describe('parsePosition', () => {
  it('reads a full FEN', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    const r = parsePosition(fen);
    expect(r.ok && r.position).toEqual({ startFen: fen, moves: [] });
  });

  it('fills in the missing fields of a short FEN', () => {
    const r = parsePosition('4k3/8/8/8/8/8/4P3/4K3 b');
    expect(r.ok && r.position.startFen).toBe('4k3/8/8/8/8/8/4P3/4K3 b - - 0 1');
  });

  it('reads a PGN with headers and a plain move list', () => {
    const pgn = '[Event "Casual"]\n[White "A"]\n[Black "B"]\n\n1. e4 e5 2. Nf3 Nc6 *';
    const r = parsePosition(pgn);
    expect(r.ok && r.position).toEqual({ startFen: START_FEN, moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'] });
    const list = parsePosition('1. d4 d5 2. c4');
    expect(list.ok && list.position.moves).toEqual(['d2d4', 'd7d5', 'c2c4']);
  });

  it('explains what is wrong', () => {
    expect(parsePosition('')).toMatchObject({ ok: false });
    expect(parsePosition('8/8/8/8/8/8/8/8 w')).toMatchObject({ ok: false });
    expect(parsePosition('1. e4 e5 2. Ke3 Qh4 3. Kz9')).toMatchObject({ ok: false });
    // White is in check but it's Black's move.
    const r = parsePosition('4k3/8/8/8/8/8/4r3/4K3 b - - 0 1');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/White is in check/);
  });
});

describe('board setup', () => {
  it('expand and compress round-trip', () => {
    const placement = START_FEN.split(' ')[0];
    expect(compress(expand(placement))).toBe(placement);
    expect(compress(new Map([['e4', 'Q']]))).toBe('8/8/8/8/4Q3/8/8/8');
  });

  it('only allows castling with king and rook at home', () => {
    expect(autoCastling(START_FEN.split(' ')[0])).toBe('KQkq');
    expect(autoCastling('r3k3/8/8/8/8/8/8/4K2R')).toBe('Kq');
    expect(autoCastling('4k3/8/8/8/8/8/8/3K3R')).toBe('-');
  });

  it('builds a FEN and drops impossible castling rights', () => {
    expect(setupFen('4k3/8/8/8/8/8/8/4K2R', 'w', 'KQkq')).toEqual({ ok: true, fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1' });
  });

  it('rejects illegal setups', () => {
    expect(setupFen('8/8/8/8/8/8/8/4K3', 'w', '-')).toMatchObject({ ok: false, error: 'Each side needs exactly one king.' });
    expect(setupFen('4k3/8/8/8/8/8/8/P3K3', 'w', '-')).toMatchObject({ ok: false });
    expect(setupFen('4k3/8/8/8/8/8/4r3/4K3', 'b', '-')).toMatchObject({ ok: false });
  });
});

describe('BestMoveMode', () => {
  const fakeDeps = (calls: string[] = []): AnalysisDeps => ({
    analyze: (fen) => {
      calls.push(fen);
      // Pretend the engine likes the first legal move it is asked about.
      const a: Analysis = { fen, depth: 16, bestmove: 'e2e4', lines: [{ multipv: 1, depth: 16, cp: 30, mate: null, pv: ['e2e4', 'e7e5'] }, { multipv: 2, depth: 16, cp: 20, mate: null, pv: ['d2d4'] }] };
      return Promise.resolve(a);
    },
    cancel: () => {},
    requestRender: () => {},
    promotionHost: null as unknown as HTMLElement,
    playPosition: () => ({ startFen: START_FEN, moves: ['e2e4', 'e7e5', 'g1f3'], cursor: 2, userColor: 'b' }),
  });

  it('analyzes the shown position and lists the best moves', async () => {
    const calls: string[] = [];
    const m = new BestMoveMode(fakeDeps(calls));
    m.reset();
    await Promise.resolve();
    expect(calls).toContain(START_FEN);
    const best = m.bestMoves();
    expect(best.map((b) => b.san)).toEqual(['e4', 'd4']);
    expect(best[0].sanLine).toEqual(['e4', 'e5']);
    expect(best[0].evalWhite).toBe(30);
    expect(m.boardView().shapes.at(-1)).toEqual({ from: 'e2', to: 'e4', brush: 'green' });
  });

  it('plays moves, steps back and replaces the rest of the line', () => {
    const m = new BestMoveMode(fakeDeps());
    m.reset();
    expect(m.play('e2e4')).toBe(true);
    expect(m.play('e7e5')).toBe(true);
    expect(m.play('e1e5')).toBe(false);
    m.goTo(1);
    expect(m.play('c7c5')).toBe(true);
    expect(m.sanMoves()).toEqual(['e4', 'c5']);
    m.undo();
    expect(m.sanMoves()).toEqual(['e4']);
  });

  it('takes the position from the Play tab', () => {
    const m = new BestMoveMode(fakeDeps());
    m.usePlayGame();
    expect(m.cursor).toBe(2);
    expect(m.moves).toHaveLength(3);
    expect(m.orientation).toBe('b');
  });

  it('sets up a position by hand', () => {
    const m = new BestMoveMode(fakeDeps());
    m.reset();
    m.startEdit();
    m.editClear();
    m.setTool('K');
    m.editClick('e1');
    m.setTool('k');
    m.editClick('e8');
    m.setTool('Q');
    m.editClick('d4');
    m.setEditTurn('w');
    expect(m.finishEdit()).toBe(true);
    expect(m.fen()).toBe('4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1');
    expect(m.edit).toBeNull();
  });

  it('keeps setup open with an error when the position is illegal', () => {
    const m = new BestMoveMode(fakeDeps());
    m.reset();
    m.startEdit();
    m.editClear();
    expect(m.finishEdit()).toBe(false);
    expect(m.edit?.error).toMatch(/one king/);
  });
});
