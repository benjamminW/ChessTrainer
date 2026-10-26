import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { mateIn } from '../src/coach/classify';
import {
  backRankWeak, findPins, gamePhase, matingMoves, pawnStructure, threatFen,
} from '../src/coach/facts';
import { buildHints, hintIdea } from '../src/coach/hints';
import { scoreMove } from '../src/coach/review';
import { LESSONS, RuleBasedProvider, lessonFor } from '../src/coach/ruleBased';
import { generalTip, strategicTips, tacticalTips } from '../src/coach/tips';
import { mateToCp, type Analysis, type PvLine } from '../src/engine/uci';
import { exportPgn } from '../src/game/pgn';
import { Session, newGameState } from '../src/game/session';

const line = (cp: number, pv: string[], multipv = 1): PvLine => ({ cp, pv, multipv, depth: 13, mate: mateIn(cp) });
const analysis = (fen: string, lines: PvLine[]): Analysis => ({ fen, depth: 13, lines, bestmove: lines[0]?.pv[0] ?? null });

// Positions used across tests.
const PIN = 'r1bqkbnr/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4'; // Bb5 pins Nc6 to the king
const MATE_THREAT = 'r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P2q/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5'; // ...Qxf2# is threatened
const BACK_RANK = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'; // Ra8#
const HUNG_BISHOP = 'rnbqkbnr/ppppppp1/B6p/8/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 2';
const FORK = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1'; // Nc7+ forks king and rook

