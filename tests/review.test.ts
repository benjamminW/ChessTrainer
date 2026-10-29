import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { cpLoss } from '../src/coach/classify';
import { gamePhase } from '../src/coach/facts';
import { moveAccuracy, winPercent } from '../src/coach/gameReview';
import { RuleBasedProvider } from '../src/coach/ruleBased';
import { PRESETS, REVIEW_CONFIG } from '../src/config/review';
import { mateToCp, type Analysis, type SearchOptions } from '../src/engine/uci';
import { AnalysisQueue, analyzeGame } from '../src/review/analyzer';
import { cacheUsable, memoryStore } from '../src/review/cache';
import { ChessComClient, ChessComError, isPastMonth, type ChessComGame } from '../src/review/chesscom';
import { buildBook, identifyOpening } from '../src/review/openings';
import { computePatterns, userResult } from '../src/review/patterns';
import { endingOf, extractClocks, importPgn, parseClock, parseTimeControl, timeSpent } from '../src/review/pgn';
import { mistakeToPuzzle } from '../src/review/toPuzzle';
import type { GameAnalysis, MoveAnalysis } from '../src/review/types';

// ---------------------------------------------------------------- fixtures

const pgn = (headers: Record<string, string>, moves: string) =>
  Object.entries(headers).map(([k, v]) => `[${k} "${v}"]`).join('\n') + '\n\n' + moves + '\n';

const BASE = { Event: 'Live Chess', Site: 'Chess.com', White: 'alice', Black: 'bob', WhiteElo: '1500', BlackElo: '1520', TimeControl: '180+2', Link: 'https://www.chess.com/game/live/1' };

// Black (bob) wins by checkmate — a black-side game for bob.
const FOOLS_MATE = pgn({ ...BASE, Result: '0-1', Termination: 'bob won by checkmate' },
  '1. f3 {[%clk 0:03:01]} 1... e5 {[%clk 0:03:00]} 2. g4 {[%clk 0:02:55]} 2... Qh4# {[%clk 0:02:58]} 0-1');
const RESIGNED = pgn({ ...BASE, Result: '1-0', Termination: 'alice won by resignation' },
  '1. e4 {[%clk 0:03:00]} 1... e5 {[%clk 0:03:00]} 2. Qh5 {[%clk 0:02:59]} 2... Ke7 {[%clk 0:02:58]} 1-0');
const TIMEOUT = pgn({ ...BASE, Result: '0-1', Termination: 'bob won on time' },
  '1. d4 {[%clk 0:00:30]} 1... d5 {[%clk 0:02:59]} 0-1');
// Knights shuffle: positions repeat, so position-keyed comments would collapse.
const REPEAT = pgn({ ...BASE, Result: '1/2-1/2', Termination: 'Game drawn by repetition' },
  '1. Nf3 {[%clk 0:03:00]} 1... Nf6 {[%clk 0:03:00]} 2. Ng1 {[%clk 0:02:59]} 2... Ng8 {[%clk 0:02:59]} 3. Nf3 {[%clk 0:02:58]} 3... Nf6 {[%clk 0:02:58]} 4. Ng1 {[%clk 0:02:57]} 4... Ng8 {[%clk 0:02:57]} 1/2-1/2');

function chessComGame(over: Partial<ChessComGame> = {}): ChessComGame {
  return {
    url: 'https://www.chess.com/game/live/1', pgn: FOOLS_MATE, time_control: '180+2', time_class: 'blitz', rules: 'chess', end_time: 1_790_000_000,
    white: { username: 'alice', rating: 1500, result: 'checkmated' }, black: { username: 'bob', rating: 1520, result: 'win' }, ...over,
  };
}

// ---------------------------------------------------------------- PGN import

