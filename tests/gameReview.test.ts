import { describe, expect, it } from 'vitest';
import { buildGameReview, moveAccuracy, winPercent } from '../src/coach/gameReview';
import { Session, newGameState } from '../src/game/session';
import type { Classification, PlyRecord } from '../src/types';

/** Plays `moves` (alternating, user = White) and attaches fake reviews: [classification, evalBefore, evalAfter, cpLoss]. */
function game(moves: string[], reviews: [Classification, number, number, number][]): PlyRecord[] {
  const s = new Session(newGameState('w', 1200));
  moves.forEach((m, i) => {
    const ply = s.play(m, i % 2 === 0 ? 'user' : 'bot')!;
    const r = reviews[i];
    if (r) {
      ply.review = {
        classification: r[0], evalBefore: r[1], evalAfter: r[2], cpLoss: r[3],
        bestUci: null, bestSan: 'Nf3',
        explanation: { headline: `${r[0]}.`, details: [`Reason for ${ply.san}.`], pvSan: [], tip: r[0] === 'Blunder' ? 'Blunder check.' : undefined },
      };
    }
  });
  return s.plies;
}

describe('win% and accuracy', () => {
  it('maps evals to winning chances', () => {
    expect(winPercent(0)).toBeCloseTo(50);
    expect(winPercent(300)).toBeGreaterThan(70);
    expect(winPercent(-300)).toBeLessThan(30);
    expect(winPercent(100000)).toBeCloseTo(100);
  });

  it('gives 100% for keeping your chances and less for dropping them', () => {
    expect(moveAccuracy(60, 60)).toBeCloseTo(100, 2);
    expect(moveAccuracy(60, 65)).toBeCloseTo(100, 2); // engine noise in your favour
    expect(moveAccuracy(60, 50)).toBeLessThan(70);
    expect(moveAccuracy(90, 10)).toBeLessThan(1);
  });
});

describe('buildGameReview', () => {
  const MOVES = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'd7d5'];
  const plies = game(MOVES, [
    ['Best', 30, 30, 0],
    ['Good', 30, 45, 15],
    ['Best', 45, 40, 0],
    ['Blunder', 40, 400, 360], // the coach blunders...
    ['Inaccuracy', 400, 300, 100], // ...and you only half punish it: a missed chance
    ['Good', 300, 320, 20],
    ['Blunder', 320, -500, 820], // your big blunder: the turning point
    ['Best', -500, -500, 0],
  ]);

  it("counts each side's moves by class", () => {
    const r = buildGameReview(plies, 'w');
    expect(r.stats.w.counts).toMatchObject({ Best: 2, Good: 0, Inaccuracy: 1, Mistake: 0, Blunder: 1, Miss: 0, Brilliant: 0 });
    expect(r.stats.b.counts).toMatchObject({ Best: 1, Good: 2, Inaccuracy: 0, Mistake: 0, Blunder: 1 });
    expect(Object.keys(r.stats.w.counts)).toHaveLength(10);
    expect(r.stats.w.moves).toBe(4);
    expect(r.stats.w.acpl).toBeCloseTo((0 + 0 + 100 + 820) / 4);
    expect(r.pending).toBe(0);
  });

  it('rates the side that played cleaner as more accurate', () => {
    const clean = buildGameReview(game(MOVES.slice(0, 4), [['Best', 30, 30, 0], ['Best', 30, 30, 0], ['Best', 30, 30, 0], ['Best', 30, 30, 0]]), 'w');
    expect(clean.stats.w.accuracy).toBeCloseTo(100, 2);
    const r = buildGameReview(plies, 'w');
    expect(r.stats.w.accuracy!).toBeLessThan(80);
  });

  it("lists only the user's bad moves, tagging the turning point and missed chances", () => {
    const r = buildGameReview(plies, 'w');
    expect(r.moments.map((m) => m.ply.san)).toEqual(['Bc4', 'Ng5']);
    const [missed, turning] = r.moments;
    expect(missed.missedChance).toBe(true);
    expect(missed.turningPoint).toBe(false);
    expect(turning.turningPoint).toBe(true);
    expect(turning.bestEval).toBe('+3.20');
    expect(turning.reason).toBe('Reason for Ng5.');
    expect(turning.tip).toBe('Blunder check.');
  });

  it('writes a summary', () => {
    const s = buildGameReview(plies, 'w').summary.join(' ');
    expect(s).toContain('You made 1 blunder and 1 inaccuracy.');
    expect(s).toContain('The turning point was 4. Ng5');
    expect(s).toContain('You missed 1 chance');
  });

  it('praises a clean game', () => {
    const r = buildGameReview(game(MOVES.slice(0, 2), [['Best', 30, 30, 0], ['Good', 30, 45, 15]]), 'w');
    expect(r.moments).toEqual([]);
    expect(r.summary[0]).toMatch(/A clean game/);
  });

  it('reviews from Black’s side too', () => {
    const r = buildGameReview(plies, 'b');
    expect(r.moments.map((m) => m.ply.san)).toEqual(['Nc6']);
    expect(r.moments[0].missedChance).toBe(false);
  });

  it('builds the eval curve and reports moves still being analysed', () => {
    const partial = game(MOVES.slice(0, 3), [['Best', 30, 30, 0]]);
    const r = buildGameReview(partial, 'w');
    expect(r.evals).toEqual([30, 30, null, null]);
    expect(r.pending).toBe(2);
  });

  it('breaks accuracy down by phase', () => {
    const r = buildGameReview(plies, 'w');
    expect(r.phases.map((p) => p.phase)).toEqual(['opening']);
    expect(r.phases[0].mistakes).toBe(2);
  });
});
