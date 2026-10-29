/**
 * Puzzle mode. Uses the app's single Board, the coach engine (through the app's cached
 * analyze()), the move classifier and the explanation provider — nothing is duplicated.
 */
import { Chess, type Square } from 'chess.js';
import { lineToSan } from '../coach/facts';
import type { ExplanationProvider } from '../coach/provider';
import { scoreMove, terminalScore } from '../coach/review';
import type { Analysis } from '../engine/uci';
import { parseUci, uciOf } from '../game/session';
import type { Classification, Color, Explanation, PlyRecord } from '../types';
import type { Board, BoardView } from '../ui/board';
import { pickPromotion } from '../ui/promotion';
import { PuzzleLine } from './line';
import { PuzzleLibrary, RatedSource, ReviewSource, type PuzzleSource } from './source';
import { loadStats, markSeen, recordResult, saveStats, type PuzzlePrefs, type PuzzleStats } from './store';
import type { Outcome, Puzzle, PuzzleIndex } from './types';

export const PUZZLE_TIMING = {
  /** Pause before the opponent's setup move, so the starting position is visible. */
  setupDelayMs: 700,
  replyDelayMs: 450,
  solutionStepMs: 800,
};

export type PuzzlePhase =
  | 'loading'
  | 'setup' // showing the position before the opponent's move
  | 'solving'
  | 'reply' // opponent's auto reply is coming
  | 'wrong' // a wrong move was played; explanation shown
  | 'solution' // playing out the solution
  | 'done'
  | 'empty' // no puzzle available for the current filters
  | 'error';

export interface WrongMove {
  san: string;
  uci: string;
  /** The position the wrong move was played from (the board shows this). */
  fenBefore: string;
  correctUci: string;
  correctSan: string;
  explanation: Explanation | null;
  classification: Classification | null;
}

export interface AnalysisBoard {
  chess: Chess;
  startFen: string;
  lastMove: [string, string] | null;
}

export interface PuzzleDeps {
  board: Board;
  analyze(fen: string): Promise<Analysis>;
  provider: ExplanationProvider;
  baseUrl: string;
  /** Re-render the app (which calls back into render() while in puzzle mode). */
  requestRender(): void;
  /** Element the promotion picker overlays. */
  promotionHost: HTMLElement;
}

function destsOf(chess: Chess): Map<string, string[]> {
  const dests = new Map<string, string[]>();
  for (const m of chess.moves({ verbose: true })) dests.set(m.from, [...(dests.get(m.from) ?? []), m.to]);
  return dests;
}

async function promotionFor(chess: Chess, from: string, to: string, host: HTMLElement): Promise<string | undefined | null> {
  const promo = chess.moves({ verbose: true }).some((m) => m.from === from && m.to === to && m.promotion);
  if (!promo) return undefined;
  return pickPromotion(host, chess.turn());
}

export class PuzzleMode {
  stats: PuzzleStats = loadStats();
  index: PuzzleIndex | null = null;
  readonly lib: PuzzleLibrary;
  private sources: Record<PuzzlePrefs['source'], PuzzleSource>;

  puzzle: Puzzle | null = null;
  line: PuzzleLine | null = null;
  fromReview = false;
  phase: PuzzlePhase = 'loading';
  /** Recorded result of this puzzle (set once; retries don't record again). */
  outcome: Outcome | null = null;
  change = 0;
  failed = false;
  assisted = false;
  /** 0 = none, 1 = piece circled, 2 = arrow shown. Resets after each of your moves. */
  hintLevel = 0;
  lastMove: [string, string] | null = null;
  wrong: WrongMove | null = null;
  error = '';
  analysisBoard: AnalysisBoard | null = null;
  /** Bumped whenever the puzzle changes, so stale timers and analyses are ignored. */
  private token = 0;

  constructor(private deps: PuzzleDeps) {
    this.lib = new PuzzleLibrary(deps.baseUrl);
    this.sources = {
      rated: new RatedSource(this.lib, () => this.stats),
      review: new ReviewSource(() => this.stats),
    };
  }

  /** Called when the user switches to puzzle mode. */
  enter(): void {
    this.lib.getIndex().then(
      (i) => {
        this.index = i;
        this.deps.requestRender();
      },
      (e) => this.setError(e),
    );
    if (!this.puzzle) void this.loadNext();
  }

  get source(): PuzzleSource {
    return this.sources[this.stats.prefs.source];
  }

  async loadNext(): Promise<void> {
    const t = ++this.token;
    this.phase = 'loading';
    this.analysisBoard = null;
    this.deps.requestRender();
    try {
      const p = await this.source.next();
      if (t !== this.token) return;
      if (!p) {
        this.puzzle = null;
        this.line = null;
        this.phase = 'empty';
        this.deps.requestRender();
        return;
      }
      this.start(p, this.stats.prefs.source === 'review');
    } catch (e) {
      if (t === this.token) this.setError(e);
    }
  }

