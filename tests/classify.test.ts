import { describe, expect, it } from 'vitest';
import { classify, cpLoss, mateIn } from '../src/coach/classify';
import { formatEval, formatLine } from '../src/coach/format';
import { scoreMove } from '../src/coach/review';
import { MATE_CP, MOVE_CLASS } from '../src/config/coach';
import { mateToCp, parseInfo, type Analysis, type PvLine } from '../src/engine/uci';
import type { PlyRecord } from '../src/types';
import { Session, newGameState } from '../src/game/session';

const T = MOVE_CLASS;

describe('cpLoss', () => {
  it('is the drop from best to played, never negative', () => {
    expect(cpLoss(50, 20)).toBe(30);
    expect(cpLoss(20, 50)).toBe(0);
  });

  it('clamps both evals so decided positions barely register', () => {
    expect(cpLoss(1500, 900, 1000)).toBe(100);
    expect(cpLoss(3000, 1200, 1000)).toBe(0);
    expect(cpLoss(-1200, -3000, 1000)).toBe(0);
  });

  it('turns a missed mate into a large loss', () => {
    expect(cpLoss(mateToCp(2), 300, 1000)).toBe(700);
  });
});

describe('classify (win-probability drop)', () => {
  it('maps the drop to classes at the configured thresholds', () => {
    expect(classify(0, false)).toBe('Best');
    expect(classify(T.best - 0.01, false)).toBe('Best');
    expect(classify(T.excellent, false)).toBe('Excellent');
    expect(classify(T.good, false)).toBe('Good');
    expect(classify(T.inaccuracy, false)).toBe('Inaccuracy');
    expect(classify(T.mistake, false)).toBe('Mistake');
    expect(classify(T.mistake + 0.1, false)).toBe('Blunder');
  });

  it("always calls the engine's own choice Best", () => {
    expect(classify(30, true)).toBe('Best');
  });
});

describe('mate encoding and formatting', () => {
  it('round-trips mate distances', () => {
    expect(mateIn(mateToCp(3))).toBe(3);
    expect(mateIn(mateToCp(-2))).toBe(-2);
    expect(mateIn(450)).toBeNull();
    expect(mateToCp(1)).toBeGreaterThan(mateToCp(5)); // faster mate scores higher
  });

  it('formats evals', () => {
    expect(formatEval(35)).toBe('+0.35');
    expect(formatEval(-120)).toBe('−1.20');
    expect(formatEval(0)).toBe('0.00');
    expect(formatEval(mateToCp(3))).toBe('#3');
    expect(formatEval(mateToCp(-2))).toBe('#−2');
    expect(formatEval(MATE_CP)).toBe('#');
  });

  it('formats move lines with numbers', () => {
    expect(formatLine('8/8/8/8/8/8/8/8 w - - 0 12', ['Nf3', 'Nc6', 'Bb5'])).toBe('12. Nf3 Nc6 13. Bb5');
    expect(formatLine('8/8/8/8/8/8/8/8 b - - 0 12', ['Nc6', 'Bb5'])).toBe('12… Nc6 13. Bb5');
  });
});

describe('parseInfo', () => {
  it('parses multipv cp lines', () => {
    const l = parseInfo('info depth 10 seldepth 14 multipv 2 score cp -28 nodes 81144 nps 758355 hashfull 19 time 107 pv e7e6 d2d4 d7d5');
    expect(l).toEqual({ depth: 10, multipv: 2, cp: -28, mate: null, pv: ['e7e6', 'd2d4', 'd7d5'] });
  });

  it('parses mate scores', () => {
    const l = parseInfo('info depth 5 multipv 1 score mate -2 nodes 10 pv h7h6 a1a8');
    expect(l?.mate).toBe(-2);
    expect(l?.cp).toBe(mateToCp(-2));
  });

  it('ignores lines without a scored pv', () => {
    expect(parseInfo('info string NNUE evaluation using nn.nnue')).toBeNull();
    expect(parseInfo('info depth 0 score mate 0')).toBeNull();
  });
});

// ---- scoreMove: the classifier fed with (fake) engine analyses

const line = (cp: number, pv: string[], multipv = 1): PvLine => ({ cp, pv, multipv, depth: 13, mate: mateIn(cp) });
const analysis = (fen: string, lines: PvLine[]): Analysis => ({ fen, depth: 13, lines, bestmove: lines[0]?.pv[0] ?? null });

function plyFor(fenStart: string, uci: string): PlyRecord {
  const s = new Session(newGameState('w', 1200, fenStart));
  return s.play(uci, 'user')!;
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('scoreMove', () => {
  it('rates the engine top move as Best', () => {
    const ply = plyFor(START, 'e2e4');
    const before = analysis(START, [line(30, ['e2e4', 'e7e5']), line(25, ['d2d4', 'd7d5'], 2)]);
    const after = analysis(ply.fenAfter, [line(-30, ['e7e5'])]);
    const r = scoreMove(ply, before, after);
    expect(r.classification).toBe('Best');
    expect(r.isEngineBest).toBe(true);
    expect(r.bestSan).toBe('e4');
  });

  it("uses the 'before' MultiPV score when the played move is among the lines", () => {
    const ply = plyFor(START, 'd2d4');
    const before = analysis(START, [line(30, ['e2e4']), line(-50, ['d2d4'], 2)]);
    const after = analysis(ply.fenAfter, [line(0, ['d7d5'])]); // would give loss 30 instead
    const r = scoreMove(ply, before, after);
    expect(r.cpLoss).toBe(80);
    expect(r.classification).toBe('Inaccuracy');
  });

  it("falls back to the 'after' search (negated) for moves outside MultiPV", () => {
    const ply = plyFor(START, 'f2f3');
    const before = analysis(START, [line(30, ['e2e4'])]);
    const after = analysis(ply.fenAfter, [line(200, ['e7e5'])]); // Black's POV: +2.00
    const r = scoreMove(ply, before, after);
    expect(r.playedCp).toBe(-200);
    expect(r.cpLoss).toBe(230);
    expect(r.winDrop).toBeCloseTo(20.4, 0);
    expect(r.classification).toBe('Blunder');
    expect(r.evalAfter).toBe(-200); // White POV
  });

  it('reports White-POV evals for Black moves', () => {
    const s = new Session(newGameState('b', 1200));
    s.play('e2e4', 'bot');
    const ply = s.play('g8h6', 'user')!;
    const before = analysis(ply.fenBefore, [line(-30, ['e7e5'])]);
    const after = analysis(ply.fenAfter, [line(400, ['d2d4'])]);
    const r = scoreMove(ply, before, after);
    expect(r.evalBefore).toBe(30);
    expect(r.evalAfter).toBe(400);
    expect(r.classification).toBe('Blunder');
  });

  it('treats delivering checkmate as Best with zero loss', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
    const ply = plyFor(fen, 'a1a8');
    const before = analysis(fen, [line(mateToCp(1), ['a1a8'])]);
    const r = scoreMove(ply, before, null);
    expect(r.cpLoss).toBe(0);
    expect(r.classification).toBe('Best');
    expect(mateIn(r.evalAfter)).toBe(0);
  });

  it('flags missing a mate in one (while still winning) as a Miss', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
    const ply = plyFor(fen, 'a1a7');
    const before = analysis(fen, [line(mateToCp(1), ['a1a8'])]);
    const after = analysis(ply.fenAfter, [line(-500, ['g8f8'])]);
    expect(scoreMove(ply, before, after).classification).toBe('Miss');
  });
});
