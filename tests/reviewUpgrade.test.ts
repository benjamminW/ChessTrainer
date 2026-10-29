import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { classify, mateIn } from '../src/coach/classify';
import { phaseGrade } from '../src/coach/estimate';
import { buildGameReview, winPercent } from '../src/coach/gameReview';
import { CLASS_MODEL, brilliantCandidate, classifyMove, confirmBrilliant, findSacrifice, migrateReview, winDrop } from '../src/coach/moveClass';
import { scoreMove, upgradeBrilliant } from '../src/coach/review';
import { MOVE_CLASS } from '../src/config/coach';
import { mateToCp, type Analysis, type PvLine, type SearchOptions } from '../src/engine/uci';
import { Session, newGameState } from '../src/game/session';
import { migrateAnalysis } from '../src/review/migrate';
import { bookPrefix, buildBook } from '../src/review/openings';
import { importPgn } from '../src/review/pgn';
import type { GameAnalysis } from '../src/review/types';
import { ReviewScreen, type ReviewModel } from '../src/reviewScreen/controller';
import type { MoveReview, PlyRecord } from '../src/types';

const line = (cp: number, pv: string[], multipv = 1): PvLine => ({ cp, pv, multipv, depth: 14, mate: mateIn(cp) });
const analysis = (fen: string, lines: PvLine[]): Analysis => ({ fen, depth: 14, lines, bestmove: lines[0]?.pv[0] ?? null });
const base = { secondCp: null, isEngineBest: false, inBook: false, legalMoves: 30, isRecapture: false };

// ---------------------------------------------------------------- win probability and thresholds

describe('win probability and classification thresholds', () => {
  it('converts evals to win chances with the documented curve', () => {
    expect(winPercent(0)).toBeCloseTo(50);
    expect(winPercent(100)).toBeCloseTo(59.1, 1);
    expect(winPercent(-100)).toBeCloseTo(40.9, 1);
  });

  it('handles mate scores in both directions without breaking', () => {
    expect(winPercent(mateToCp(1))).toBeCloseTo(100, 5);
    expect(winPercent(mateToCp(-1))).toBeCloseTo(0, 5);
    expect(winDrop(mateToCp(3), mateToCp(5))).toBeCloseTo(0, 5); // slower mate: no real loss
    expect(winDrop(mateToCp(2), 0)).toBeCloseTo(50, 1);
    expect(winDrop(0, mateToCp(-1))).toBeCloseTo(50, 1);
    expect(classifyMove({ ...base, bestCp: 0, playedCp: mateToCp(-1) })).toBe('Blunder');
    expect(Number.isFinite(winDrop(mateToCp(1), mateToCp(-1)))).toBe(true);
  });

  it('classifies on the drop at each threshold', () => {
    const at = (drop: number) => classify(drop, false);
    expect([0.3, 1.5, 4, 8, 15, 30].map(at)).toEqual(['Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder']);
  });
});

// ---------------------------------------------------------------- Miss, Great, Book

describe('Miss', () => {
  it('is a missed clear win that still leaves you OK', () => {
    // Best keeps +5 (86%), played +1.5 (64%): a 22-point drop but not losing.
    expect(classifyMove({ ...base, bestCp: 500, playedCp: 150 })).toBe('Miss');
    // Missing a forced mate counts too.
    expect(classifyMove({ ...base, bestCp: mateToCp(2), playedCp: 400 })).toBe('Miss');
  });

  it('is a Blunder instead when you end up losing, and not a Miss without a clear win', () => {
    expect(classifyMove({ ...base, bestCp: 500, playedCp: -300 })).toBe('Blunder');
    // +1.00 (59%) → −0.50 (45%): a 14-point drop without a clear win before it.
    expect(classifyMove({ ...base, bestCp: 100, playedCp: -50 })).toBe('Mistake');
  });
});

