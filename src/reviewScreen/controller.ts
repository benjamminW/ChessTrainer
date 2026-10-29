/**
 * The shared game review screen (post-game in Play, and Review mode): stepping, key moments,
 * retrying a move, playing the best line, and previewing engine lines. DOM-free; the view
 * lives in reviewScreen/view.ts. Uses the app's single classifier, engine and board.
 */
import { Chess } from 'chess.js';
import { BAD_CLASSES, GOOD_HIGHLIGHTS, isBad } from '../coach/classes';
import { buildGameReview, winPercent, type GameReview, type ReviewContext } from '../coach/gameReview';
import { boardFacts, classifyMove, winDrop } from '../coach/moveClass';
import type { OpeningInfo } from '../review/openings';
import type { Analysis } from '../engine/uci';
import { parseUci, uciOf } from '../game/session';
import type { Classification, Color, PlyRecord } from '../types';
import type { BoardView } from '../ui/board';

export interface ReviewMeta {
  userColor: Color;
  white: { name: string; rating?: number };
  black: { name: string; rating?: number };
  /** e.g. "You won by checkmate". */
  resultText: string;
  timeControl?: string;
  date?: string;
  url?: string;
  opening?: OpeningInfo | null;
  /** Another site's own accuracy figures, shown separately and labeled as theirs. */
  externalAccuracy?: { you: number; opponent: number; source: string } | null;
  /** Time class, header ratings and analysis date for the rating estimate. */
  rating?: ReviewContext;
}

export interface ReviewModel {
  meta: ReviewMeta;
  startFen: string;
  /** Plies with `review` attached where analyzed (stepping works while the rest finish). */
  plies: PlyRecord[];
  /** Background analysis progress, or null when finished. */
  progress: { done: number; total: number } | null;
  /** Re-analyze deeper and replace the cached result. */
  deeper?: { label: string; running: boolean; run: () => void } | null;
  /** Changes whenever reviews are replaced (e.g. deeper analysis), so summaries recompute. */
  revision?: number;
}

export interface KeyMoment {
  index: number;
  cls: Classification;
  /** Win-chance change for the mover (negative = lost ground). */
  delta: number;
  color: Color;
}

export interface Verdict {
  san: string;
  uci: string;
  cls: Classification;
  drop: number;
  bestSan: string | null;
}

export type ScreenMode =
  | { kind: 'game' }
  | { kind: 'retry'; index: number; fen: string; lastMove: [string, string] | null; verdict: Verdict | null; busy: boolean }
  | { kind: 'line'; label: string; startFen: string; moves: string[]; k: number; playing: boolean };

export interface ScreenDeps {
  /** Cached coach analysis of a position (MultiPV), for retry, best lines and the lines panel. */
  analyze(fen: string): Promise<Analysis>;
  /** Resolved analysis if already available (no waiting). */
  resolved(fen: string): Analysis | undefined;
  requestRender(): void;
}

export const SCREEN_CONFIG = {
  /** Key moments listed per side. */
  keyMomentsPerSide: 4,
  /** Minimum win-chance swing (points) for a move to count as a key moment. */
  minSwing: 8,
  bestLineStepMs: 750,
  bestLineMoves: 8,
};

export class ReviewScreen {
  model: ReviewModel;
  /** Plies applied on the board (0 = start position). */
  step = 0;
  /** Show the position before the current move with the better-move arrow. */
  showBetter = false;
  mode: ScreenMode = { kind: 'game' };
  linesOpen = false;
  /** Summary card expanded (null = decide by screen width: collapsed on narrow screens). */
  summaryOpen: boolean | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cachedReview: { plies: PlyRecord[]; reviewed: number; revision: number; value: GameReview } | null = null;

  constructor(model: ReviewModel, private deps: ScreenDeps) {
    this.model = model;
  }

  setModel(m: ReviewModel): void {
    this.model = m;
    this.step = Math.min(this.step, m.plies.length);
  }

  get plies(): PlyRecord[] {
    return this.model.plies;
  }

  get user(): Color {
    return this.model.meta.userColor;
  }