describe('PGN import', () => {
  it('reads moves, players, ratings and clocks', () => {
    const g = importPgn(FOOLS_MATE);
    expect(g.moves.map((m) => m.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(g.white).toEqual({ name: 'alice', rating: 1500 });
    expect(g.black).toEqual({ name: 'bob', rating: 1520 });
    expect(g.hasClocks).toBe(true);
    expect(g.moves.map((m) => m.clock)).toEqual([181, 180, 175, 178]);
    expect(g.timeControl).toEqual({ base: 180, increment: 2 });
    expect(g.url).toBe('https://www.chess.com/game/live/1');
  });

  it('works out time spent per move, using the increment', () => {
    expect(timeSpent(importPgn(FOOLS_MATE))).toEqual([1, 2, 8, 4]);
  });

  it('keeps every clock when positions repeat (chess.js comments would collapse them)', () => {
    const g = importPgn(REPEAT);
    expect(extractClocks(REPEAT)).toHaveLength(8);
    expect(g.moves.every((m) => m.clock !== null)).toBe(true);
    expect(g.moves[7].clock).toBe(177);
  });

  it('recognizes checkmate, resignation, timeout and draws', () => {
    expect(importPgn(FOOLS_MATE).ending).toBe('checkmate');
    expect(importPgn(RESIGNED).ending).toBe('resignation');
    expect(importPgn(TIMEOUT).ending).toBe('timeout');
    expect(importPgn(REPEAT).ending).toBe('draw');
    // From chess.com result codes (the loser's code says how)
    expect(endingOf('win', 'resigned')).toBe('resignation');
    expect(endingOf('timeout', 'win')).toBe('timeout');
    expect(endingOf('checkmated', 'win')).toBe('checkmate');
    expect(endingOf('repetition', 'repetition')).toBe('draw');
  });

  it('handles a game without clocks and daily time controls', () => {
    const g = importPgn(pgn({ ...BASE, Result: '*' }, '1. e4 e5 *'));
    expect(g.hasClocks).toBe(false);
    expect(timeSpent(g)).toEqual([null, null]);
    expect(parseTimeControl('1/86400')).toBeNull();
    expect(parseClock('1:02:03.5')).toBeCloseTo(3723.5);
  });

  it('knows which side you were and your result', () => {
    const g = chessComGame();
    expect(userResult(g, 'b')).toBe('win');
    expect(userResult(g, 'w')).toBe('loss');
    expect(userResult(chessComGame({ white: { username: 'a', rating: 1, result: 'agreed' }, black: { username: 'b', rating: 1, result: 'agreed' } }), 'w')).toBe('draw');
  });
});

// ---------------------------------------------------------------- CPL, accuracy, phases

describe('centipawn loss and accuracy', () => {
  it('handles mate scores', () => {
    // Missing a mate in 2 for a +3 position: loss is clamped to the cap.
    expect(cpLoss(mateToCp(2), 300)).toBe(700);
    // Walking into mate is the maximum loss.
    expect(cpLoss(0, mateToCp(-1))).toBe(1000);
    expect(winPercent(mateToCp(3))).toBeCloseTo(100, 3);
    expect(winPercent(mateToCp(-3))).toBeCloseTo(0, 3);
    expect(moveAccuracy(winPercent(mateToCp(3)), winPercent(300))).toBeLessThan(50);
    expect(moveAccuracy(50, 50)).toBeCloseTo(100, 2);
  });
});

describe('phase detection', () => {
  it('follows the documented heuristic', () => {
    expect(gamePhase(new Chess())).toBe('opening');
    expect(gamePhase(new Chess('r1bq1rk1/pp2bppp/2n2n2/3p4/3P4/2N2N2/PP2BPPP/R1BQ1RK1 w - - 0 12'))).toBe('middlegame');
    // Queens off and ≤ 26 points of pieces → endgame, even early.
    expect(gamePhase(new Chess('r1b1kb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1B1KB1R w KQkq - 0 5'))).toBe('opening');
    expect(gamePhase(new Chess('2r3k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 30'))).toBe('endgame');
  });
});

// ---------------------------------------------------------------- analysis with a fake engine

/** A deterministic fake engine: the first legal move scores +20, the rest −80. */
function fakeAnalyze(calls: string[] = []) {
  return async (fen: string, opts: SearchOptions): Promise<Analysis> => {
    calls.push(fen);
    const moves = new Chess(fen).moves({ verbose: true });
    const lines = moves.slice(0, opts.multiPv).map((m, i) => ({ multipv: i + 1, depth: opts.depth, cp: i === 0 ? 20 : -80, mate: null, pv: [m.from + m.to + (m.promotion ?? '')] }));
    return { fen, depth: opts.depth, lines, bestmove: lines[0]?.pv[0] ?? null };
  };
}
const control = { waitIfPaused: async () => {}, cancelled: () => false };

describe('analyzeGame', () => {
  it('scores every move, explains your mistakes and records phase and clock', async () => {
    const g = importPgn(FOOLS_MATE);
    const a = (await analyzeGame(g, 'b', PRESETS.quick, fakeAnalyze(), new RuleBasedProvider(), null, control, () => {}))!;
    expect(a.moves).toHaveLength(4);
    expect(a.depth).toBe(PRESETS.quick.depth);
    expect(a.userColor).toBe('b');
    expect(a.moves[3].classification).toBe('Best'); // delivering mate
    expect(a.moves.every((m) => m.phase === 'opening')).toBe(true);
    expect(a.moves[1].clockBefore).toBe(180);
    expect(a.moves[1].spent).toBe(2);
    expect(a.accuracy.b).not.toBeNull();
  });

  it('stops when cancelled', async () => {
    let n = 0;
    const res = await analyzeGame(importPgn(REPEAT), 'w', PRESETS.quick, fakeAnalyze(), new RuleBasedProvider(), null,
      { waitIfPaused: async () => {}, cancelled: () => ++n > 3 }, () => {});
    expect(res).toBeNull();
  });
});

// ---------------------------------------------------------------- cache

describe('cache hit and skip', () => {
  const cached = (depth: number, version = REVIEW_CONFIG.analysisVersion) => ({ depth, version }) as GameAnalysis;

  it('uses a cached analysis at the same or greater depth only', () => {
    expect(cacheUsable(undefined, 14, 1)).toBe(false);
    expect(cacheUsable(cached(14), 14, REVIEW_CONFIG.analysisVersion)).toBe(true);
    expect(cacheUsable(cached(18), 14, REVIEW_CONFIG.analysisVersion)).toBe(true);
    expect(cacheUsable(cached(14), 18, REVIEW_CONFIG.analysisVersion)).toBe(false);
    expect(cacheUsable(cached(18, 0), 14, REVIEW_CONFIG.analysisVersion)).toBe(false);
  });

  it('the queue skips cached games and re-analyzes for a deeper preset', async () => {
    const store = memoryStore<GameAnalysis>();
    const game = importPgn(FOOLS_MATE);
    const calls: string[] = [];
    const analyzed: GameAnalysis[] = [];
    const queue = new AnalysisQueue({
      analyze: fakeAnalyze(calls), provider: new RuleBasedProvider(), store, book: async () => null,
      onChange: () => {}, onAnalyzed: (a) => analyzed.push(a),
    });
    const until = async () => { while (queue.active) await new Promise((r) => setTimeout(r, 5)); };

    queue.enqueue([{ game, userColor: 'b', label: 'g' }], PRESETS.quick);
    await until();
    expect(queue.jobs[0].status).toBe('done');
    const first = calls.length;
    expect(first).toBeGreaterThan(0);
    expect(await store.get(game.url)).toBeDefined();

    queue.enqueue([{ game, userColor: 'b', label: 'g' }], PRESETS.quick);
    await until();
    expect(queue.jobs[0].status).toBe('cached');
    expect(calls.length).toBe(first); // no engine work

    queue.enqueue([{ game, userColor: 'b', label: 'g' }], PRESETS.deep);
    await until();
    expect(queue.jobs[0].status).toBe('done');
    expect(calls.length).toBeGreaterThan(first);
    expect((await store.get(game.url))!.depth).toBe(PRESETS.deep.depth);
  });

  it('knows which monthly archives are finished', () => {
    const now = new Date('2026-10-29T12:00:00Z');
    expect(isPastMonth('https://api.chess.com/pub/player/x/games/2026/09', now)).toBe(true);
    expect(isPastMonth('https://api.chess.com/pub/player/x/games/2026/10', now)).toBe(false);
    expect(isPastMonth('https://api.chess.com/pub/player/x/games/2025/12', now)).toBe(true);
  });
});

// ---------------------------------------------------------------- chess.com client

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('Chess.com client', () => {
  it('returns archives newest first', async () => {
    const fetch = vi.fn(async () => json({ archives: ['a/2026/08', 'a/2026/09', 'a/2026/10'] }));
    const c = new ChessComClient({ fetch });
    expect(await c.archives('Bob')).toEqual(['a/2026/10', 'a/2026/09', 'a/2026/08']);
    expect(fetch).toHaveBeenCalledWith('https://api.chess.com/pub/player/bob/games/archives');
  });

  it('reports an unknown username clearly (404)', async () => {
    const c = new ChessComClient({ fetch: async () => json({ code: 0, message: 'not found' }, 404) });
    const err = await c.archives('nobody').catch((e) => e);
    expect(err).toBeInstanceOf(ChessComError);
    expect(err.kind).toBe('not-found');
    expect(err.message).toContain('nobody');
  });

  it('backs off and retries on 429, honoring Retry-After', async () => {
    const waits: number[] = [];
    let n = 0;
    const c = new ChessComClient({
      fetch: async () => (++n < 3 ? json({}, 429, n === 2 ? { 'retry-after': '5' } : {}) : json({ games: [] })),
      backoffMs: [100, 200, 400],
      sleep: async (ms) => void waits.push(ms),
    });
    expect(await c.month('a/2026/10')).toEqual([]);
    expect(waits).toEqual([100, 5000]);
  });

  it('gives up after repeated 429s', async () => {
    const c = new ChessComClient({ fetch: async () => json({}, 429), backoffMs: [1, 1], sleep: async () => {} });
    const err = await c.month('x').catch((e) => e);
    expect(err.kind).toBe('rate-limited');
  });

  it('reports network failures', async () => {
    const c = new ChessComClient({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
    expect((await c.archives('bob').catch((e) => e)).kind).toBe('network');
  });

  it('never sends requests in parallel', async () => {
    let inFlight = 0;
    let max = 0;
    const c = new ChessComClient({
      fetch: async () => {
        max = Math.max(max, ++inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return json({ games: [] });
      },
    });
    await Promise.all([c.month('1'), c.month('2'), c.month('3')]);
    expect(max).toBe(1);
  });
});

// ---------------------------------------------------------------- openings

describe('openings', () => {
  const book = buildBook([
    ['C20', "King's Pawn Game", 'e2e4 e7e5'],
    ['C40', "King's Knight Opening", 'e2e4 e7e5 g1f3'],
    ['C44', "King's Knight Opening: Normal Variation", 'e2e4 e7e5 g1f3 b8c6'],
  ]);

  it('names the deepest book position and where theory ended', () => {
    const g = importPgn(pgn({ ...BASE, Result: '*' }, '1. e4 e5 2. Nf3 Nc6 3. h3 a6 *'));
    const o = identifyOpening(book, g.moves)!;
    expect(o.name).toBe("King's Knight Opening: Normal Variation");
    expect(o.leftAt).toBe(4);
    expect(o.leftBy).toBe('w');
  });

  it('lists the book move when you leave theory', () => {
    const g = importPgn(pgn({ ...BASE, Result: '*' }, '1. e4 e5 2. Nc3 *'));
    const o = identifyOpening(book, g.moves)!;
    expect(o.name).toBe("King's Pawn Game");
    expect(o.bookMoves).toEqual(['Nf3']);
  });
});

// ---------------------------------------------------------------- patterns

function fakeAnalysis(url: string, user: 'w' | 'b', moves: Partial<MoveAnalysis>[], opening = 'Sicilian Defense'): GameAnalysis {
  return {
    url, version: 1, depth: 14, analyzedAt: '', userColor: user, accuracy: { w: 80, b: 70 }, opening: { eco: 'B20', name: opening },
    moves: moves.map((m) => ({
      evalBefore: 0, evalAfter: 0, cpLoss: 0, classification: 'Best', bestUci: null, bestSan: null, gap: null, bestLine: [],
      phase: 'middlegame', clockBefore: null, spent: null, ...m,
    })),
  };
}

describe('pattern aggregation', () => {
  // You are White; even plies are yours.
  const hung = { classification: 'Blunder' as const, cpLoss: 600, explanation: { headline: '', details: [], pvSan: [], kinds: ['hangs'] } };
  const entries = Array.from({ length: 6 }, (_, i) => ({
    game: chessComGame({ url: `u${i}`, white: { username: 'me', rating: 1500, result: i < 4 ? 'checkmated' : 'win' }, black: { username: 'x', rating: 1500, result: i < 4 ? 'win' : 'resigned' } }),
    analysis: fakeAnalysis(`u${i}`, 'w', [i < 5 ? hung : {}, {}, { phase: 'endgame', cpLoss: 40, classification: 'Inaccuracy', explanation: { headline: '', details: [], pvSan: [], kinds: ['allows-fork'] } }]),
  }));

  it('counts records, openings, phases and mistake types', () => {
    const p = computePatterns(entries);
    expect(p.games).toBe(6);
    expect(p.byColor.w).toMatchObject({ games: 6, wins: 2, losses: 4 });
    expect(p.byColor.w.score).toBeCloseTo(33.3, 0);
    expect(p.openings.w[0]).toMatchObject({ name: 'Sicilian Defense', games: 6 });
    expect(p.mistakeTypes.find((t) => t.kind === 'hangs')!.count).toBe(5);
    expect(p.mistakeTypes.find((t) => t.kind === 'allows-fork')!.count).toBe(6);
    expect(p.errors).toBe(11);
  });

  it('applies the minimum sample size', () => {
    const p = computePatterns(entries, 6);
    const hangs = p.weaknesses.find((w) => w.title.includes('hanging'))!;
    expect(hangs.count).toBe(5);
    expect(hangs.tooSmall).toBe(true); // 5 < 6
    expect(computePatterns(entries, 5).weaknesses.find((w) => w.title.includes('hanging'))!.tooSmall).toBe(false);
    // Weaknesses that clear the bar come first, with their evidence spelled out
    const ok = computePatterns(entries, 5).weaknesses;
    const firstSmall = ok.findIndex((w) => w.tooSmall);
    if (firstSmall >= 0) expect(ok.slice(firstSmall).every((w) => w.tooSmall)).toBe(true);
    const mixed = computePatterns(entries, 6).weaknesses;
    expect(mixed.slice(mixed.findIndex((w) => w.tooSmall)).every((w) => w.tooSmall)).toBe(true);
    expect(ok[0].evidence).toMatch(/of 11 errors/);
    expect(ok[0].examples.length).toBeGreaterThan(0);
  });

  it('flags a losing opening only with enough games', () => {
    const w = computePatterns(entries).weaknesses.find((x) => x.title.includes('Sicilian'))!;
    expect(w.detail).toContain('33%');
    expect(w.tooSmall).toBe(false);
    expect(computePatterns(entries.slice(0, 3)).weaknesses.find((x) => x.title.includes('Sicilian'))!.tooSmall).toBe(true);
  });
});

// ---------------------------------------------------------------- save as puzzle

describe('save a mistake as a puzzle', () => {
  it('starts from the opponent move before yours and ends on your move', () => {
    const g = importPgn(pgn({ ...BASE, Result: '*' }, '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 *'));
    const a = fakeAnalysis(g.url, 'w', g.moves.map(() => ({})));
    // Pretend move index 4 (3. Qh5) was a mistake and the engine's line was Qf3 Nf6 Qb3 Qe7 …
    a.moves[4].bestLine = ['d1f3', 'g8f6', 'f3b3', 'd8e7', 'g1f3'];
    const p = mistakeToPuzzle(g, a, 4, 2)!;
    expect(p.fen).toBe(g.moves[3].fenBefore);
    expect(p.moves).toEqual(['b8c6', 'd1f3', 'g8f6', 'f3b3']);
    expect(p.rating).toBe(0);
    expect(p.id).toBe('cc-1-4');
  });

  it('needs an opponent move before yours', () => {
    const g = importPgn(FOOLS_MATE);
    expect(mistakeToPuzzle(g, fakeAnalysis(g.url, 'w', g.moves.map(() => ({}))), 0)).toBeNull();
  });
});