describe('Great', () => {
  it('is the only good move in an equal or worse position', () => {
    expect(classifyMove({ ...base, bestCp: 0, playedCp: 0, isEngineBest: true, secondCp: -300 })).toBe('Great');
  });

  it('needs a real gap, a non-winning position, a choice, and not a plain recapture', () => {
    expect(classifyMove({ ...base, bestCp: 0, playedCp: 0, isEngineBest: true, secondCp: -40 })).toBe('Best');
    expect(classifyMove({ ...base, bestCp: 500, playedCp: 500, isEngineBest: true, secondCp: 0 })).toBe('Best');
    expect(classifyMove({ ...base, bestCp: 0, playedCp: 0, isEngineBest: true, secondCp: -300, legalMoves: 1 })).toBe('Best');
    expect(classifyMove({ ...base, bestCp: 0, playedCp: 0, isEngineBest: true, secondCp: -300, isRecapture: true })).toBe('Best');
  });
});

describe('Book', () => {
  const book = buildBook([
    ['C20', "King's Pawn Game", 'e2e4 e7e5'],
    ['C40', "King's Knight Opening", 'e2e4 e7e5 g1f3'],
  ]);

  it('counts the moves that are still in the opening dataset', () => {
    const g = importPgn('[Result "*"]\n\n1. e4 e5 2. Nf3 a6 3. Nc3 *');
    expect(bookPrefix(book, g.moves)).toBe(3);
  });

  it('classifies an in-book move as Book whatever the engine says', () => {
    const s = new Session(newGameState('w', 1200));
    const ply = s.play('e2e4', 'user')!;
    const n = scoreMove(ply, analysis(ply.fenBefore, [line(30, ['d2d4'])]), analysis(ply.fenAfter, [line(-20, ['e7e5'])]), { inBook: true });
    expect(n.classification).toBe('Book');
  });
});

// ---------------------------------------------------------------- Brilliant (conservative)

// Classic "Greek gift": Bxh7+ gives up the bishop for a pawn.
const GREEK = 'r1bq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R2QK2R w KQ - 0 8';

function greekGift() {
  const s = new Session(newGameState('w', 1200, GREEK));
  const ply = s.play('d3h7', 'user')!;
  const before = analysis(GREEK, [line(150, ['d3h7', 'g8h7']), line(20, ['e1g1'], 2)]);
  const after = analysis(ply.fenAfter, [line(-150, ['g8h7'])]);
  return { ply, before, after };
}

const fakeEngine = (cpForOpponent: number) => async (fen: string, o: SearchOptions): Promise<Analysis> =>
  analysis(fen, [line(cpForOpponent, o.searchMoves ?? [])]);

describe('Brilliant', () => {
  it('spots a real sacrifice (piece for a pawn, no recapture)', () => {
    expect(findSacrifice(GREEK, 'd3h7')).toEqual({ captureUci: 'g8h7', gain: 2 });
  });

  it('is Brilliant when the engine confirms the sacrifice holds', async () => {
    const { ply, before, after } = greekGift();
    const n = scoreMove(ply, before, after);
    expect(n.classification).toBe('Best');
    expect(n.sacrifice).not.toBeNull();
    expect((await upgradeBrilliant(n, ply, fakeEngine(-150))).classification).toBe('Brilliant');
  });

  it('near miss: the same sacrifice is NOT Brilliant if taking it leaves you worse', async () => {
    const { ply, before, after } = greekGift();
    const n = scoreMove(ply, before, after);
    // After Kxh7 the engine has Black better (+0.6 for Black): the sac doesn't hold.
    expect((await upgradeBrilliant(n, ply, fakeEngine(60))).classification).toBe('Best');
    expect(await confirmBrilliant(ply.fenAfter, n.sacrifice!, n.bestCp, fakeEngine(60))).toBe(false);
  });

  it('is never given when already completely winning, for trades, pawns, or pieces that were already hanging', () => {
    expect(brilliantCandidate('Best', 800, 800, { captureUci: 'x', gain: 3 })).toBe(false);
    // Bxf6 gxf6 is a trade, not a sacrifice.
    expect(findSacrifice('rnbqkb1r/pppp1ppp/4pn2/6B1/3P4/8/PPP1PPPP/RN1QKBNR w KQkq - 0 3', 'g5f6')).toBeNull();
    // The knight on e4 was already en prise before Ke2.
    expect(findSacrifice('4k3/8/8/3p4/4N3/8/8/4K3 w - - 0 1', 'e1e2')).toBeNull();
    // Pawn sacrifices don't count.
    expect(findSacrifice('4k3/8/8/2p5/8/8/3P4/4K3 w - - 0 1', 'd2d4')).toBeNull();
  });

  it('rejects a confirmation search that did not actually take the material', async () => {
    const { ply, before, after } = greekGift();
    const n = scoreMove(ply, before, after);
    const wrongLine = async (fen: string): Promise<Analysis> => analysis(fen, [line(-300, ['g8h8'])]);
    expect(await confirmBrilliant(ply.fenAfter, n.sacrifice!, n.bestCp, wrongLine)).toBe(false);
  });
});