  private setError(e: unknown): void {
    this.error = e instanceof Error ? e.message : String(e);
    this.phase = 'error';
    this.deps.requestRender();
  }

  start(p: Puzzle, fromReview: boolean): void {
    const t = ++this.token;
    this.puzzle = p;
    this.line = new PuzzleLine(p);
    this.fromReview = fromReview;
    this.outcome = null;
    this.change = 0;
    this.failed = false;
    this.assisted = false;
    this.hintLevel = 0;
    this.wrong = null;
    this.lastMove = null;
    this.analysisBoard = null;
    this.phase = 'setup';
    markSeen(this.stats, p.id);
    saveStats(this.stats);
    this.deps.requestRender();
    setTimeout(() => {
      if (t !== this.token || !this.line) return;
      const m = this.line.playScripted();
      this.lastMove = [m.from, m.to];
      this.phase = 'solving';
      this.deps.requestRender();
      // Warm the engine cache for the position you're solving, so explanations are quick.
      this.deps.analyze(this.line.fen).catch(() => {});
    }, PUZZLE_TIMING.setupDelayMs);
  }

  /** Same puzzle from the start. Already recorded, so it doesn't count again. */
  restart(): void {
    if (!this.puzzle) return;
    const { outcome, change, failed, assisted } = this;
    this.start(this.puzzle, this.fromReview);
    Object.assign(this, { outcome, change, failed, assisted });
  }

  // ------------------------------------------------------------ moves

  async onMove(from: string, to: string): Promise<void> {
    if (this.analysisBoard) return this.analysisMove(from, to);
    const line = this.line;
    if (!line || this.phase !== 'solving') return this.deps.requestRender();
    const promotion = await promotionFor(line.chess, from, to, this.deps.promotionHost);
    if (promotion === null) return this.deps.requestRender();
    const fenBefore = line.fen;
    const expected = line.expected()!;
    const res = line.tryMove(from + to + (promotion ?? ''));

    if (res.kind === 'illegal') return this.deps.requestRender();
    if (res.kind === 'wrong') return this.onWrong(res.move.san, uciOf(res.move), fenBefore, expected, res.move.after);

    this.lastMove = [res.move.from, res.move.to];
    this.hintLevel = 0;
    if (res.solved) return this.finish();
    this.phase = 'reply';
    this.deps.requestRender();
    const t = this.token;
    setTimeout(() => {
      if (t !== this.token || !this.line) return;
      const m = this.line.playScripted();
      this.lastMove = [m.from, m.to];
      this.phase = this.line.solved ? 'done' : 'solving';
      if (this.line.solved) this.finish();
      else {
        this.deps.requestRender();
        this.deps.analyze(this.line.fen).catch(() => {});
      }
    }, PUZZLE_TIMING.replyDelayMs);
  }

  private record(outcome: Outcome): void {
    if (this.outcome || !this.puzzle) return;
    this.outcome = outcome;
    this.change = recordResult(this.stats, this.puzzle, outcome, !this.source.rated || this.fromReview);
    saveStats(this.stats);
  }

  private finish(): void {
    this.phase = 'done';
    this.record(this.assisted ? 'assisted' : 'solved');
    this.deps.requestRender();
  }

  private onWrong(san: string, uci: string, fenBefore: string, correctUci: string, fenAfter: string): void {
    this.failed = true;
    this.record('failed');
    const correctSan = lineToSan(fenBefore, [correctUci])[0] ?? correctUci;
    this.wrong = { san, uci, fenBefore, correctUci, correctSan, explanation: null, classification: null };
    this.phase = 'wrong';
    this.hintLevel = 0;
    this.deps.requestRender();
    void this.explainWrong(this.token, this.wrong, fenAfter);
  }

  /** Uses the coach's classifier and explanation provider to say why the move was worse. */
  private async explainWrong(t: number, w: WrongMove, fenAfter: string): Promise<void> {
    try {
      const color = w.fenBefore.split(' ')[1] as Color;
      const before = await this.deps.analyze(w.fenBefore);
      const after = terminalScore(fenAfter) === null ? await this.deps.analyze(fenAfter) : null;
      const ply: PlyRecord = { san: w.san, uci: w.uci, color, by: 'user', fenBefore: w.fenBefore, fenAfter };
      const numbers = scoreMove(ply, before, after);
      const explanation = await this.deps.provider.explain({ ply, prev: null, userColor: color, before, after, numbers });
      if (t !== this.token || this.wrong !== w) return;
      w.explanation = explanation;
      w.classification = numbers.classification;
      this.deps.requestRender();
    } catch (e) {
      console.error('[puzzles] explanation failed', e);
    }
  }

  retry(): void {
    if (this.phase !== 'wrong') return;
    this.wrong = null;
    this.phase = 'solving';
    this.deps.requestRender();
  }

