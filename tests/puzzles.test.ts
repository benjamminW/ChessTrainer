import { describe, expect, it } from 'vitest';
import { seededRng } from '../src/bot/selectMove';
import { PuzzleLine } from '../src/puzzles/line';
import { fromRecord, parseCsvRow, toRecord } from '../src/puzzles/parse';
import { RATING_CONFIG, expectedScore, kFactor, ratingChange } from '../src/puzzles/rating';
import { bandOf, bandsToTry, pickPuzzle } from '../src/puzzles/select';
import { STORE_CONFIG, dueCount, lastChange, markSeen, newStats, recordResult, reviewQueue } from '../src/puzzles/store';
import { describeThemes, themeName } from '../src/puzzles/themes';
import type { Puzzle } from '../src/puzzles/types';

// Real rows from lichess_db_puzzle.csv (2 Oct 2026 export).
const HEADER = 'PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate'.split(',');
// FEN has Black to move: Black's f2g3 is the setup move, so WHITE solves.
const WHITE_SOLVES =
  '00008,r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24,f2g3 e6e7 b2b1 b3c1 b1c1 h6c1,1811,76,95,10282,crushing hangingPiece long middlegame,https://lichess.org/787zsVup/black#48,,';
// FEN has White to move: White's d3d6 is the setup move, so BLACK solves.
const BLACK_SOLVES =
  '0000D,5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27,d3d6 f8d8 d6d8 f6d8,1529,74,96,37506,advantage endgame short,https://lichess.org/F8M8OS71#53,,';
const MATE_IN_1 =
  '0000H,r4rk1/pp3ppp/8/2bqp2b/3N4/P2Bn2P/1PPN1P2/R1BQ1RK1 w - - 1 15,d1h5 d5g2,1554,223,100,11,mate mateIn1 middlegame oneMove,https://lichess.org/EwHRkfas#29,French_Defense French_Defense_Tarrasch_Variation,';

describe('parsing Lichess rows', () => {
  it('reads every field', () => {
    const p = parseCsvRow(WHITE_SOLVES, HEADER);
    expect(p).toEqual({
      id: '00008',
      fen: 'r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24',
      moves: ['f2g3', 'e6e7', 'b2b1', 'b3c1', 'b1c1', 'h6c1'],
      rating: 1811,
      themes: ['crushing', 'hangingPiece', 'long', 'middlegame'],
    });
  });

  it('round-trips the compact JSON record', () => {
    const p = parseCsvRow(BLACK_SOLVES, HEADER);
    expect(fromRecord(toRecord(p))).toEqual(p);
  });
});

describe('Lichess move order', () => {
  it('auto-plays the first move and makes the other side the solver', () => {
    const line = new PuzzleLine(parseCsvRow(WHITE_SOLVES, HEADER));
    expect(line.solver).toBe('w');
    expect(line.expected()).toBeNull(); // opponent's move first
    const setup = line.playScripted();
    expect(setup.san).toBe('Bxg3');
    expect(line.expected()).toBe('e6e7');
  });

  it('alternates: my move, auto reply, my move … until solved', () => {
    const line = new PuzzleLine(parseCsvRow(WHITE_SOLVES, HEADER));
    line.playScripted();
    const r1 = line.tryMove('e6e7');
    expect(r1).toMatchObject({ kind: 'correct', reply: 'b2b1', solved: false });
    line.playScripted(); // b2b1
    expect(line.tryMove('b3c1')).toMatchObject({ kind: 'correct', reply: 'b1c1', solved: false });
    line.playScripted(); // b1c1
    expect(line.tryMove('h6c1')).toMatchObject({ kind: 'correct', reply: null, solved: true });
    expect(line.solved).toBe(true);
  });

  it('handles a Black-to-solve puzzle', () => {
    const line = new PuzzleLine(parseCsvRow(BLACK_SOLVES, HEADER));
    expect(line.solver).toBe('b');
    expect(line.playScripted().san).toBe('Qd6'); // White's setup move
    expect(line.chess.turn()).toBe('b');
    expect(line.tryMove('f8d8')).toMatchObject({ kind: 'correct', reply: 'd6d8', solved: false });
    expect(line.playScripted().san).toBe('Qxd8+');
    expect(line.tryMove('f6d8')).toMatchObject({ kind: 'correct', reply: null, solved: true });
  });

  it('rejects other moves without playing them, so the position can be retried', () => {
    const line = new PuzzleLine(parseCsvRow(WHITE_SOLVES, HEADER));
    line.playScripted();
    const fen = line.fen;
    expect(line.tryMove('h6h7')).toMatchObject({ kind: 'wrong' });
    expect(line.fen).toBe(fen);
    expect(line.tryMove('a1a8')).toEqual({ kind: 'illegal' });
    expect(line.tryMove('e6e7').kind).toBe('correct');
  });
});