// ---------------------------------------------------------------- accuracy and rating estimate

function reviewedGame(drops: number[]): PlyRecord[] {
  // Alternate knight moves, giving each ply a review with the requested win-chance drop.
  const s = new Session(newGameState('w', 1200));
  const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  drops.forEach((d, i) => {
    const ply = s.play(cycle[i % 4], i % 2 ? 'bot' : 'user')!;
    // Find an eval after with exactly this drop from 0 (mover POV), then convert to White POV.
    let cp = 0;
    while (winPercent(0) - winPercent(cp) < d) cp -= 1;
    const sign = ply.color === 'w' ? 1 : -1;
    ply.review = {
      classification: classify(d, false), cpLoss: -cp, evalBefore: 0, evalAfter: cp * sign, bestUci: null, bestSan: null,
      explanation: { headline: '', details: [], pvSan: [] }, model: CLASS_MODEL, winDrop: d,
    };
  });
  return s.plies;
}

describe('accuracy for both sides', () => {
  it('computes accuracy for both sides of a game', () => {
    const short = buildGameReview(reviewedGame([0, 0, 2, 0, 15, 0]), 'w');
    expect(short.stats.w.accuracy!).toBeLessThan(short.stats.b.accuracy!);
    expect(phaseGrade(1)).toBe('Excellent');
    expect(phaseGrade(10)).toBe('Poor');
  });
});

// ---------------------------------------------------------------- migration

describe('migration of saved reviews', () => {
  const s = new Session(newGameState('w', 1200));
  const ply = s.play('f2f3', 'user')!;
  const old: MoveReview = {
    classification: 'Mistake', cpLoss: 230, evalBefore: 30, evalAfter: -200, bestUci: 'e2e4', bestSan: 'e4',
    explanation: { headline: 'Mistake.', details: [], pvSan: [] },
  };

  it('upgrades a model-1 Play review from its stored evals', () => {
    const m = migrateReview(old, ply, null);
    expect(m.model).toBe(CLASS_MODEL);
    expect(m.classification).toBe('Blunder'); // a 20+ point drop in win chance
    expect(m.winDrop).toBeCloseTo(20.4, 0);
    expect(m.explanation).toBe(old.explanation);
    expect(migrateReview(m, ply, null)).toBe(m); // idempotent
  });

  it('keeps the engine move as Best and applies Book when known', () => {
    expect(migrateReview({ ...old, bestUci: 'f2f3', evalAfter: 30 }, ply, null).classification).toBe('Best');
    expect(migrateReview(old, ply, null, true).classification).toBe('Book');
  });

  it('upgrades a version-1 Review-mode cache entry, recovering Great from the stored gap', () => {
    const g = importPgn('[Result "*"]\n\n1. e4 e5 *');
    const v1: GameAnalysis = {
      url: 'u', version: 1, depth: 14, analyzedAt: '', userColor: 'w', accuracy: { w: 90, b: 90 }, opening: null,
      moves: [
        { evalBefore: 0, evalAfter: 0, cpLoss: 0, classification: 'Best', bestUci: 'e2e4', bestSan: 'e4', gap: 300, bestLine: [], phase: 'opening', clockBefore: null, spent: null },
        { evalBefore: 0, evalAfter: 150, cpLoss: 150, classification: 'Mistake', bestUci: 'c7c5', bestSan: 'c5', gap: 10, bestLine: [], phase: 'opening', clockBefore: null, spent: null },
      ],
    };
    const v2 = migrateAnalysis(v1, g, null);
    expect(v2.version).toBe(2);
    expect(v2.moves[0].classification).toBe('Great');
    expect(v2.moves[1].classification).toBe('Mistake'); // Black: 50% → 36.5%, a 13.5-point drop
    expect(migrateAnalysis(v1, g, buildBook([['C20', "King's Pawn Game", 'e2e4 e7e5']])).moves.map((m) => m.classification)).toEqual(['Book', 'Book']);
  });
});