  viewSolution(): void {
    if (!this.line || (this.phase !== 'wrong' && this.phase !== 'solving')) return;
    if (!this.outcome) {
      // Giving up counts as a failure.
      this.failed = true;
      this.record('failed');
    }
    this.wrong = null;
    this.hintLevel = 0;
    this.phase = 'solution';
    const t = this.token;
    const step = () => {
      if (t !== this.token || !this.line) return;
      if (this.line.solved) {
        this.phase = 'done';
        this.deps.requestRender();
        return;
      }
      const m = this.line.playScripted();
      this.lastMove = [m.from, m.to];
      this.deps.requestRender();
      setTimeout(step, PUZZLE_TIMING.solutionStepMs);
    };
    this.deps.requestRender();
    setTimeout(step, 250);
  }

  hint(): void {
    if (this.phase !== 'solving' || this.analysisBoard) return;
    this.hintLevel = Math.min(2, this.hintLevel + 1);
    this.assisted = true;
    this.deps.requestRender();
  }

  setPrefs(p: Partial<PuzzlePrefs>): void {
    Object.assign(this.stats.prefs, p);
    saveStats(this.stats);
    void this.loadNext();
  }

  // ------------------------------------------------------------ analysis board

  /** Free-move board from the puzzle's starting position (after the opponent's move), engine on. */
  openAnalysis(): void {
    if (!this.puzzle) return;
    const chess = new Chess(this.puzzle.fen);
    const setup = chess.move(parseUci(this.puzzle.moves[0]));
    this.analysisBoard = { chess, startFen: chess.fen(), lastMove: [setup.from, setup.to] };
    this.requestAnalysis();
    this.deps.requestRender();
  }

  closeAnalysis(): void {
    this.analysisBoard = null;
    this.deps.requestRender();
  }

  private requestAnalysis(): void {
    const a = this.analysisBoard;
    if (!a) return;
    const fen = a.chess.fen();
    if (a.chess.isGameOver()) return;
    this.deps.analyze(fen).then(() => this.deps.requestRender(), () => {});
  }

  private async analysisMove(from: string, to: string): Promise<void> {
    const a = this.analysisBoard!;
    const promotion = await promotionFor(a.chess, from, to, this.deps.promotionHost);
    if (promotion === null) return this.deps.requestRender();
    try {
      const m = a.chess.move({ from: from as Square, to: to as Square, promotion });
      a.lastMove = [m.from, m.to];
    } catch {
      /* illegal: board re-renders below */
    }
    this.requestAnalysis();
    this.deps.requestRender();
  }

  analysisUndo(): void {
    const a = this.analysisBoard;
    if (!a || a.chess.fen() === a.startFen) return;
    a.chess.undo();
    const last = a.chess.history({ verbose: true }).pop();
    a.lastMove = last ? [last.from, last.to] : null;
    this.requestAnalysis();
    this.deps.requestRender();
  }

  analysisReset(): void {
    if (this.analysisBoard) this.openAnalysis();
  }

  // ------------------------------------------------------------ board view

  boardView(resolved: (fen: string) => Analysis | undefined): BoardView & { evalCp: number | null } {
    const a = this.analysisBoard;
    if (a) {
      const fen = a.chess.fen();
      const an = resolved(fen);
      const top = an?.lines[0];
      const sign = a.chess.turn() === 'w' ? 1 : -1;
      return {
        fen,
        orientation: this.line?.solver ?? 'w',
        turn: a.chess.turn(),
        movable: 'both',
        dests: destsOf(a.chess),
        lastMove: a.lastMove,
        check: a.chess.inCheck(),
        shapes: top?.pv[0] ? [{ from: top.pv[0].slice(0, 2), to: top.pv[0].slice(2, 4), brush: 'blue' }] : [],
        evalCp: top ? top.cp * sign : null,
      };
    }
    const line = this.line;
    if (!line) {
      return { fen: new Chess().fen(), orientation: 'w', turn: 'w', movable: null, dests: new Map(), lastMove: null, check: false, shapes: [], evalCp: null };
    }
    const shapes: BoardView['shapes'] = [];
    const expected = line.expected();
    if (this.phase === 'solving' && expected) {
      if (this.hintLevel >= 1) shapes.push({ from: expected.slice(0, 2), brush: 'green' });
      if (this.hintLevel >= 2) shapes.push({ from: expected.slice(0, 2), to: expected.slice(2, 4), brush: 'green' });
    }
    if (this.phase === 'wrong' && this.wrong) {
      shapes.push({ from: this.wrong.uci.slice(0, 2), to: this.wrong.uci.slice(2, 4), brush: 'paleRed' });
      shapes.push({ from: this.wrong.correctUci.slice(0, 2), to: this.wrong.correctUci.slice(2, 4), brush: 'green' });
    }
    const solving = this.phase === 'solving' && line.chess.turn() === line.solver;
    return {
      fen: line.fen,
      orientation: line.solver,
      turn: line.chess.turn(),
      movable: solving ? line.solver : null,
      dests: solving ? destsOf(line.chess) : new Map(),
      lastMove: this.lastMove,
      check: line.chess.inCheck(),
      shapes,
      evalCp: null,
    };
  }
}
