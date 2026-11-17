import { Chess } from 'chess.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepertoireMode, lessonSources } from '../src/repertoire/controller';
import { grade, introduce, isDue } from '../src/repertoire/srs';
import {
  START_KEY, addLine, addMove, allLines, cardKeys, childKey, exportPgn, importPgn, lineText, moveCount, newRepertoire, removeMove, type Repertoire,
} from '../src/repertoire/tree';

vi.mock('../src/ui/promotion', () => ({ pickPromotion: async () => 'q' }));

const line = (s: string) => s.split(' ');

function italian(): Repertoire {
  const rep = newRepertoire('Italian', 'w');
  addLine(rep, line('e2e4 e7e5 g1f3 b8c6 f1c4'));
  addLine(rep, line('e2e4 c7c5 g1f3'));
  addLine(rep, line('e2e4 e7e6 d2d4'));
  return rep;
}

describe('repertoire tree', () => {
  it('stores moves by position and counts your moves as cards', () => {
    const rep = italian();
    expect(rep.moves[START_KEY]).toEqual([{ uci: 'e2e4', san: 'e4' }]);
    expect(moveCount(rep)).toBe(9);
    // e4, Nf3 (after e5), Bc4, Nf3 (after c5), d4 (after e6)
    expect(cardKeys(rep)).toHaveLength(5);
    expect(allLines(rep).map((l) => lineText(l.ucis))).toEqual([
      '1. e4 e5 2. Nf3 Nc6 3. Bc4',
      '1. e4 c5 2. Nf3',
      '1. e4 e6 2. d4',
    ]);
  });

  it('keeps one move per position on your side', () => {
    const rep = italian();
    const r = addMove(rep, START_KEY, 'd2d4');
    expect(r).toEqual({ ok: false, reason: 'conflict', existing: { uci: 'e2e4', san: 'e4' } });
    expect(addLine(rep, line('e2e4 e7e5 f1c4'))).toEqual({ added: 0, conflicts: 1 });
    // The opponent can have any number of replies.
    expect(addMove(rep, childKey(START_KEY, 'e2e4'), 'd7d5').ok).toBe(true);
    expect(addMove(rep, START_KEY, 'e2e5')).toEqual({ ok: false, reason: 'illegal' });
  });

  it('shares transpositions', () => {
    const rep = newRepertoire('QG', 'w');
    addLine(rep, line('d2d4 d7d5 c2c4 e7e6 g1f3'));
    addLine(rep, line('d2d4 e7e6 c2c4 d7d5'));
    // Both orders reach the same position, which already has Nf3.
    expect(allLines(rep).map((l) => l.ucis.length)).toEqual([5, 5]);
    expect(allLines(rep)[1].ucis.slice(-1)).toEqual(['g1f3']);
  });

  it('deletes a move with everything only reachable through it, and their cards', () => {
    const rep = italian();
    const after = childKey(START_KEY, 'e2e4');
    const nf3Key = childKey(after, 'e7e5');
    rep.cards[nf3Key] = introduce();
    expect(removeMove(rep, after, 'e7e5')).toBe(3); // Nf3, Nc6, Bc4
    expect(rep.cards[nf3Key]).toBeUndefined();
    expect(moveCount(rep)).toBe(5);
  });
});