describe('position facts', () => {
  it('finds an absolute pin', () => {
    const pins = findPins(new Chess(PIN), 'w');
    expect(pins).toHaveLength(1);
    expect(pins[0].pinner.square).toBe('b5');
    expect(pins[0].pinned.square).toBe('c6');
    expect(pins[0].target.type).toBe('k');
  });

  it('does not call a check a pin', () => {
    expect(findPins(new Chess('4k3/8/8/1B6/8/8/8/4K3 b - - 0 1'), 'w')).toEqual([]);
  });

  it("finds mating moves and the opponent's mate threat", () => {
    expect(matingMoves(BACK_RANK).map((m) => m.san)).toEqual(['Ra8#']);
    const tf = threatFen(MATE_THREAT)!;
    expect(matingMoves(tf).map((m) => m.san)).toContain('Qxf2#');
    // No "pass" is possible while in check.
    expect(threatFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1')).toBeNull();
  });

  it('detects back-rank weakness only when a heavy piece can use it', () => {
    const c = new Chess(BACK_RANK);
    expect(backRankWeak(c, 'b')).toBe('g8');
    expect(backRankWeak(c, 'w')).toBeNull(); // Black has no rook or queen
  });

  it('classifies pawn structure', () => {
    const s = pawnStructure(new Chess('4k3/8/8/3p4/8/2P5/P1P3P1/4K3 w - - 0 1'), 'w');
    const at = (sq: string) => s.find((p) => p.square === sq)!;
    expect(at('a2')).toMatchObject({ isolated: true, doubled: false, passed: true });
    expect(at('c2')).toMatchObject({ isolated: true, doubled: true, passed: false }); // d5 pawn is in front on an adjacent file
    expect(at('g2').passed).toBe(true);
  });

  it('detects game phase', () => {
    expect(gamePhase(new Chess())).toBe('opening');
    expect(gamePhase(new Chess('8/8/4k3/8/2P5/8/8/4K3 w - - 0 1'))).toBe('endgame');
    expect(gamePhase(new Chess('r1bq1rk1/pp2bppp/2n2n2/3p4/3P4/2N2N2/PP2BPPP/R1BQ1RK1 w - - 0 12'))).toBe('middlegame');
  });
});

describe('tactical tips', () => {
  const titles = (fen: string, me: 'w' | 'b') => tacticalTips(fen, me).map((t) => t.title);

  it('spots mate in one and the weak back rank', () => {
    expect(titles(BACK_RANK, 'w')).toEqual(expect.arrayContaining(['Checkmate in one', 'Weak back rank']));
  });

  it("warns about the opponent's mate threat", () => {
    const t = tacticalTips(MATE_THREAT, 'w').find((x) => x.title === 'Mate threat')!;
    expect(t.text).toContain('Qxf2#');
    expect(t.squares).toEqual(['h4', 'f2']);
  });

  it('flags my piece in danger, and the loose piece for the opponent', () => {
    expect(tacticalTips(HUNG_BISHOP, 'w').find((t) => t.title === 'Piece in danger')?.squares).toEqual(['a6']);
    expect(tacticalTips(HUNG_BISHOP, 'b').find((t) => t.title === 'Loose piece')?.squares).toEqual(['a6']);
  });

  it('describes pins from both sides', () => {
    expect(titles(PIN, 'w')).toContain('Pin');
    expect(titles(PIN, 'b')).toContain('You are pinned');
  });

  it('points at a fork without giving away the square', () => {
    const t = tacticalTips(FORK, 'w').find((x) => x.title === 'Fork chance')!;
    expect(t.squares).toEqual(['b5']);
    expect(t.text).not.toContain('c7');
  });

  it("only gives 'your move' tactics on your turn", () => {
    // Black to move: White gets no 'Loose piece' / 'Fork chance' tips.
    expect(titles(HUNG_BISHOP, 'w')).not.toContain('Loose piece');
  });
});

describe('strategy tips', () => {
  const titles = (fen: string, me: 'w' | 'b') => strategicTips(fen, me).map((t) => t.title);

  it('pushes development and warns about an early queen', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 4';
    expect(titles(fen, 'w')).toEqual(expect.arrayContaining(['Develop your pieces', 'Queen out early']));
  });

  it('suggests castling once the opening is underway', () => {
    const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 6';
    expect(titles(fen, 'w')).toContain('Castle soon');
  });

  it('gives endgame advice: king activity and passed pawns', () => {
    const tips = titles('8/8/4k3/8/2P5/8/8/4K3 w - - 0 1', 'w');
    expect(tips).toEqual(expect.arrayContaining(['Activate your king', 'Passed pawn']));
    expect(titles('8/8/4k3/8/2P5/8/8/4K3 w - - 0 1', 'b')).toContain('Stop the passed pawn');
  });

  it('points rooks at open files', () => {
    expect(titles('r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/R4RK1 w - - 0 20', 'w')).toContain('Open file');
  });

  it('always has something to say, and caps the list', () => {
    expect(strategicTips(new Chess().fen(), 'w').length).toBeGreaterThan(0);
    expect(strategicTips('r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 4', 'w').length).toBeLessThanOrEqual(3);
    expect(generalTip(new Chess().fen()).title).toBe('Opening principles');
  });
});

