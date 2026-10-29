/**
 * Background analysis of imported games, one game and one position at a time through the
 * app's existing coach engine (a Web Worker), so the page stays responsive.
 */
import { Chess, type Color } from 'chess.js';
import { gamePhase } from '../coach/facts';
import { buildGameReview } from '../coach/gameReview';
import type { ExplanationProvider } from '../coach/provider';
import { reviewPly, terminalScore } from '../coach/review';
import { REVIEW_CONFIG, type AnalysisPreset } from '../config/review';
import type { Analysis, SearchOptions } from '../engine/uci';
import type { PlyRecord } from '../types';
import { BAD_CLASSES } from '../coach/classes';
import { cacheUsable, type KeyValueStore } from './cache';
import { bookPrefix, identifyOpening, type OpeningBook } from './openings';
import { migrateAnalysis } from './migrate';
import { timeSpent, type ImportedGame } from './pgn';
import type { GameAnalysis, MoveAnalysis } from './types';

export type AnalyzeFn = (fen: string, opts: SearchOptions) => Promise<Analysis>;

export interface Control {
  /** Resolves when not paused. */
  waitIfPaused(): Promise<void>;
  cancelled(): boolean;
}

/** Turns imported moves into PlyRecords (your moves are 'user', the opponent's 'bot'). */
export function toPlies(game: ImportedGame, userColor: Color): PlyRecord[] {
  return game.moves.map((m) => ({ san: m.san, uci: m.uci, color: m.color, by: m.color === userColor ? 'user' : 'bot', fenBefore: m.fenBefore, fenAfter: m.fenAfter }));
}

/** Analyzes every position, then classifies and explains moves with the existing coach code. */
export async function analyzeGame(
  game: ImportedGame,
  userColor: Color,
  preset: AnalysisPreset,
  analyze: AnalyzeFn,
  provider: ExplanationProvider,
  book: OpeningBook | null,
  control: Control,
  onProgress: (done: number, total: number) => void,
  /** Called as soon as each move is classified, so it can be stepped through before the game is done. */
  onMove: (moves: MoveAnalysis[]) => void = () => {},
): Promise<GameAnalysis | null> {
  const plies = toPlies(game, userColor);
  const fens = [game.startFen, ...game.moves.map((m) => m.fenAfter)];
  const inBook = book ? bookPrefix(book, game.moves) : 0;
  const spent = timeSpent(game);
  const analyses: (Analysis | null)[] = [];
  const moves: MoveAnalysis[] = [];
  for (let i = 0; i < fens.length; i++) {
    await control.waitIfPaused();
    if (control.cancelled()) return null;
    const terminal = i > 0 && terminalScore(fens[i]) !== null;
    analyses.push(terminal ? null : await analyze(fens[i], { depth: preset.depth, multiPv: preset.multiPv }));
    if (i > 0) {
      // Positions i−1 and i are known, so move i−1 can be classified now.
      const k = i - 1;
      const ply = plies[k];
      const before = analyses[k]!;
      const { review, numbers } = await reviewPly(ply, plies[k - 1] ?? null, before, analyses[i], {
        userColor, inBook: k < inBook, provider, analyze,
        // Only your weaker moves get a stored explanation; the review screen describes the rest on the fly.
        explain: (cls) => ply.by === 'user' && BAD_CLASSES.includes(cls),
      });
      const prevClock = k >= 2 ? game.moves[k - 2].clock : game.timeControl?.base ?? null;
      moves.push({
        evalBefore: review.evalBefore,
        evalAfter: review.evalAfter,
        cpLoss: review.cpLoss,
        winDrop: review.winDrop ?? 0,
        classification: review.classification,
        bestUci: review.bestUci,
        bestSan: review.bestSan,
        gap: numbers.secondCp === null ? null : numbers.bestCp - numbers.secondCp,
        bestLine: before.lines[0]?.pv.slice(0, 8) ?? [],
        phase: gamePhase(new Chess(ply.fenBefore)),
        clockBefore: game.hasClocks ? prevClock : null,
        spent: spent[k],
        ...(review.explanation.headline || review.explanation.details.length ? { explanation: review.explanation } : {}),
      });
      onMove(moves);
    }
    onProgress(i + 1, fens.length);
  }

  const result: GameAnalysis = {
    url: game.url,
    version: REVIEW_CONFIG.analysisVersion,
    depth: preset.depth,
    analyzedAt: new Date().toISOString(),
    userColor,
    moves,
    accuracy: { w: null, b: null },
    opening: null,
  };
  const review = buildGameReview(withReviews(plies, result), userColor);
  result.accuracy = { w: review.stats.w.accuracy, b: review.stats.b.accuracy };
  const op = book ? identifyOpening(book, game.moves) : null;
  result.opening = op ? { eco: op.eco, name: op.name } : null;
  return result;
}