describe('PGN', () => {
  it('imports variations, comments, NAGs and several games', () => {
    const rep = newRepertoire('Sicilian', 'b');
    const r = importPgn(rep, `[Event "x"]
[White "?"]

1. e4 c5 {main} 2. Nf3 (2. c3 Nf6!? 3. e5 Nd5) (2. Nc3 Nc6) 2... d6 $1 3. d4 cxd4 *

[Event "y"]

1. d4 Nf6 2. c4 e6 *`);
    expect(r.errors).toEqual([]);
    expect(r.games).toBe(2);
    expect(allLines(rep).map((l) => lineText(l.ucis))).toEqual([
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4',
      '1. e4 c5 2. c3 Nf6 3. e5 Nd5',
      '1. e4 c5 2. Nc3 Nc6',
      '1. d4 Nf6 2. c4 e6',
    ]);
  });

  it('skips the rest of a variation that conflicts or is illegal', () => {
    const rep = newRepertoire('x', 'w');
    addLine(rep, line('e2e4 e7e5 g1f3'));
    const r = importPgn(rep, '1. e4 e5 (1... c5 2. Nf3 d6 3. Qx7 a6) 2. Bc4 (2. Nf3 Nc6) *');
    expect(r.conflicts).toBe(1); // 2. Bc4 clashes with 2. Nf3
    expect(r.errors).toHaveLength(1);
    expect(allLines(rep).map((l) => lineText(l.ucis))).toEqual(['1. e4 e5 2. Nf3 Nc6', '1. e4 c5 2. Nf3 d6']);
  });

  it('exports a PGN that imports back to the same tree', () => {
    const rep = italian();
    addMove(rep, childKey(START_KEY, 'e2e4'), 'd7d5');
    const pgn = exportPgn(rep);
    expect(pgn).toContain('1. e4 e5 (1... c5 2. Nf3) (1... e6 2. d4) (1... d5) 2. Nf3 Nc6 3. Bc4');
    const black = newRepertoire('b', 'b');
    addLine(black, line('e2e4 c7c6 d2d4 d7d5'));
    addLine(black, line('e2e4 c7c6 b1c3 d7d5'));
    expect(exportPgn(black)).toContain('1. e4 c6 2. d4 (2. Nc3 d5) 2... d5 *');
    const back = newRepertoire('copy', 'w');
    importPgn(back, pgn);
    expect(back.moves).toEqual(rep.moves);
  });
});

describe('spaced repetition', () => {
  const t0 = new Date('2026-11-16T12:00:00Z');
  it('spaces reviews out on success and brings a miss back the same day', () => {
    let c = introduce(t0);
    expect(isDue(c, t0)).toBe(false);
    expect(isDue(c, new Date(t0.getTime() + 11 * 60_000))).toBe(true);
    c = grade(c, true, t0);
    expect(c.interval).toBe(1);
    c = grade(c, true, t0);
    expect(c.interval).toBe(3);
    c = grade(c, true, t0);
    expect(c.interval).toBeGreaterThanOrEqual(7);
    const miss = grade(c, false, t0);
    expect(miss.interval).toBe(0);
    expect(miss.lapses).toBe(1);
    expect(miss.ease).toBeLessThan(c.ease);
    expect(Date.parse(miss.due) - t0.getTime()).toBe(10 * 60_000);
  });
});