describe('hints', () => {
  it('level 1 names the idea, not the move', () => {
    const idea = hintIdea(FORK, analysis(FORK, [line(500, ['b5c7', 'e8d7', 'c7a8'])]));
    expect(idea.text).toMatch(/fork/);
    expect(idea.text).not.toContain('c7');
  });

  it('builds three levels: idea, piece, move', () => {
    const steps = buildHints(FORK, analysis(FORK, [line(500, ['b5c7', 'e8d7', 'c7a8'])]), 'w');
    expect(steps.map((s) => s.level)).toEqual([1, 2, 3]);
    expect(steps[1].text).toBe('Move the knight on b5.');
    expect(steps[1].circles).toEqual(['b5']);
    expect(steps[2].text).toMatch(/^Nc7\+ is the engine's choice \(\+5\.00\)/);
    expect(steps[2].arrow).toEqual({ from: 'b5', to: 'c7' });
  });

  it('spots a mate', () => {
    expect(hintIdea(BACK_RANK, analysis(BACK_RANK, [line(mateToCp(1), ['a1a8'])])).text).toMatch(/checkmate in one/);
  });

  it('warns about a threatened piece', () => {
    const fen = 'rnbqkbnr/ppppppp1/B7/7p/4P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 3';
    const idea = hintIdea(fen, analysis(fen, [line(20, ['a6e2'])]));
    expect(idea.text).toBe('Your bishop on a6 is under attack. Deal with that first.');
    expect(idea.circles).toEqual(['a6']);
  });

  it("warns about the opponent's mate threat", () => {
    const idea = hintIdea(MATE_THREAT, analysis(MATE_THREAT, [line(-50, ['d1e2'])]));
    expect(idea.text).toMatch(/threatening checkmate \(Qxf2#\)/);
  });

  it('shows the eval from White’s side when Black asks', () => {
    const fen = 'r3k3/8/8/8/8/8/8/1n2K3 b - - 0 1';
    const steps = buildHints(fen, analysis(fen, [line(300, ['a8a1'])]), 'b');
    expect(steps[2].text).toContain('(−3.00)');
  });
});

describe('lessons in explanations', () => {
  it('picks the most important lesson', () => {
    expect(lessonFor(new Set(['material', 'hangs']))).toBe(LESSONS.find(([k]) => k === 'hangs')![1]);
    expect(lessonFor(new Set(['hangs', 'allows-mate']))).toContain('threatening');
    expect(lessonFor(new Set())).toBeUndefined();
  });

  it('adds a blunder-check tip to a hung piece', async () => {
    const s = new Session(newGameState('w', 1200));
    s.play('e2e4', 'user');
    s.play('h7h6', 'bot');
    const ply = s.play('f1a6', 'user')!;
    const before = analysis(ply.fenBefore, [line(69, ['d2d4', 'e7e6'])]);
    const after = analysis(ply.fenAfter, [line(649, ['b8a6'])]);
    const numbers = scoreMove(ply, before, after);
    const e = await new RuleBasedProvider().explain({ ply, prev: s.plies[1], userColor: 'w', before, after, numbers });
    expect(e.tip).toMatch(/^Blunder check/);
  });
});

describe('PGN with hints', () => {
  it('records hint usage', () => {
    const s = new Session(newGameState('w', 1200));
    const ply = s.play('e2e4', 'user')!;
    ply.hint = 2;
    s.state.hintsUsed = 1;
    const pgn = exportPgn(s.state);
    expect(pgn).toContain('[Hints "1"]');
    expect(pgn).toContain('1. e4 {Hint used (level 2)}');
  });
});

describe('hint and tip priorities', () => {
  // Black's queen on h4 is loose and also threatens Qxf2#; Nxh4 solves both.
  const LOOSE_QUEEN = 'r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P2q/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5';

  it('prefers the winning capture over the mate threat when the capture is the point', () => {
    const idea = hintIdea(LOOSE_QUEEN, analysis(LOOSE_QUEEN, [line(800, ['f3h4'])]));
    expect(idea.text).toMatch(/isn't properly defended/);
  });

  it('ignores pins of a pawn to a minor piece', () => {
    // Bc4 lines up f7 with the g8 knight: not worth a tip.
    expect(findPins(new Chess(LOOSE_QUEEN), 'w')).toEqual([]);
  });
});

describe('pins worth mentioning', () => {
  it('skips a rook "pinning" a pawn to a defended rook', () => {
    // Ra5 lines up a2 with a1; the a1 rook is defended by the queen, so nothing is won.
    expect(findPins(new Chess('4k3/8/8/r7/8/8/P7/RQ2K3 b - - 0 1'), 'b')).toEqual([]);
  });

  it('keeps a bishop pinning a knight to a rook', () => {
    expect(findPins(new Chess('4k3/8/8/8/3b4/8/1N6/R3K3 b - - 0 1'), 'b')).toHaveLength(1);
  });
});
