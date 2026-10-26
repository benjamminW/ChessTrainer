import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { mateIn } from '../src/coach/classify';
import { forkTargets, isHanging } from '../src/coach/facts';
import { scoreMove } from '../src/coach/review';
import { RuleBasedProvider, describeIdea } from '../src/coach/ruleBased';
import type { Analysis, PvLine } from '../src/engine/uci';
import { exportPgn } from '../src/game/pgn';
import { Session, newGameState } from '../src/game/session';

const line = (cp: number, pv: string[], multipv = 1): PvLine => ({ cp, pv, multipv, depth: 13, mate: mateIn(cp) });
const analysis = (fen: string, lines: PvLine[]): Analysis => ({ fen, depth: 13, lines, bestmove: lines[0]?.pv[0] ?? null });

describe('facts', () => {
  it('detects hanging pieces', () => {
    // After 1.e4 h6 2.Ba6: the bishop is attacked by b7 and undefended.
    const c = new Chess('rnbqkbnr/ppppppp1/B6p/8/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 2');
    expect(isHanging(c, 'a6')).toBe(true);
    expect(isHanging(c, 'e4')).toBe(false);
  });

  it('counts a piece attacked by a cheaper one as hanging even if defended', () => {
    const c = new Chess('4k3/8/8/3p4/4N3/5P2/8/4K3 w - - 0 1'); // Ne4 defended by f3, attacked by d5 pawn
    expect(isHanging(c, 'e4')).toBe(true);
  });

  it('detects a knight fork', () => {
    const c = new Chess('r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1'); // Nc7+ hits king e8 and rook a8
    expect(forkTargets(c, 'c7').map((t) => t.square).sort()).toEqual(['a8', 'e8']);
  });
});