describe('training', () => {
  let rendered = 0;
  let now = new Date('2026-11-16T12:00:00Z');
  const make = () =>
    new RepertoireMode({ requestRender: () => rendered++, promotionHost: {} as HTMLElement, confirm: async () => true, replyDelayMs: 0, now: () => now, random: () => 0 });

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
    now = new Date('2026-11-16T12:00:00Z');
  });

  const play = async (m: RepertoireMode, uci: string) => {
    m.trainMove(uci);
    await new Promise((r) => setTimeout(r, 0));
  };

  it('shows new moves, then checks them from memory, then schedules them', async () => {
    const m = make();
    const rep = m.create('Italian', 'w');
    addLine(rep, line('e2e4 e7e5 g1f3'));
    expect(m.counts(rep)).toMatchObject({ cards: 2, fresh: 2, due: 0 });
    expect(m.train(rep.id, 'learn')).toBe(true);
    expect(m.newHere).toBe(true);
    expect(m.expected?.san).toBe('e4');
    await play(m, 'e2e4');
    expect(m.run!.chess.history()).toEqual(['e4', 'e5']); // opponent replied from the line
    expect(m.newHere).toBe(true);
    await play(m, 'g1f3');
    expect(m.run!.phase).toBe('done');
    expect(m.nextAction?.label).toBe('Play it again from memory');
    m.next();
    expect(m.run!.pass).toBe('memory');
    expect(m.newHere).toBe(false);
    await play(m, 'e2e4');
    await play(m, 'g1f3');
    expect(m.run!.phase).toBe('done');
    expect(Object.values(rep.cards).map((c) => c.interval)).toEqual([1, 1]);
    expect(m.counts(rep)).toMatchObject({ learned: 2, fresh: 0, due: 0 });
    expect(m.nextAction).toBeNull();
  });

  it('a wrong move counts as a miss and must be corrected; due lines come back', async () => {
    const m = make();
    const rep = m.create('Italian', 'w');
    addLine(rep, line('e2e4 e7e5 g1f3'));
    const k1 = START_KEY;
    const k2 = childKey(childKey(k1, 'e2e4'), 'e7e5');
    rep.cards[k1] = grade(undefined, true, now);
    rep.cards[k2] = grade(undefined, true, now);
    expect(m.train(rep.id, 'due')).toBe(false); // nothing due yet
    now = new Date('2026-11-18T12:00:00Z');
    expect(m.counts(rep).due).toBe(2);
    expect(m.train(rep.id, 'due')).toBe(true);
    await play(m, 'e2e4');
    await play(m, 'f1c4'); // not the repertoire move
    expect(m.run!.phase).toBe('wrong');
    expect(m.run!.wrong).toMatchObject({ san: 'Bc4', expected: { san: 'Nf3' } });
    expect(m.showing).toBe(true);
    expect(rep.cards[k2].lapses).toBe(1);
    await play(m, 'g1f3');
    expect(m.run!.phase).toBe('done');
    expect(rep.cards[k1].interval).toBe(3);
    expect(rep.cards[k2].interval).toBe(0); // still the miss
    expect(m.tally).toEqual({ right: 1, wrong: 1 });
  });

  it('plays the first move for you as Black and can switch to the builder there', async () => {
    const m = make();
    const rep = m.create('Caro', 'b');
    addLine(rep, line('e2e4 c7c6 d2d4 d7d5'));
    m.train(rep.id, 'all');
    await new Promise((r) => setTimeout(r, 0));
    expect(m.run!.chess.history()).toEqual(['e4']);
    expect(m.boardView().movable).toBe('b');
    m.editHere();
    expect(m.view).toBe('edit');
    expect(m.editChess.history()).toEqual(['e4']);
    expect(m.editMoves.map((x) => x.san)).toEqual(['c6']);
  });

  it('builds from the board and refuses a second move of yours', () => {
    const m = make();
    const rep = m.create('London', 'w');
    m.editPlay('d2d4');
    m.editPlay('d7d5');
    m.editPlay('c1f4');
    m.goTo(0);
    m.editPlay('e2e4');
    expect(m.message?.bad).toBe(true);
    expect(m.editChess.history()).toEqual([]);
    m.setPath(['d2d4']);
    m.editPlay('g8f6');
    expect(lineText(allLines(rep)[1].ucis)).toBe('1. d4 Nf6');
    // Saved to localStorage.
    expect(make().reps[0].moves).toEqual(rep.moves);
  });

  it('seeds a repertoire from a Learn opening drill', () => {
    const src = lessonSources().find((s) => s.id === 'italian')!;
    expect(src.side).toBe('w');
    const m = make();
    const rep = m.create('', 'w', 'italian');
    expect(rep.name).toBe('Italian Game');
    // The lesson shows two White plans after 3...Bc5 (d3 and c3); a repertoire keeps the first.
    expect(allLines(rep).length).toBe(src.lines.length - 1);
    expect(m.importReport).toMatchObject({ conflicts: 1 });
    for (const l of allLines(rep)) {
      const c = new Chess();
      for (const u of l.ucis) c.move({ from: u.slice(0, 2), to: u.slice(2, 4) });
    }
  });
});
