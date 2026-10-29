import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import type { PhaseStats } from '../src/coach/gameReview';
import type { Analysis, PvLine } from '../src/engine/uci';
import { LearnMode, type LearnDeps } from '../src/learn/controller';
import { isComplete, lessonShare, recordStep, type LearnProgress } from '../src/learn/progress';
import { LESSONS } from '../src/learn/registry';
import { suggestLessons } from '../src/learn/suggest';
import { TablebaseClient, TablebaseUnavailable, bestTbMove, moverOutcome, outcomeOf, type TbMove, type TbResult } from '../src/learn/tablebase';
import type { Lesson, TryStep } from '../src/learn/types';
import { allProblems, lessonProblems, pieceCount } from '../src/learn/validate';
import { memoryStore } from '../src/review/cache';

const mv = (uci: string, category: TbMove['category'], dtm: number | null, checkmate = false): TbMove => ({ uci, san: uci, category, dtz: dtm, dtm, checkmate });

describe('lesson schema', () => {
  it('every shipped lesson is valid', () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(9);
    expect(allProblems(LESSONS)).toEqual([]);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  });

  it('reports bad lessons in plain words', () => {
    const bad = {
      id: 'Bad Id', section: 'nowhere', title: '', summary: 's', order: 1,
      steps: [
        { type: 'explain', fen: 'not a fen', text: 'x' },
        { type: 'try', fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', prompt: 'p', hint: 'h', success: 's', solution: 'e2e5' },
        { type: 'practice', fen: 'k7/1Q6/1K6/8/8/8/8/8 b - - 0 1', prompt: 'p', userColor: 'w', goal: 'win' },
        { type: 'explain', fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', text: 'x', arrows: [{ from: 'e2', to: 'z9' }] },
      ],
    } as unknown as Lesson;
    const p = lessonProblems(bad).join('\n');
    expect(p).toMatch(/bad id/);
    expect(p).toMatch(/unknown section/);
    expect(p).toMatch(/missing title/);
    expect(p).toMatch(/step 1: invalid FEN/);
    expect(p).toMatch(/step 2: solution e2e5 is not legal/);
    expect(p).toMatch(/step 3: position not playable \(That position is already checkmate/);
    expect(p).toMatch(/step 4: bad arrow e2-z9/);
    expect(allProblems([LESSONS[0], LESSONS[0]])).toContain(`duplicate lesson id "${LESSONS[0].id}"`);
  });

  it('counts pieces for the tablebase limit', () => {
    expect(pieceCount('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1')).toBe(3);
    expect(pieceCount(new Chess().fen())).toBe(32);
  });
});

describe('tablebase results', () => {
  it('maps categories to results, counting cursed wins and blessed losses as draws', () => {
    expect(outcomeOf('win')).toBe('win');
    expect(outcomeOf('maybe-loss')).toBe('loss');
    expect(outcomeOf('cursed-win')).toBe('draw');
    expect(outcomeOf('blessed-loss')).toBe('draw');
    expect(outcomeOf('unknown')).toBeNull();
    // A move's category is for the opponent: "loss" after my move means I win.
    expect(moverOutcome(mv('a', 'loss', -5))).toBe('win');
  });

  it('plays the fastest win, and the longest loss when losing', () => {
    const winning: TbResult = { category: 'win', dtz: 9, dtm: 9, checkmate: false, stalemate: false, moves: [mv('slow', 'loss', -12), mv('draw', 'draw', 0), mv('fast', 'loss', -4)] };
    expect(bestTbMove(winning)?.uci).toBe('fast');
    const mate: TbResult = { ...winning, moves: [mv('two', 'loss', -2), mv('mate', 'loss', null, true)] };
    expect(bestTbMove(mate)?.uci).toBe('mate');
    const losing: TbResult = { category: 'loss', dtz: -9, dtm: -9, checkmate: false, stalemate: false, moves: [mv('quick', 'win', 3), mv('resist', 'win', 21), mv('mid', 'win', 9)] };
    expect(bestTbMove(losing)?.uci).toBe('resist');
    const drawn: TbResult = { category: 'draw', dtz: 0, dtm: 0, checkmate: false, stalemate: false, moves: [mv('lose', 'win', 7), mv('hold', 'draw', 0)] };
    expect(bestTbMove(drawn)?.uci).toBe('hold');
  });
});

describe('tablebase client', () => {
  const body = { category: 'win', dtz: 9, dtm: 37, checkmate: false, stalemate: false, moves: [{ uci: 'e2e3', san: 'e3', category: 'loss', dtz: -8, dtm: -36 }] };
  const ok = (calls: string[]) => (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;

  it('fetches, parses, and serves the next probe from the cache', async () => {
    const calls: string[] = [];
    const store = memoryStore<TbResult>();
    const tb = new TablebaseClient({ fetch: ok(calls), store });
    const fen = '8/8/4k3/8/4K3/8/4P3/8 w - - 0 1';
    const r = await tb.probe(fen);
    expect(r.category).toBe('win');
    expect(r.moves[0]).toMatchObject({ uci: 'e2e3', category: 'loss', dtm: -36, checkmate: false });
    expect(calls[0]).toContain('fen=8%2F8%2F4k3');
    await tb.probe(fen.replace(/ 1$/, ' 7')); // move number doesn't matter
    expect(calls).toHaveLength(1);
    expect(await store.keys()).toHaveLength(1);
  });

  it('fails with TablebaseUnavailable when the network or the server fails, and backs off after a 429', async () => {
    const down = new TablebaseClient({ fetch: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
    await expect(down.probe('8/8/8/8/8/8/8/k6K w - - 0 1')).rejects.toBeInstanceOf(TablebaseUnavailable);
    let n = 0;
    let now = 0;
    const limited = new TablebaseClient({
      fetch: (async () => { n++; return new Response('', { status: 429 }); }) as unknown as typeof fetch,
      backoffMs: 60_000,
      now: () => now,
    });
    await expect(limited.probe('8/8/8/8/8/8/8/k6K w - - 0 1')).rejects.toThrow(/slow down/);
    now = 30_000;
    await expect(limited.probe('8/8/8/8/8/8/8/k5K1 w - - 0 1')).rejects.toThrow(/slow down/);
    expect(n).toBe(1); // no request while backing off
  });
});

// ---------------------------------------------------------------- Learn controller

const line = (cp: number, pv: string[], multipv = 1): PvLine => ({ cp, pv, multipv, depth: 16, mate: null });

function learn(o: { tb?: (fen: string) => Promise<TbResult>; engine?: (fen: string) => Analysis } = {}) {
  const deps: LearnDeps = {
    analyze: async (fen) => o.engine?.(fen) ?? { fen, depth: 16, bestmove: null, lines: [] },
    provider: { id: 'test', explain: async () => ({ headline: 'That drops material.', details: ['Detail one.'], pvSan: [] }) },
    tablebase: { probe: o.tb ?? (async () => { throw new TablebaseUnavailable('offline'); }) } as unknown as TablebaseClient,
    requestRender: () => {},
    promotionHost: null as unknown as HTMLElement,
  };
  return new LearnMode(deps);
}

describe('Try steps', () => {
  // More than 7 pieces: the engine judges by win% margin.
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
  const step: TryStep = { type: 'try', fen, prompt: 'p', hint: 'h', solution: 'f1b5', success: 'Good.', margin: 3 };
  const engine = (f: string): Analysis => {
    if (f === fen) return { fen: f, depth: 16, bestmove: 'f1b5', lines: [line(40, ['f1b5']), line(35, ['f1c4'], 2), line(-60, ['f3g1'], 3)] };
    return { fen: f, depth: 16, bestmove: null, lines: [line(0, ['a7a6'])] };
  };

  it('accepts any move within the margin, not only the solution', async () => {
    const m = learn({ engine });
    const after = (uci: string) => { const c = new Chess(fen); c.move(uci); return c.fen(); };
    const c4 = await m.judgeTry(step, 'f1c4', 'Bc4', after('f1c4'));
    expect(c4.ok).toBe(true);
    expect(c4.judge).toBe('engine');
    expect(c4.text).toMatch(/Bc4 works too/);
    const back = await m.judgeTry(step, 'f3g1', 'Ng1', after('f3g1'));
    expect(back.ok).toBe(false);
    expect(back.text).toBe('That drops material.');
    expect(back.details[0]).toMatch(/gives away about \d+%/);
  });

  it('handles a mate: only the mate counts when the step asks for the fastest win', async () => {
    const mateFen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
    const mate: TryStep = { type: 'try', fen: mateFen, prompt: 'p', hint: 'h', solution: 'a1a8', success: 'Mate.', fastest: true };
    const eng = (f: string): Analysis => f === mateFen
      ? { fen: f, depth: 16, bestmove: 'a1a8', lines: [{ ...line(99999, ['a1a8']), mate: 1 }, line(500, ['a1a7'], 2)] }
      : { fen: f, depth: 16, bestmove: null, lines: [line(-500, ['g8f8'])] };
    // The tablebase isn't used: 8 pieces.
    const m = learn({ engine: eng });
    expect((await m.judgeTry(mate, 'a1a8', 'Ra8#', '6kR/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1')).ok).toBe(true);
    const slow = await m.judgeTry(mate, 'a1a7', 'Ra7', '6k1/R4ppp/8/8/8/8/5PPP/6K1 b - - 1 1');
    expect(slow.ok).toBe(false);
  });

  it('uses the tablebase with 7 pieces or fewer, and falls back to the engine with a note', async () => {
    const kp: TryStep = { type: 'try', fen: '8/8/4k3/8/4K3/8/4P3/8 w - - 0 1', prompt: 'p', hint: 'h', solution: 'e2e3', success: 'Tempo!' };
    const tb: TbResult = { category: 'win', dtz: 1, dtm: 37, checkmate: false, stalemate: false, moves: [mv('e2e3', 'loss', -36), mv('e4d4', 'loss', -40), mv('e4d3', 'draw', 0)] };
    const m = learn({ tb: async () => tb });
    expect(await m.judgeTry(kp, 'e4d4', 'Kd4', '8/8/4k3/8/3K4/8/4P3/8 b - - 1 1')).toMatchObject({ ok: true, judge: 'tablebase' });
    const bad = await m.judgeTry(kp, 'e4d3', 'Kd3', '8/8/4k3/8/8/3K4/4P3/8 b - - 1 1');
    expect(bad).toMatchObject({ ok: false, judge: 'tablebase' });
    expect(bad.details[0]).toMatch(/turns a win into a draw/);

    const offline = learn({ engine: () => ({ fen: kp.fen, depth: 16, bestmove: 'e2e3', lines: [line(600, ['e2e3']), line(590, ['e4d4'], 2)] }) });
    const f = await offline.judgeTry(kp, 'e4d4', 'Kd4', '8/8/4k3/8/3K4/8/4P3/8 b - - 1 1');
    expect(f).toMatchObject({ ok: true, judge: 'engine' });
    expect(f.note).toMatch(/engine-based, not tablebase-exact/);
  });
});

describe('Practice steps', () => {
  it('flags a move that throws away the win, and the tablebase defender resists longest', async () => {
    const lesson = LESSONS.find((l) => l.id === 'kp-opposition')!;
    const start = '8/4k3/8/4K3/4P3/8/8/8 b - - 0 1';
    const tbFor = async (fen: string): Promise<TbResult> => {
      const c = new Chess(fen);
      // Black to move at the start: Kd7 resists longest (loss in 27), Kd8 is quicker (23).
      if (fen.startsWith('8/4k3/8/4K3')) return { category: 'loss', dtz: -28, dtm: -28, checkmate: false, stalemate: false, moves: [mv('e7d8', 'win', 23), mv('e7d7', 'win', 27)] };
      // White to move after Kd7: Kf6 wins, Kd5 lets it slip.
      return { category: 'win', dtz: 26, dtm: 26, checkmate: false, stalemate: false, moves: c.moves({ verbose: true }).map((x) => mv(x.from + x.to, x.to === 'd5' ? 'draw' : 'loss', x.to === 'd5' ? 0 : -25)) };
    };
    const m = learn({ tb: tbFor });
    m.open(lesson.id, lesson.steps.length - 1);
    expect(m.step?.type).toBe('practice');
    expect(m.step?.fen).toBe(start);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const p = m.practice!;
    expect(p.chess.history()).toEqual(['Kd7']);
    await m.onBoardMove('e5', 'd5');
    expect(p.phase).toBe('flagged');
    expect(p.flag).toMatchObject({ san: 'Kd5', from: 'win', to: 'draw' });
    m.undoFlagged();
    expect(p.phase).toBe('playing');
    expect(p.chess.history()).toEqual(['Kd7']);
  });
});

describe('progress and suggestions', () => {
  const lesson = LESSONS[0];
  const fresh = (): LearnProgress => ({ lessons: {}, lastOpened: null });

  it('completes a lesson when every step is done', () => {
    const p = fresh();
    lesson.steps.forEach((_, i) => {
      expect(isComplete(p, lesson)).toBe(false);
      recordStep(p, lesson, i, { done: true });
    });
    expect(isComplete(p, lesson)).toBe(true);
    expect(lessonShare(p, lesson)).toBe(1);
    // A later failed attempt doesn't undo it.
    recordStep(p, lesson, 0, { done: false, attempts: 3 });
    expect(p.lessons[lesson.id].steps[0]).toMatchObject({ done: true, attempts: 3 });
  });

  const phase = (o: Partial<PhaseStats>): PhaseStats => ({ phase: 'endgame', moves: 10, accuracy: 70, acpl: 50, avgDrop: 8, grade: 'Poor', mistakes: 2, counted: 10, ...o });

  it('suggests up to three lessons for the weakest phase, unfinished first, and says why', () => {
    const p = fresh();
    recordStep(p, LESSONS[0], 0, { done: true });
    LESSONS[0].steps.forEach((_, i) => recordStep(p, LESSONS[0], i, { done: true }));
    const sg = suggestLessons([phase({ phase: 'opening', grade: 'Good', avgDrop: 3 }), phase({})], p)!;
    expect(sg.phase).toBe('endgame');
    expect(sg.grade).toBe('Poor');
    expect(sg.counted).toBe(10);
    expect(sg.lessons).toHaveLength(3);
    expect(sg.lessons.map((l) => l.id)).not.toContain(LESSONS[0].id);
  });

  it('suggests nothing without a weak phase backed by counted moves, or without lessons for it', () => {
    expect(suggestLessons([phase({ grade: 'Good', avgDrop: 3 })], fresh())).toBeNull();
    expect(suggestLessons([phase({ counted: 2 })], fresh())).toBeNull();
    expect(suggestLessons([phase({ phase: 'middlegame' })], fresh(), LESSONS.filter((l) => l.section === 'endgames'))).toBeNull();
  });
});

// ---------------------------------------------------------------- opening drills

import openingRows from '../public/openings.json';
import { lessonForOpening } from '../src/learn/suggest';
import type { DrillStep } from '../src/learn/types';

describe('opening lessons', () => {
  const openings = LESSONS.filter((l) => l.section === 'openings');
  const rows = new Set((openingRows as [string, string, string][]).map((r) => r[2]));

  it('has 8 openings for both colors, each with 2 to 4 drill lines from the dataset', () => {
    expect(openings).toHaveLength(8);
    const sides = new Set<string>();
    for (const l of openings) {
      const d = l.steps.find((s) => s.type === 'drill') as DrillStep;
      expect(d, l.id).toBeTruthy();
      sides.add(d.side);
      expect(d.lines.length).toBeGreaterThanOrEqual(2);
      expect(d.lines.length).toBeLessThanOrEqual(4);
      for (const line of d.lines) expect(rows.has(line), `${l.id}: ${line}`).toBe(true);
      expect(l.steps.filter((s) => s.type === 'explain').length).toBeGreaterThanOrEqual(3);
    }
    expect(sides).toEqual(new Set(['w', 'b']));
  });

  it("finds the lesson for a review's opening name", () => {
    expect(lessonForOpening('Italian Game: Giuoco Piano')?.id).toBe('italian');
    expect(lessonForOpening("Queen's Gambit Declined: Exchange Variation")?.id).toBe('queens-gambit');
    expect(lessonForOpening("Queen's Pawn Game: London System")?.id).toBe('london');
    expect(lessonForOpening('Sicilian Defense: Najdorf Variation')?.id).toBe('sicilian');
    expect(lessonForOpening('Ruy Lopez')).toBeNull();
    expect(lessonForOpening('Italian Gamebit')).toBeNull();
  });
});

describe('opening drill', () => {
  const drillLesson: Lesson = {
    id: 'test-drill', section: 'openings', order: 1, title: 'T', summary: 'S',
    steps: [{
      type: 'drill', fen: new Chess().fen(), prompt: 'p', side: 'w',
      lines: ['e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 d2d3', 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 b1c3'],
      notes: { 'e2e4 e7e5 g1f3': 'Nf3 attacks e5.' },
    }],
  };
  const drillMode = (random = () => 0) => {
    const m = learn();
    (m as unknown as { deps: LearnDeps }).deps.random = random;
    (m as unknown as { deps: LearnDeps }).deps.replyDelayMs = 0;
    m.lesson = drillLesson;
    m.view = 'lesson';
    m.goToStep(0);
    return m;
  };
  const tick = () => new Promise((r) => setTimeout(r, 5));

  it('replies from the line, spots a move that leaves book, shows the book move and its idea, and lets you retry', async () => {
    const m = drillMode();
    const d = m.drill!;
    await m.onBoardMove('e2', 'e4');
    await tick();
    expect(d.chess.history()).toEqual(['e4', 'e5']);
    await m.onBoardMove('d2', 'd4'); // not in the lesson's lines
    expect(d.phase).toBe('offbook');
    expect(d.offbook).toMatchObject({ san: 'd4', book: [{ uci: 'g1f3', san: 'Nf3' }], idea: 'Nf3 attacks e5.' });
    expect(d.chess.history()).toEqual(['e4', 'e5']); // the move isn't played
    expect(m.boardView().shapes).toEqual(expect.arrayContaining([{ from: 'd2', to: 'd4', brush: 'red' }, { from: 'g1', to: 'f3', brush: 'green' }]));
    m.retry();
    expect(d.phase).toBe('playing');
    await m.onBoardMove('g1', 'f3');
    await tick();
    expect(d.chess.history()).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    const stats = m.progress.lessons['test-drill'].drill!;
    expect(stats[d.target].misses).toBe(1);
  });

  it("uses the coach's own idea when the lesson has no note", async () => {
    const m = drillMode();
    await m.onBoardMove('d2', 'd4');
    expect(m.drill!.offbook?.idea).toBeTruthy();
    expect(m.drill!.offbook?.idea).not.toBe('Nf3 attacks e5.');
  });

  it('plays a line to the end and records it', async () => {
    const m = drillMode(() => 0); // first line: ...Bc5 d3
    const d = m.drill!;
    for (const [f, t] of [['e2', 'e4'], ['g1', 'f3'], ['f1', 'c4'], ['d2', 'd3']]) {
      await m.onBoardMove(f, t);
      await tick();
    }
    expect(d.phase).toBe('done');
    expect(d.target).toBe('e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 d2d3');
    expect(m.progress.lessons['test-drill'].drill![d.target].completed).toBe(1);
    // One of two lines done: the step isn't complete yet.
    expect(m.progress.lessons['test-drill'].steps[0]?.done).toBe(false);
  });

  it('picks unfinished lines first, then the ones you miss most', () => {
    const m = drillMode();
    const [a, b] = drillLesson.steps[0].type === 'drill' ? drillLesson.steps[0].lines : [];
    const stats = m.progress.lessons['test-drill'].drill!;
    stats[a] = { runs: 3, misses: 0, completed: 3 };
    stats[b] = { runs: 0, misses: 0, completed: 0 };
    expect(m.pickLine([a, b])).toBe(b);
    stats[b] = { runs: 4, misses: 5, completed: 1 };
    // Weights 1 (a) and 11 (b): b takes everything above 1/12.
    (m as unknown as { deps: LearnDeps }).deps.random = () => 0.5;
    expect(m.pickLine([a, b])).toBe(b);
    (m as unknown as { deps: LearnDeps }).deps.random = () => 0.05;
    expect(m.pickLine([a, b])).toBe(a);
  });
});