describe('alternate checkmates', () => {
  it('accepts a different mating move than the listed one', () => {
    // After White's a4, Black has two back-rank mates: the listed ...Rb1# and ...Qd1#.
    const puzzle: Puzzle = {
      id: 'alt',
      fen: '6k1/5ppp/8/8/3q4/P7/1r4PP/7K w - - 0 1',
      moves: ['a3a4', 'b2b1'],
      rating: 900,
      themes: ['mateIn1'],
    };
    const line = new PuzzleLine(puzzle);
    line.playScripted();
    expect(line.tryMove('d4d1')).toMatchObject({ kind: 'correct', solved: true });
    expect(line.chess.isCheckmate()).toBe(true);
  });

  it('ends a longer line early on an alternate mate', () => {
    const line = new PuzzleLine({ id: 'alt2', fen: '6k1/5ppp/8/8/3q4/P7/1r4PP/7K w - - 0 1', moves: ['a3a4', 'b2b1', 'h1b1'], rating: 900, themes: [] });
    line.playScripted();
    expect(line.tryMove('d4d1')).toMatchObject({ kind: 'correct', solved: true });
    expect(line.solved).toBe(true);
  });

  it('still accepts the listed mate', () => {
    const line = new PuzzleLine(parseCsvRow(MATE_IN_1, HEADER));
    line.playScripted();
    expect(line.tryMove('d5g2')).toMatchObject({ kind: 'correct', solved: true });
  });

  it('a non-mating alternative is wrong', () => {
    const line = new PuzzleLine(parseCsvRow(MATE_IN_1, HEADER));
    line.playScripted();
    expect(line.tryMove('d5d4').kind).toBe('wrong');
  });
});

describe('rating math', () => {
  it('expected score is 0.5 for equal ratings and symmetric', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5);
    expect(expectedScore(1500, 1900) + expectedScore(1900, 1500)).toBeCloseTo(1);
  });

  it('uses a larger K while provisional', () => {
    expect(kFactor(0)).toBe(RATING_CONFIG.kProvisional);
    expect(kFactor(RATING_CONFIG.provisionalPuzzles - 1)).toBe(RATING_CONFIG.kProvisional);
    expect(kFactor(RATING_CONFIG.provisionalPuzzles)).toBe(RATING_CONFIG.k);
  });

  it('gains more for harder puzzles and loses more on easy ones', () => {
    expect(ratingChange(1200, 1200, 'solved', 0)).toBe(20); // 40 × 0.5
    expect(ratingChange(1200, 1200, 'failed', 0)).toBe(-20);
    expect(ratingChange(1200, 1600, 'solved', 50)).toBeGreaterThan(ratingChange(1200, 1200, 'solved', 50));
    expect(ratingChange(1200, 800, 'failed', 50)).toBeLessThan(ratingChange(1200, 1200, 'failed', 50));
  });

  it('assisted solves change nothing', () => {
    expect(ratingChange(1200, 2000, 'assisted', 0)).toBe(0);
  });

  it('never drops below the floor', () => {
    expect(1200 + ratingChange(RATING_CONFIG.floor, 2500, 'failed', 0)).toBeGreaterThanOrEqual(RATING_CONFIG.floor);
    expect(RATING_CONFIG.floor + ratingChange(RATING_CONFIG.floor, 400, 'failed', 0)).toBe(RATING_CONFIG.floor);
  });
});

