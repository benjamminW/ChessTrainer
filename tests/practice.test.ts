import { describe, expect, it } from 'vitest';
import { winPercent } from '../src/coach/ratingMoves';
import { GOAL_CONFIG, judgeGoal, positionLabel, suggestGoal, winTrajectory } from '../src/game/practice';
import type { PracticeRequest } from '../src/game/practice';
import { ReviewMode } from '../src/review/controller';
import type { ChessComGame } from '../src/review/chesscom';
import type { Analysis } from '../src/engine/uci';

/** Centipawns (mover's POV) for a given win%. */
const cpFor = (win: number) => {
  let cp = 0;
  while (winPercent(cp) < win) cp += 1;
  return cp;
};

describe('goal from the eval', () => {
  it('suggests converting a win, playing for a win with an edge, and holding otherwise', () => {
    expect(suggestGoal(cpFor(GOAL_CONFIG.convertFrom), 'w')).toBe('convert');
    expect(suggestGoal(cpFor(GOAL_CONFIG.convertFrom) - 2, 'w')).toBe('win');
    expect(suggestGoal(cpFor(GOAL_CONFIG.winFrom), 'w')).toBe('win');
    expect(suggestGoal(0, 'w')).toBe('hold');
    expect(suggestGoal(-400, 'w')).toBe('hold');
    expect(suggestGoal(null, 'w')).toBe('free');
  });

  it('reads the eval from the side you play', () => {
    // +4 for White: White converts, Black holds.
    expect(suggestGoal(400, 'w')).toBe('convert');
    expect(suggestGoal(400, 'b')).toBe('hold');
    expect(suggestGoal(-400, 'b')).toBe('convert');
  });

  it('handles mate scores', () => {
    expect(suggestGoal(99997, 'w')).toBe('convert');
    expect(suggestGoal(99997, 'b')).toBe('hold');
  });
});

describe('judging the goal', () => {
  const win = { score: '1-0', reason: 'checkmate' } as const;
  const draw = { score: '1/2-1/2', reason: 'stalemate' } as const;
  const loss = { score: '0-1', reason: 'resignation' } as const;

  it('needs a win to convert or to win from here', () => {
    expect(judgeGoal('convert', win, 'w').met).toBe(true);
    expect(judgeGoal('convert', draw, 'w').met).toBe(false);
    expect(judgeGoal('win', loss, 'b').met).toBe(true);
    expect(judgeGoal('win', draw, 'b').met).toBe(false);
  });

  it('accepts a draw or better to hold', () => {
    expect(judgeGoal('hold', draw, 'b').met).toBe(true);
    expect(judgeGoal('hold', loss, 'b').met).toBe(true);
    expect(judgeGoal('hold', win, 'b').met).toBe(false);
    expect(judgeGoal('hold', win, 'b').text).toMatch(/You lost: goal missed/);
  });

  it("doesn't judge free play", () => {
    expect(judgeGoal('free', draw, 'w')).toEqual({ met: null, text: 'You drew.' });
  });
});

describe('practice helpers', () => {
  it('labels a position', () => {
    expect(positionLabel('4k3/8/8/8/8/8/4P3/4K3 b - - 0 23')).toBe('move 23 with Black to play');
  });

  it('turns evals into your winning chances', () => {
    const t = winTrajectory([0, 300, null, -300], 'b');
    expect(t[0]).toBeCloseTo(50);
    expect(t[1]!).toBeLessThan(50);
    expect(t[2]).toBeNull();
    expect(t[3]!).toBeGreaterThan(50);
  });
});

describe('Review mode: Play from here and back', () => {
  const PGN = `[Event "Live Chess"]
[White "me"]
[Black "them"]
[Result "0-1"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1`;
  const game: ChessComGame = {
    url: 'https://example.test/game/1', pgn: PGN, time_control: '600', time_class: 'rapid', rules: 'chess', end_time: 1,
    white: { username: 'me', rating: 1200, result: 'checkmated' }, black: { username: 'them', rating: 1250, result: 'win' },
  } as unknown as ChessComGame;

  function mode() {
    const requests: PracticeRequest[] = [];
    const engine = async (fen: string): Promise<Analysis> => ({ fen, depth: 10, bestmove: null, lines: [] });
    const m = new ReviewMode({
      analyze: engine, provider: { explain: async () => ({ headline: '', details: [], pvSan: [] }) } as never,
      baseUrl: '/', requestRender: () => {}, practice: (r) => requests.push(r),
      savePuzzle: () => true, hasPuzzle: () => false, coachAnalyze: engine, resolved: () => undefined,
    });
    m.prefs.username = 'me';
    m.games = [game];
    return { m, requests };
  }

  it('asks Play to practice from the chosen position and remembers the step on screen', () => {
    const { m, requests } = mode();
    m.openGame(game.url, 9);
    m.playFrom(6, true);
    expect(requests).toHaveLength(1);
    const r = requests[0];
    expect(r.fen).toBe(m.current!.imported.moves[5].fenAfter);
    expect(r.retry).toBe(true);
    expect(r.back).toEqual({ source: 'review', url: game.url, step: 9 });
    expect(r.label).toBe('your game vs them, move 4 with White to play');
  });

  it('returns to the same game and step with the review state intact', () => {
    const { m } = mode();
    m.openGame(game.url, 4);
    const screen = m.current!.screen;
    screen.summaryOpen = false;
    screen.linesOpen = true;
    m.view = 'games'; // the user wandered off to the game list
    expect(m.returnTo(game.url, 9)).toBe(true);
    expect(m.view).toBe('game');
    expect(m.current!.screen).toBe(screen);
    expect(screen.step).toBe(9);
    expect(screen.summaryOpen).toBe(false);
    expect(screen.linesOpen).toBe(true);
  });

  it('reopens the game if it was closed, and says so if it is not loaded', () => {
    const { m } = mode();
    expect(m.returnTo(game.url, 3)).toBe(true);
    expect(m.current!.screen.step).toBe(3);
    expect(m.returnTo('https://example.test/game/unknown', 3)).toBe(false);
  });
});
