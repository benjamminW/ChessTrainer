import { describe, expect, it } from 'vitest';
import { ESTIMATE_CONFIG, RATING_CALIBRATION, estimateRating, ratingFromDrop, tableFor, type Calibration } from '../src/coach/estimate';
import { buildGameReview, gameAccuracy, moveAccuracy } from '../src/coach/gameReview';
import { countMoves, excludeReason, isEvenRecapture, winPercent, type CountedSide, type RatedMove } from '../src/coach/ratingMoves';
import { MATE_CP } from '../src/config/coach';
import { Session, newGameState } from '../src/game/session';
import type { Classification, PlyRecord } from '../src/types';

/** A fixed calibration so the tests don't depend on the generated table. */
const CAL: Calibration = {
  source: 'test',
  scale: 'lichess',
  classes: {
    all: { samples: 10000, sigma40: 500, table: [[2, 2500], [4, 1700], [6, 1100], [8, 700]] },
    bullet: { samples: 5000, sigma40: 600, table: [[2.5, 2500], [4.5, 1700], [6.5, 1100], [8.5, 700]] },
    blitz: { samples: 5000, sigma40: 500, table: [[2, 2600], [4, 1800], [6, 1200], [8, 800]] },
    rapid: { samples: 100, sigma40: 450, table: [[1, 3000], [9, 400]] },
  },
};

const side = (drops: number[]): CountedSide => ({ drops, excluded: { book: 0, forced: 0, allEqual: 0, recapture: 0, decided: 0 } });
const move = (o: Partial<RatedMove> = {}): RatedMove => ({ color: 'w', winBefore: 50, winAfter: 47, inBook: false, legalMoves: 20, gapWin: null, evenRecapture: false, ...o });

/** A legal game of knight shuffles (no captures, ~20 legal moves each) with the given evals. */
function game(n: number, evalAfter: (i: number) => number, cls: (i: number) => Classification = () => 'Good'): PlyRecord[] {
  const s = new Session(newGameState('w', 1200));
  const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  for (let i = 0; i < n; i++) s.play(cycle[i % 4], 'user');
  let before = 20;
  s.plies.forEach((p, i) => {
    const after = evalAfter(i);
    p.review = {
      classification: cls(i), cpLoss: 0, evalBefore: before, evalAfter: after, bestUci: null, bestSan: null,
      explanation: { headline: '', details: [], pvSan: [] }, model: 2, depth: 18,
    };
    before = after;
  });
  return s.plies;
}