describe('describeIdea', () => {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  it('describes development and central pawn moves', () => {
    expect(describeIdea(START, 'g1f3', 'b')).toBe('Develops the knight.');
    expect(describeIdea(START, 'e2e4', 'b')).toBe('Claims space in the center.');
  });

  it('describes captures with possessives for the user', () => {
    // Bot (White) captures the user's (Black's) pawn.
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    expect(describeIdea(fen, 'e4d5', 'b')).toBe('Captures your pawn on d5.');
  });

  it('describes castling and checkmate', () => {
    expect(describeIdea('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1', 'b')).toMatch(/^Castles/);
    expect(describeIdea('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'a1a8', 'b')).toBe('Delivers checkmate.');
  });

  it('describes attacks on more valuable pieces', () => {
    const fen = '4k3/8/8/8/3q4/8/8/R6K w - - 0 1';
    expect(describeIdea(fen, 'a1a4', 'b')).toBe('Attacks your queen on d4.');
  });
});

describe('RuleBasedProvider', () => {
  it('explains a hung bishop with the better move and line', async () => {
    const s = new Session(newGameState('w', 1200));
    s.play('e2e4', 'user');
    s.play('h7h6', 'bot');
    const ply = s.play('f1a6', 'user')!;
    const before = analysis(ply.fenBefore, [line(69, ['d2d4', 'e7e6', 'g1f3', 'd7d5'])]);
    const after = analysis(ply.fenAfter, [line(649, ['b8a6', 'b1c3', 'e7e6'])]); // Black POV
    const numbers = scoreMove(ply, before, after);
    expect(numbers.classification).toBe('Blunder');

    const e = await new RuleBasedProvider().explain({ ply, prev: s.plies[1], userColor: 'w', before, after, numbers });
    expect(e.headline).toBe('Blunder. d4 was better (+0.69).');
    expect(e.details.join(' ')).toContain('Leaves your bishop on a6 undefended');
    expect(e.betterLineSan).toEqual(['d4', 'e6', 'Nf3', 'd5']);
    expect(e.pvSan).toEqual(['Nxa6', 'Nc3', 'e6']);
  });

  it('mentions an allowed mate', async () => {
    // White plays a pawn move that allows Qxf2#-style mate; we just fake the engine saying "mate in 1".
    const s = new Session(newGameState('w', 1200, 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 4 4'));
    s.play('f6h5', 'bot'); // a strange bot move, just to reach a White-to-move position
    const ply = s.play('a2a3', 'user')!;
    const before = analysis(ply.fenBefore, [line(900, ['c4f7'])]);
    const after = analysis(ply.fenAfter, [{ cp: 99999, mate: 1, pv: ['d8h4'], multipv: 1, depth: 13 }]);
    const numbers = scoreMove(ply, before, after);
    const e = await new RuleBasedProvider().explain({ ply, prev: s.plies[0], userColor: 'w', before, after, numbers });
    expect(e.details[0]).toMatch(/^Allows mate in 1/);
  });

  it('gives bot moves a one-line idea', async () => {
    const s = new Session(newGameState('b', 1200));
    const ply = s.play('g1f3', 'bot')!;
    const before = analysis(ply.fenBefore, [line(30, ['g1f3'])]);
    const after = analysis(ply.fenAfter, [line(-30, ['d7d5'])]);
    const numbers = scoreMove(ply, before, after);
    const e = await new RuleBasedProvider().explain({ ply, prev: null, userColor: 'b', before, after, numbers });
    expect(e.headline).toBe('Develops the knight.');
    expect(e.details).toEqual([]);
  });
});

describe('session takebacks', () => {
  it('undoes my move plus the reply, or just my move while the bot is thinking', () => {
    const s = new Session(newGameState('w', 1200));
    expect(s.takebackSize()).toBe(0);
    s.play('e2e4', 'user');
    expect(s.takebackSize()).toBe(1);
    s.play('e7e5', 'bot');
    expect(s.takebackSize()).toBe(2);
    expect(s.takeBack().map((p) => p.san)).toEqual(['e4', 'e5']);
    expect(s.plies).toHaveLength(0);
    expect(s.state.takebacks).toBe(1);
  });

  it("can't take back the bot's opening move when playing Black", () => {
    const s = new Session(newGameState('b', 1200));
    s.play('e2e4', 'bot');
    expect(s.takebackSize()).toBe(0);
  });

  it('branches from an earlier position, discarding later moves', () => {
    const s = new Session(newGameState('w', 1200));
    for (const m of ['e2e4', 'e7e5', 'g1f3', 'b8c6']) s.play(m, 'user');
    s.goTo(2);
    s.play('d2d4', 'user');
    expect(s.plies.map((p) => p.san)).toEqual(['e4', 'e5', 'd4']);
  });

  it('detects threefold repetition', () => {
    const s = new Session(newGameState('w', 1200));
    for (let i = 0; i < 2; i++) for (const m of ['g1f3', 'g8f6', 'f3g1', 'f6g8']) s.play(m, 'user');
    expect(s.result()).toEqual({ score: '1/2-1/2', reason: 'threefold repetition' });
  });
});

describe('PGN export', () => {
  it('includes headers, classification comments and the result', () => {
    const s = new Session(newGameState('w', 1500, '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'));
    const ply = s.play('a1a8', 'user')!;
    ply.review = {
      classification: 'Best', cpLoss: 0, evalBefore: 99999, evalAfter: 100000,
      bestUci: 'a1a8', bestSan: 'Ra8#', explanation: { headline: '', details: [], pvSan: [] },
    };
    const pgn = exportPgn(s.state);
    expect(pgn).toContain('[White "You"]');
    expect(pgn).toContain('[Black "Chess Coach (1500)"]');
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain('[FEN "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"]');
    expect(pgn).toMatch(/1\. Ra8# \{Best \(#\)\} 1-0/);
  });

  it('adds the better move for non-best moves', () => {
    const s = new Session(newGameState('w', 1200));
    const ply = s.play('f2f3', 'user')!;
    ply.review = {
      classification: 'Mistake', cpLoss: 150, evalBefore: 30, evalAfter: -120,
      bestUci: 'e2e4', bestSan: 'e4', explanation: { headline: '', details: [], pvSan: [] },
    };
    expect(exportPgn(s.state)).toContain('1. f3 {Mistake (−1.20). Best was e4 (+0.30)} *');
  });
});