  /** Summary numbers (memoized until more moves are analyzed). */
  review(): GameReview {
    const reviewed = this.plies.filter((p) => p.review).length;
    const revision = this.model.revision ?? 0;
    const c = this.cachedReview;
    if (c && c.plies === this.plies && c.reviewed === reviewed && c.revision === revision) return c.value;
    const value = buildGameReview(this.plies, this.user, this.model.meta.rating);
    this.cachedReview = { plies: this.plies, reviewed, revision, value };
    return value;
  }

  /** The position after `step` plies, its White-POV eval, and the evals from there to the end of the game. */
  positionAt(step: number): { fen: string; evalWhite: number | null; originalEvals: (number | null)[] } {
    const fen = step === 0 ? this.model.startFen : this.plies[step - 1].fenAfter;
    const evals = this.review().evals;
    return { fen, evalWhite: evals[step] ?? null, originalEvals: evals.slice(step) };
  }

  // ------------------------------------------------------------ navigation

  goTo(n: number): void {
    this.stopLine();
    this.mode = { kind: 'game' };
    this.step = Math.max(0, Math.min(this.plies.length, n));
    this.showBetter = false;
    this.deps.requestRender();
  }

  next(): void {
    this.goTo(this.step + 1);
  }

  prev(): void {
    this.goTo(this.step - 1);
  }

  /** The ply shown (the move that led to the current position), or null at the start. */
  get index(): number | null {
    return this.step > 0 ? this.step - 1 : null;
  }

  /** The biggest swings for each side: their worst moves, plus Brilliant/Great finds. */
  keyMoments(): { you: KeyMoment[]; opponent: KeyMoment[]; order: number[] } {
    const pick = (color: Color) =>
      this.plies
        .map((p, index) => ({ p, index }))
        .filter(({ p }) => p.color === color && p.review)
        .map(({ p, index }) => {
          const r = p.review!;
          const s = p.color === 'w' ? 1 : -1;
          return { index, cls: r.classification, color, delta: winPercent(r.evalAfter * s) - winPercent(r.evalBefore * s) };
        })
        .filter((k) => GOOD_HIGHLIGHTS.includes(k.cls) || (BAD_CLASSES.includes(k.cls) && -k.delta >= SCREEN_CONFIG.minSwing))
        .sort((a, b) => Number(GOOD_HIGHLIGHTS.includes(a.cls)) - Number(GOOD_HIGHLIGHTS.includes(b.cls)) || a.delta - b.delta)
        .slice(0, SCREEN_CONFIG.keyMomentsPerSide)
        .sort((a, b) => a.index - b.index);
    const you = pick(this.user);
    const opponent = pick(this.user === 'w' ? 'b' : 'w');
    return { you, opponent, order: [...you, ...opponent].map((k) => k.index).sort((a, b) => a - b) };
  }

  /** Jump to the next/previous key moment, showing the better move on your mistakes. */
  jumpKey(dir: 1 | -1): void {
    const { order } = this.keyMoments();
    const cur = this.index ?? -1;
    const target = dir > 0 ? order.find((i) => i > cur) : [...order].reverse().find((i) => i < cur);
    if (target !== undefined) this.showMoment(target);
  }

  /** Show move `index`; for your non-best moves, the position before it with the better move. */
  showMoment(index: number): void {
    this.goTo(index + 1);
    this.showBetter = this.canShowBetter(index);
    this.deps.requestRender();
  }

  canShowBetter(index: number): boolean {
    const p = this.plies[index];
    return !!p?.review?.bestUci && p.color === this.user && isBad(p.review.classification);
  }

  /** Your moves other than the engine's choice (and not book) can be retried. */
  canRetry(index: number): boolean {
    const p = this.plies[index];
    const r = p?.review;
    return !!r && p.color === this.user && r.classification !== 'Book' && r.bestUci !== p.uci && !['Best', 'Brilliant', 'Great'].includes(r.classification);
  }

  toggleBetter(): void {
    this.showBetter = !this.showBetter;
    this.deps.requestRender();
  }

  // ------------------------------------------------------------ retry

  /** Back to the position before move `index`, with the same side to move. */
  retry(index = this.index ?? 0): void {
    this.stopLine();
    const p = this.plies[index];
    if (!p) return;
    this.step = index + 1;
    this.mode = { kind: 'retry', index, fen: p.fenBefore, lastMove: null, verdict: null, busy: false };
    this.deps.analyze(p.fenBefore).catch(() => {});
    this.deps.requestRender();
  }