describe('progress store', () => {
  const p = (id: string, rating = 1200): Puzzle => ({ id, fen: '8/8/8/8/8/8/8/K6k w - - 0 1', moves: [], rating, themes: [] });

  it('records rated results, history and the latest change', () => {
    const s = newStats();
    const change = recordResult(s, p('a'), 'solved', false);
    expect(change).toBe(20);
    expect(s.rating).toBe(1220);
    expect(s.ratedPlayed).toBe(1);
    expect(s.solved).toEqual(['a']);
    expect(s.history[0]).toMatchObject({ id: 'a', result: 'solved', change: 20, rating: 1220 });
    expect(lastChange(s)).toBe(20);
  });

  it('queues failures for review and brings them back later', () => {
    const s = newStats();
    recordResult(s, p('bad'), 'failed', false);
    expect(s.review).toHaveLength(1);
    expect(dueCount(s)).toBe(0);
    for (let i = 0; i < STORE_CONFIG.reviewDelay; i++) recordResult(s, p(`x${i}`), 'solved', false);
    expect(dueCount(s)).toBe(1);
    expect(reviewQueue(s)[0].puzzle[0]).toBe('bad');
  });

  it('review attempts are unrated; solving removes the puzzle, failing pushes it back', () => {
    const s = newStats();
    recordResult(s, p('bad'), 'failed', false);
    const rating = s.rating;
    recordResult(s, p('bad'), 'failed', true);
    expect(s.rating).toBe(rating);
    expect(s.review[0].attempts).toBe(1);
    expect(s.review[0].dueAt).toBe(s.ratedPlayed + STORE_CONFIG.reviewRetryDelay);
    recordResult(s, p('bad'), 'solved', true);
    expect(s.review).toHaveLength(0);
    expect(s.rating).toBe(rating);
  });

  it('keeps the recent list capped and de-duplicated', () => {
    const s = newStats();
    for (let i = 0; i < STORE_CONFIG.recentLimit + 20; i++) markSeen(s, `p${i}`);
    markSeen(s, `p${STORE_CONFIG.recentLimit + 19}`);
    expect(s.recent).toHaveLength(STORE_CONFIG.recentLimit);
    expect(new Set(s.recent).size).toBe(s.recent.length);
  });
});

describe('puzzle selection', () => {
  const pool: Puzzle[] = Array.from({ length: 40 }, (_, i) => ({
    id: `p${i}`, fen: '', moves: [], rating: 1200 + i * 5, themes: i % 4 === 0 ? ['fork'] : ['pin'],
  }));

  it('never serves recently seen puzzles', () => {
    const exclude = new Set(pool.slice(0, 39).map((p) => p.id));
    const rnd = seededRng(1);
    for (let i = 0; i < 20; i++) expect(pickPuzzle(pool, { target: 1200, exclude, theme: 'all', random: rnd })!.id).toBe('p39');
    expect(pickPuzzle(pool, { target: 1200, exclude: new Set(pool.map((p) => p.id)), theme: 'all', random: rnd })).toBeNull();
  });

  it('serves puzzles near the target, with some variety', () => {
    const rnd = seededRng(2);
    const picks = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = pickPuzzle(pool, { target: 1300, exclude: new Set(), theme: 'all', random: rnd })!;
      expect(Math.abs(p.rating - 1300)).toBeLessThanOrEqual(30);
      picks.add(p.id);
    }
    expect(picks.size).toBeGreaterThan(3);
  });

  it('filters by theme', () => {
    const p = pickPuzzle(pool, { target: 1300, exclude: new Set(), theme: 'fork', random: seededRng(3) })!;
    expect(p.themes).toContain('fork');
  });

  it('tries the nearest bands first', () => {
    const bands = [400, 500, 600, 700, 800];
    expect(bandOf(640, bands)).toBe(600);
    expect(bandOf(3000, bands)).toBe(800);
    expect(bandsToTry(640, bands)).toEqual([600, 500, 700, 400, 800]);
  });
});

describe('theme names', () => {
  it('turns tags into plain English, tactics first', () => {
    expect(themeName('backRankMate')).toBe('back rank mate');
    expect(themeName('someNewTag')).toBe('some new tag');
    expect(describeThemes(['short', 'middlegame', 'fork'])).toEqual(['fork', 'short puzzle', 'middlegame']);
  });
});