// ---------------------------------------------------------------- review screen: retry and key moments

function screenFor(userColor: 'w' | 'b') {
  const s = new Session(newGameState(userColor, 1200));
  for (const m of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f7f6']) s.play(m, 'user');
  // Reviews: White's 3rd move (index 4) and Black's last (index 5) were mistakes.
  s.plies.forEach((p, i) => {
    const bad = i >= 4;
    p.review = {
      classification: bad ? 'Mistake' : 'Best', cpLoss: bad ? 200 : 0, evalBefore: 0, evalAfter: bad ? (p.color === 'w' ? -150 : 150) : 0,
      bestUci: bad ? (p.color === 'w' ? 'd2d4' : 'g8f6') : p.uci, bestSan: bad ? (p.color === 'w' ? 'd4' : 'Nf6') : p.san,
      explanation: { headline: '', details: [], pvSan: [] }, model: CLASS_MODEL, winDrop: bad ? 14 : 0,
    };
  });
  const model: ReviewModel = {
    meta: { userColor, white: { name: 'W' }, black: { name: 'B' }, resultText: '' },
    startFen: s.state.startFen,
    plies: s.plies,
    progress: null,
  };
  const engine = async (fen: string): Promise<Analysis> => {
    const best = new Chess(fen).turn() === 'w' ? 'd2d4' : 'g8f6';
    return analysis(fen, [line(0, [best]), line(-100, ['a2a3', 'a7a6'].filter((u) => new Chess(fen).moves({ verbose: true }).some((m) => m.from + m.to === u)), 2)]);
  };
  const screen = new ReviewScreen(model, { analyze: engine, resolved: () => undefined, requestRender: () => {} });
  return { s, screen };
}

describe('retry', () => {
  it('returns to the position before the move with the same side to move', async () => {
    const { s, screen } = screenFor('w');
    screen.goTo(6);
    expect(screen.canRetry(4)).toBe(true);
    screen.retry(4);
    const v = screen.boardView();
    expect(v.fen).toBe(s.plies[4].fenBefore);
    expect(v.turn).toBe('w');
    expect(v.movable).toBe('w');
    expect(v.dests.size).toBeGreaterThan(0);

    await screen.tryMove('d2', 'd4');
    expect(screen.mode.kind === 'retry' && screen.mode.verdict?.cls).toBe('Best');
    expect(screen.boardView().movable).toBeNull(); // graded: board waits for "Try again"

    screen.retryAgain();
    expect(screen.boardView().fen).toBe(s.plies[4].fenBefore);
    screen.exitRetry();
    expect(screen.mode.kind).toBe('game');
    expect(screen.step).toBe(5);
  });

  it('works for Black too', () => {
    const { s, screen } = screenFor('b');
    screen.retry(5);
    const v = screen.boardView();
    expect(v.fen).toBe(s.plies[5].fenBefore);
    expect(v.turn).toBe('b');
    expect(v.movable).toBe('b');
  });

  it("isn't offered for best moves or the opponent's moves", () => {
    const { screen } = screenFor('w');
    expect(screen.canRetry(0)).toBe(false); // Best
    expect(screen.canRetry(5)).toBe(false); // opponent
  });
});

describe('key moments', () => {
  it('lists the swings for each side and jumps between them', () => {
    const { screen } = screenFor('w');
    const k = screen.keyMoments();
    expect(k.you.map((x) => x.index)).toEqual([4]);
    expect(k.opponent.map((x) => x.index)).toEqual([5]);
    screen.goTo(0);
    screen.jumpKey(1);
    expect(screen.step).toBe(5);
    expect(screen.showBetter).toBe(true); // your mistake: better move shown
    screen.jumpKey(1);
    expect(screen.step).toBe(6);
    screen.jumpKey(-1);
    expect(screen.step).toBe(5);
  });

  it('marks the move on the board with a badge and a colored square', () => {
    const { screen } = screenFor('w');
    screen.goTo(6);
    const v = screen.boardView();
    expect(v.badge).toEqual({ square: 'f6', cls: 'Mistake' });
    expect(v.squareClasses!.get('f6')).toBe('hl-mistake');
  });
});

describe('model constant', () => {
  it('documents the current thresholds', () => {
    expect(MOVE_CLASS.miss.minDrop).toBe(10);
  });
});