  retryAgain(): void {
    if (this.mode.kind === 'retry') this.retry(this.mode.index);
  }

  /** A move made on the board during a retry: grade it with the same classifier. */
  async tryMove(from: string, to: string, promotion?: string): Promise<void> {
    const m = this.mode;
    if (m.kind !== 'retry' || m.verdict || m.busy) return this.deps.requestRender();
    const chess = new Chess(m.fen);
    let move;
    try {
      move = chess.move({ from, to, promotion } as Parameters<Chess['move']>[0]);
    } catch {
      return this.deps.requestRender();
    }
    const uci = uciOf(move);
    m.fen = move.after;
    m.lastMove = [move.from, move.to];
    m.busy = true;
    this.deps.requestRender();
    try {
      m.verdict = await this.grade(this.plies[m.index], uci, move.san, move.after);
    } finally {
      m.busy = false;
      this.deps.requestRender();
    }
  }

  private async grade(p: PlyRecord, uci: string, san: string, fenAfter: string): Promise<Verdict> {
    const before = await this.deps.analyze(p.fenBefore);
    const top = before.lines[0];
    const bestCp = top?.cp ?? 0;
    let playedCp = before.lines.find((l) => l.pv[0] === uci)?.cp;
    if (playedCp === undefined) {
      const after = new Chess(fenAfter);
      if (after.isCheckmate()) playedCp = 100000;
      else if (after.isGameOver()) playedCp = 0;
      else playedCp = -((await this.deps.analyze(fenAfter)).lines[0]?.cp ?? 0);
    }
    const isEngineBest = top?.pv[0] === uci;
    const prev = this.plies[this.plies.indexOf(p) - 1] ?? null;
    const cls = classifyMove({
      bestCp, playedCp, secondCp: before.lines[1]?.cp ?? null, isEngineBest, inBook: false,
      ...boardFacts({ fenBefore: p.fenBefore, uci }, prev),
    });
    const bestSan = top?.pv[0] ? new Chess(p.fenBefore).move(parseUci(top.pv[0])).san : null;
    return { san, uci, cls, drop: isEngineBest ? 0 : winDrop(bestCp, playedCp), bestSan };
  }

  exitRetry(): void {
    if (this.mode.kind !== 'retry') return;
    const i = this.mode.index;
    this.mode = { kind: 'game' };
    this.step = i + 1;
    this.deps.requestRender();
  }

  // ------------------------------------------------------------ best line and line previews

  /** Plays the engine's best line from before move `index`, one move at a time. */
  async showBestLine(index = this.index ?? 0): Promise<void> {
    const p = this.plies[index];
    if (!p) return;
    const a = await this.deps.analyze(p.fenBefore);
    const pv = a.lines[0]?.pv.slice(0, SCREEN_CONFIG.bestLineMoves) ?? [];
    if (!pv.length) return;
    this.step = index + 1;
    this.playLine('Best line', p.fenBefore, pv, true);
  }

  /** Shows an engine line from the current position (lines panel); step through it, then exit. */
  previewLine(startFen: string, moves: string[], label: string): void {
    this.playLine(label, startFen, moves, false);
  }

  private playLine(label: string, startFen: string, moves: string[], autoplay: boolean): void {
    this.stopLine();
    this.mode = { kind: 'line', label, startFen, moves, k: autoplay ? 0 : 1, playing: autoplay };
    this.deps.requestRender();
    if (autoplay) this.tick();
  }

  private tick(): void {
    const m = this.mode;
    if (m.kind !== 'line' || !m.playing) return;
    if (m.k >= m.moves.length) {
      m.playing = false;
      this.deps.requestRender();
      return;
    }
    this.timer = setTimeout(() => {
      if (this.mode !== m) return;
      m.k++;
      this.deps.requestRender();
      this.tick();
    }, m.k === 0 ? 250 : SCREEN_CONFIG.bestLineStepMs);
  }

  lineStep(dir: 1 | -1): void {
    const m = this.mode;
    if (m.kind !== 'line') return;
    this.stopLine();
    m.playing = false;
    m.k = Math.max(0, Math.min(m.moves.length, m.k + dir));
    this.deps.requestRender();
  }