/** PlyRecords with the cached analysis attached as reviews, so the existing review code can run on them. */
export function withReviews(plies: PlyRecord[], a: Pick<GameAnalysis, 'moves'>): PlyRecord[] {
  return plies.map((p, i) => {
    const m = a.moves[i];
    if (!m) return p;
    return {
      ...p,
      review: {
        classification: m.classification,
        cpLoss: m.cpLoss,
        winDrop: m.winDrop,
        model: 2,
        evalBefore: m.evalBefore,
        evalAfter: m.evalAfter,
        bestUci: m.bestUci,
        bestSan: m.bestSan,
        explanation: m.explanation ?? { headline: '', details: [], pvSan: [] },
      },
    };
  });
}

// ---------------------------------------------------------------- queue

export type JobStatus = 'queued' | 'running' | 'done' | 'cached' | 'error' | 'cancelled';

export interface Job {
  url: string;
  label: string;
  status: JobStatus;
  /** Positions analyzed / total, for the running game. */
  done: number;
  total: number;
  error?: string;
}

export interface QueueDeps {
  analyze: AnalyzeFn;
  provider: ExplanationProvider;
  store: KeyValueStore<GameAnalysis>;
  book: () => Promise<OpeningBook | null>;
  onChange: () => void;
  onAnalyzed: (a: GameAnalysis) => void;
  /** Moves classified so far for a game still being analyzed. */
  onPartial?: (url: string, moves: MoveAnalysis[]) => void;
}

/** Analyzes queued games one after another, most recent first. Pausable and cancellable. */
export class AnalysisQueue {
  jobs: Job[] = [];
  paused = false;
  private running = false;
  private cancelToken = 0;
  private resumeWaiters: (() => void)[] = [];
  private pending = new Map<string, { game: ImportedGame; userColor: Color; preset: AnalysisPreset }>();

  constructor(private deps: QueueDeps) {}

  get active(): boolean {
    return this.jobs.some((j) => j.status === 'queued' || j.status === 'running');
  }

  enqueue(items: { game: ImportedGame; userColor: Color; label: string }[], preset: AnalysisPreset): void {
    for (const it of items) {
      const existing = this.jobs.find((j) => j.url === it.game.url);
      if (existing && (existing.status === 'queued' || existing.status === 'running')) continue;
      this.jobs = this.jobs.filter((j) => j.url !== it.game.url);
      this.jobs.push({ url: it.game.url, label: it.label, status: 'queued', done: 0, total: it.game.moves.length + 1 });
      this.pending.set(it.game.url, { game: it.game, userColor: it.userColor, preset });
    }
    this.deps.onChange();
    void this.run();
  }

  pause(): void {
    this.paused = true;
    this.deps.onChange();
  }

  resume(): void {
    this.paused = false;
    this.resumeWaiters.splice(0).forEach((r) => r());
    this.deps.onChange();
  }

  /** Stops after the current position and drops everything still queued. */
  cancel(): void {
    this.cancelToken++;
    for (const j of this.jobs) if (j.status === 'queued' || j.status === 'running') j.status = 'cancelled';
    this.pending.clear();
    if (this.paused) this.resume();
    this.deps.onChange();
  }

  clearFinished(): void {
    this.jobs = this.jobs.filter((j) => j.status === 'queued' || j.status === 'running');
    this.deps.onChange();
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const job = this.jobs.find((j) => j.status === 'queued');
        if (!job) break;
        const item = this.pending.get(job.url);
        if (!item) {
          job.status = 'cancelled';
          continue;
        }
        const token = this.cancelToken;
        let cached = await this.deps.store.get(job.url);
        if (cached && cached.version < REVIEW_CONFIG.analysisVersion) {
          cached = migrateAnalysis(cached, item.game, await this.deps.book().catch(() => null));
          await this.deps.store.put(job.url, cached).catch(() => {});
        }
        if (cacheUsable(cached, item.preset.depth, REVIEW_CONFIG.analysisVersion)) {
          job.status = 'cached';
          this.pending.delete(job.url);
          this.deps.onAnalyzed(cached);
          this.deps.onChange();
          continue;
        }
        job.status = 'running';
        this.deps.onChange();
        try {
          const result = await analyzeGame(
            item.game,
            item.userColor,
            item.preset,
            this.deps.analyze,
            this.deps.provider,
            await this.deps.book().catch(() => null),
            {
              waitIfPaused: () => (this.paused ? new Promise((r) => this.resumeWaiters.push(r)) : Promise.resolve()),
              cancelled: () => token !== this.cancelToken,
            },
            (done, total) => {
              job.done = done;
              job.total = total;
              this.deps.onChange();
            },
            (moves) => this.deps.onPartial?.(job.url, moves),
          );
          this.pending.delete(job.url);
          if (!result) {
            job.status = 'cancelled';
          } else {
            await this.deps.store.put(job.url, result).catch((e) => console.warn('[review] could not cache analysis', e));
            job.status = 'done';
            this.deps.onAnalyzed(result);
          }
        } catch (e) {
          job.status = 'error';
          job.error = e instanceof Error ? e.message : String(e);
        }
        this.deps.onChange();
      }
    } finally {
      this.running = false;
    }
  }
}