describe('which moves count', () => {
  it('leaves out book, forced, all-equal and even-recapture moves', () => {
    expect(excludeReason(move({ inBook: true }))).toBe('book');
    expect(excludeReason(move({ legalMoves: 1 }))).toBe('forced');
    expect(excludeReason(move({ legalMoves: 2, gapWin: 1 }))).toBe('allEqual');
    expect(excludeReason(move({ legalMoves: 2, gapWin: 10 }))).toBeNull();
    expect(excludeReason(move({ legalMoves: 2, gapWin: null }))).toBeNull();
    expect(excludeReason(move({ evenRecapture: true }))).toBe('recapture');
    expect(excludeReason(move())).toBeNull();
  });

  it('spots the first recapture after an even trade', () => {
    // 1. e4 d5 2. exd5 Qxd5: pawn takes pawn, queen takes back.
    const s = new Session(newGameState('w', 1200));
    for (const m of ['e2e4', 'd7d5', 'e4d5', 'd8d5']) s.play(m, 'user');
    const [, , exd5, qxd5] = s.plies;
    expect(isEvenRecapture(qxd5.fenBefore, qxd5.uci, exd5)).toBe(true);
    // Bishop takes a knight, pawn takes back: even (3 for 3).
    const t = new Session(newGameState('w', 1200));
    for (const m of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5c6', 'd7c6']) t.play(m, 'user');
    expect(isEvenRecapture(t.plies[7].fenBefore, t.plies[7].uci, t.plies[6])).toBe(true);
    // Not a recapture: a capture elsewhere.
    expect(isEvenRecapture(t.plies[5].fenBefore, t.plies[5].uci, t.plies[4])).toBe(false);
    expect(isEvenRecapture(t.plies[0].fenBefore, t.plies[0].uci, null)).toBe(false);
  });

  it('stops counting for both sides once the game is decided', () => {
    const moves = [move(), move({ color: 'b' }), move({ winBefore: 96, winAfter: 96 }), move({ color: 'b', winBefore: 4, winAfter: 1 }), move({ winBefore: 60, winAfter: 20 })];
    const c = countMoves(moves);
    expect(c.decidedAt).toBe(2);
    expect(c.w.drops).toEqual([3]);
    expect(c.b.drops).toEqual([3]);
    expect(c.w.excluded.decided).toBe(2);
    expect(c.b.excluded.decided).toBe(1);
    expect(c.reasons).toEqual([null, null, 'decided', 'decided', 'decided']);
  });
});

describe('estimated rating', () => {
  it('returns no number for a game of only book and forced moves', () => {
    const plies = game(30, () => 20, () => 'Book');
    const r = buildGameReview(plies, 'w');
    expect(r.stats.w.rating?.status).toBe('few');
    expect(r.stats.w.rating?.counted).toBe(0);
    expect(r.stats.w.rating?.excluded.book).toBe(15);
    const forced = countMoves(Array(20).fill(move({ legalMoves: 1 })));
    expect(estimateRating(forced.w, {}, CAL)?.status).toBe('few');
  });

  it('stops counting a one-sided game at the point it was decided', () => {
    // White's eval climbs 40 cp a move: decided (>95% for the side to move) after a while.
    const plies = game(80, (i) => 20 + 40 * (i + 1));
    const r = buildGameReview(plies, 'w');
    const est = r.stats.w.rating!;
    expect(est.excluded.decided).toBeGreaterThan(10);
    expect(est.counted + est.excluded.decided).toBe(40);
  });

  it('maps the same moves differently by time class, with a fallback for small samples', () => {
    const drops = side(Array(40).fill(4));
    expect(estimateRating(drops, { timeClass: 'blitz' }, CAL)!.mid).toBe(1800);
    expect(estimateRating(drops, { timeClass: 'bullet' }, CAL)!.mid).toBe(1900);
    // Rapid has only 100 calibration games: the general table is used.
    expect(tableFor('rapid', CAL).id).toBe('all');
    expect(estimateRating(drops, { timeClass: 'rapid' }, CAL)!.mid).toBe(1700);
    expect(ratingFromDrop(3, CAL.classes.all!.table)).toBe(2100);
  });

  it('shrinks toward the known rating, more in short games, and caps short games', () => {
    // Drop 2 → 2500 raw. Known rating 1500.
    const short = estimateRating(side(Array(20).fill(2)), { known: 1500 }, CAL)!;
    const long = estimateRating(side(Array(60).fill(2)), { known: 1500 }, CAL)!;
    expect(short.raw).toBe(2500);
    expect(short.shrunk).toBe(true);
    // 20 moves: weight 20/45 → ~1944, then capped at 1500 + 200.
    expect(short.capped).toBe(true);
    expect(short.mid).toBe(1700);
    // 60 moves: weight 60/85 → ~2206, no cap from 30 moves up.
    expect(long.capped).toBe(false);
    expect(long.mid).toBe(2200);
    expect(long.mid).toBeGreaterThan(short.mid);
    // No known rating (games against the coach): no shrinkage.
    expect(estimateRating(side(Array(20).fill(2)), {}, CAL)!.mid).toBe(2500);
  });

  it('narrows the range as more moves are counted', () => {
    const widths = [15, 30, 60, 120].map((n) => {
      const e = estimateRating(side(Array(n).fill(5)), {}, CAL)!;
      return e.high - e.low;
    });
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeLessThan(widths[i - 1]);
  });

  it('needs at least 15 counted moves', () => {
    expect(estimateRating(side(Array(14).fill(3)), {}, CAL)!.status).toBe('few');
    expect(estimateRating(side(Array(15).fill(3)), {}, CAL)!.status).toBe('ok');
  });

  it('clamps to the app range and flags shallow analysis', () => {
    const top = estimateRating(side(Array(60).fill(0)), { depth: 13 }, CAL)!;
    expect(top.high).toBe(ESTIMATE_CONFIG.ceiling);
    expect(top.clamped).toBe(true);
    expect(top.lowConfidence).toBe(true);
    expect(estimateRating(side(Array(60).fill(3)), { depth: 18 }, CAL)!.lowConfidence).toBe(false);
    const bottom = estimateRating(side(Array(60).fill(30)), {}, CAL)!;
    expect(bottom.low).toBe(ESTIMATE_CONFIG.floor);
  });

  it('handles mate scores without breaking the math', () => {
    expect(winPercent(MATE_CP - 3)).toBeCloseTo(100);
    expect(winPercent(-MATE_CP + 3)).toBeCloseTo(0);
    const plies = game(40, (i) => (i < 30 ? 20 : MATE_CP - 5));
    const r = buildGameReview(plies, 'w');
    for (const c of ['w', 'b'] as const) {
      const est = r.stats[c].rating!;
      expect(Number.isFinite(est.mid)).toBe(true);
      expect(Number.isFinite(r.stats[c].accuracy!)).toBe(true);
    }
    expect(r.stats.w.rating!.excluded.decided).toBeGreaterThan(0);
  });

  it('says when an older review was recalculated', () => {
    const plies = game(40, () => 20);
    expect(buildGameReview(plies, 'w', { analyzedAt: '2026-01-05T10:00:00Z' }).ratingRecalculated).toBe(true);
    expect(buildGameReview(plies, 'w', { analyzedAt: '2099-01-01T00:00:00Z' }).ratingRecalculated).toBe(false);
    expect(buildGameReview(plies, 'w').ratingRecalculated).toBe(false);
  });

  it('ships a calibration table sorted by drop, falling as drop rises', () => {
    const t = RATING_CALIBRATION.classes.all!.table;
    expect(t.length).toBeGreaterThan(3);
    for (let i = 1; i < t.length; i++) {
      expect(t[i][0]).toBeGreaterThan(t[i - 1][0]);
      expect(t[i][1]).toBeLessThanOrEqual(t[i - 1][1]);
    }
  });
});

describe('game accuracy (Lichess method)', () => {
  // White's win% path for a 20-ply game: all moves perfect except where noted.
  const path = (drops: Record<number, number>) => {
    let w = 50;
    const out = [w];
    for (let i = 0; i < 20; i++) out.push((w = Math.max(0, w - (drops[i] ?? 0))));
    return out;
  };

  it('scores perfect play 100 and lets bad moves pull it down hard', () => {
    const perfect = gameAccuracy(path({}), 'w');
    expect(perfect.w).toBeCloseTo(100, 0);
    expect(perfect.b).toBeCloseTo(100, 0);
    // One 30-point blunder among ten White moves.
    const oneBlunder = gameAccuracy(path({ 4: 30 }), 'w').w!;
    const plainMean = (9 * 100 + moveAccuracy(50, 20)) / 10;
    expect(oneBlunder).toBeLessThan(plainMean);
    expect(oneBlunder).toBeLessThan(80);
  });

  it("charges each side only for its own moves (Black's view of White's win% is mirrored)", () => {
    // Odd plies are Black's: White's win% rising there is Black losing ground.
    let w = 50;
    const p = [w];
    for (let i = 0; i < 20; i++) p.push((w = i % 2 ? Math.min(100, w + 6) : w));
    const acc = gameAccuracy(p, 'w');
    expect(acc.w).toBeCloseTo(100, 0);
    expect(acc.b!).toBeLessThan(80);
  });

  it('handles Black moving first and empty games', () => {
    expect(gameAccuracy([50, 50, 50], 'b')).toEqual({ w: expect.closeTo(100, 0), b: expect.closeTo(100, 0) });
    expect(gameAccuracy([50], 'w')).toEqual({ w: null, b: null });
  });

  it('is what the review shows once every move is analyzed', () => {
    const plies = game(40, (i) => (i === 20 ? -500 : 20));
    const r = buildGameReview(plies, 'w');
    const win = [winPercent(plies[0].review!.evalBefore), ...plies.map((p) => winPercent(p.review!.evalAfter))];
    expect(r.stats.w.accuracy).toBeCloseTo(gameAccuracy(win, 'w').w!, 6);
  });
});