  exitLine(): void {
    this.stopLine();
    if (this.mode.kind === 'line') this.mode = { kind: 'game' };
    this.deps.requestRender();
  }

  private stopLine(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Position and last move after k moves of the previewed line. */
  linePosition(): { fen: string; lastMove: [string, string] | null } | null {
    const m = this.mode;
    if (m.kind !== 'line') return null;
    const chess = new Chess(m.startFen);
    let last: [string, string] | null = null;
    for (const u of m.moves.slice(0, m.k)) {
      try {
        const mv = chess.move(parseUci(u));
        last = [mv.from, mv.to];
      } catch {
        break;
      }
    }
    return { fen: chess.fen(), lastMove: last };
  }

  // ------------------------------------------------------------ board

  /** The position currently on the board (game, retry or line). */
  currentFen(): string {
    if (this.mode.kind === 'retry') return this.mode.fen;
    const lp = this.linePosition();
    if (lp) return lp.fen;
    const i = this.index;
    if (i === null) return this.model.startFen;
    return this.showBetter && this.canShowBetter(i) ? this.plies[i].fenBefore : this.plies[i].fenAfter;
  }

  boardView(): BoardView & { evalCp: number | null; showEval: boolean } {
    const user = this.user;
    const fen = this.currentFen();
    const chess = new Chess(fen);
    const base = {
      fen,
      orientation: user,
      turn: chess.turn(),
      movable: null as BoardView['movable'],
      dests: new Map<string, string[]>(),
      lastMove: null as [string, string] | null,
      check: chess.inCheck(),
      shapes: [] as BoardView['shapes'],
      badge: null as BoardView['badge'],
      squareClasses: new Map<string, string>(),
      evalCp: null as number | null,
      showEval: true,
    };

    if (this.mode.kind === 'retry') {
      const m = this.mode;
      if (!m.verdict && !m.busy) {
        base.movable = chess.turn();
        for (const mv of chess.moves({ verbose: true })) base.dests.set(mv.from, [...(base.dests.get(mv.from) ?? []), mv.to]);
      }
      base.lastMove = m.lastMove;
      if (m.verdict && m.lastMove) {
        base.badge = { square: m.lastMove[1], cls: m.verdict.cls };
        base.squareClasses.set(m.lastMove[1], `hl-${m.verdict.cls.toLowerCase()}`);
      }
      const a = this.deps.resolved(this.plies[m.index].fenBefore);
      if (a?.lines[0]) base.evalCp = a.lines[0].cp * (this.plies[m.index].color === 'w' ? 1 : -1);
      return base;
    }

    const lp = this.linePosition();
    if (lp) {
      base.lastMove = lp.lastMove;
      const a = this.deps.resolved(fen);
      if (a?.lines[0]) base.evalCp = a.lines[0].cp * (chess.turn() === 'w' ? 1 : -1);
      return base;
    }

    const i = this.index;
    if (i === null) {
      base.evalCp = this.plies[0]?.review?.evalBefore ?? null;
      return base;
    }
    const p = this.plies[i];
    const r = p.review;
    if (this.showBetter && this.canShowBetter(i)) {
      base.shapes.push({ from: r!.bestUci!.slice(0, 2), to: r!.bestUci!.slice(2, 4), brush: 'green' });
      base.shapes.push({ from: p.uci.slice(0, 2), to: p.uci.slice(2, 4), brush: 'paleRed' });
      base.evalCp = r!.evalBefore;
      return base;
    }
    base.lastMove = [p.uci.slice(0, 2), p.uci.slice(2, 4)];
    if (r) {
      base.badge = { square: p.uci.slice(2, 4), cls: r.classification };
      base.squareClasses.set(p.uci.slice(2, 4), `hl-${r.classification.toLowerCase()}`);
      base.squareClasses.set(p.uci.slice(0, 2), `hl-${r.classification.toLowerCase()} hl-from`);
      base.evalCp = r.evalAfter;
    }
    return base;
  }

  /** Board moves while retrying. */
  async onBoardMove(from: string, to: string, promotion?: string): Promise<void> {
    if (this.mode.kind === 'retry') return this.tryMove(from, to, promotion);
    this.deps.requestRender();
  }
}
