import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './themes/generated.css';
import './themes.css';
import './styles.css';

import { chooseBotMove } from './bot/bot';
import { COACH_CONFIG } from './config/coach';
import { HINT_LEVELS, buildHints, type HintStep } from './coach/hints';
import { strategicTips, tacticalTips, type Tip } from './coach/tips';
import { clampElo } from './config/strength';
import { BOARDS, PIECE_SETS } from './themes/catalog';
import type { ExplanationProvider } from './coach/provider';
import { reviewPly, terminalScore } from './coach/review';
import { isBad } from './coach/classes';
import { migrateReview } from './coach/moveClass';
import { PRESETS } from './config/review';
import { bookPrefix, identifyOpening, loadBook, type OpeningBook } from './review/openings';
import { ReviewScreen, type ReviewModel } from './reviewScreen/controller';
import { renderReviewScreen } from './reviewScreen/view';
import { RuleBasedProvider } from './coach/ruleBased';
import { ENGINE_BUILDS, Engine, SearchCancelled, type Analysis, type EngineBuild } from './engine/uci';
import { loadGame, loadSettings, saveGame, saveSettings, type Settings } from './game/persistence';
import { materialSummary } from './game/material';
import { exportPgn } from './game/pgn';
import { Session, newGameState, startFromPosition } from './game/session';
import type { Color, GameState, PlyRecord, PositionContext } from './types';
import { judgeGoal, positionLabel, winTrajectory, type PracticeOrigin, type PracticeRequest } from './game/practice';
import { askPractice } from './ui/practiceDialog';
import { renderPracticeCard, type PracticeView } from './ui/practiceCard';
import { Chess } from 'chess.js';
import { Board, type BoardView } from './ui/board';
import {
  moveLabel, renderEvalBar, renderExplanation, renderHint, renderMoves, renderPlayerBar, renderTips,
  type ExplainView,
} from './ui/panel';
import { pickPromotion } from './ui/promotion';
import { PuzzleMode } from './puzzles/controller';
import { ReviewMode } from './review/controller';
import { renderReviewPanel } from './ui/reviewPanel';
import { renderPuzzlePanel } from './ui/puzzlePanel';
import { BestMoveMode } from './analysis/controller';
import { renderAnalysisPanel } from './ui/analysisPanel';
import { LearnMode } from './learn/controller';
import { suggestLessons } from './learn/suggest';
import { TablebaseClient } from './learn/tablebase';
import { renderLearnPanel } from './ui/learnPanel';
import { openTablebaseStore } from './review/cache';
import type { PhaseStats } from './coach/gameReview';
import { h } from './ui/panel';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ELO_LABELS: [number, string][] = [
  [400, 'beginner'], [800, 'casual'], [1200, 'improving'], [1600, 'club player'], [2000, 'strong club'], [2400, 'master'],
];
const eloDesc = (elo: number) => ELO_LABELS.filter(([e]) => elo >= e).pop()?.[1] ?? '';
const colorName = (c: Color) => (c === 'w' ? 'White' : 'Black');

class App {
  settings: Settings = loadSettings();
  session: Session;
  orientation: Color;
  board: Board;
  coachEngine: Engine;
  botEngine: Engine;
  provider: ExplanationProvider = new RuleBasedProvider();

  /** Bumped whenever the game line changes under running async work (new game, takeback, branch). */
  gen = 0;
  botThinking = false;
  engineError: string | null = null;
  previewBetter = false;
  /** After a takeback: the undone user move, used to show what was better from here. */
  undone: PlyRecord | null = null;
  /** Hint levels revealed for a position (keyed by FEN so it survives navigating away and back). */
  hint: { fen: string; level: number } | null = null;
  /** Tip whose squares are highlighted on the board. */
  focusedTip: { fen: string; tip: Tip } | null = null;
  tipCache = new Map<string, { tactics: Tip[]; strategy: Tip[] }>();
  /** The post-game review screen, when open (only once the game is over). */
  screen: ReviewScreen | null = null;
  /** Bumped when reviews change (new move reviewed, deeper analysis), so the screen recomputes. */
  reviewRevision = 0;
  deepRunning: { done: number; total: number } | null = null;
  /** Opening dataset (for Book moves), loaded on first use. */
  book: OpeningBook | null = null;
  private bookPromise: Promise<OpeningBook | null> | null = null;
  puzzles: PuzzleMode;
  reviewMode: ReviewMode;
  bestMove: BestMoveMode;
  learn: LearnMode;
  /** Learn mode's engine results, by depth and FEN. */
  private learnAnalyses = new Map<string, Promise<Analysis>>();

  analyses = new Map<string, Promise<Analysis>>();
  resolved = new Map<string, Analysis>();
  reviewing = new WeakSet<PlyRecord>();

  constructor() {
    const saved = loadGame();
    // Reviews saved by the old centipawn classifier are upgraded to the current classes.
    if (saved) saved.plies.forEach((p, i) => p.review && (p.review = migrateReview(p.review, p, saved.plies[i - 1] ?? null)));
    this.session = new Session(saved ?? newGameState(this.pickColor(), this.settings.elo));
    this.orientation = this.session.state.userColor;

    this.board = new Board($('board'), (from, to) => void this.onUserMove(from, to), {
      onSelect: (sq) => this.bestMove.editClick(sq),
      onChange: (placement) => this.bestMove.editChanged(placement),
    });
    const base = import.meta.env.BASE_URL;
    // Two workers: the coach analyses at fixed depth while the bot searches at its own strength.
    // The bot always runs the lite build (its strength table was tuned on it).
    this.botEngine = new Engine(base);
    this.coachEngine = this.startCoachEngine(this.settings.engine);

    this.puzzles = new PuzzleMode({
      board: this.board,
      analyze: (fen) => this.analyze(fen),
      provider: this.provider,
      baseUrl: base,
      requestRender: () => this.render(),
      promotionHost: $('board-host'),
    });

    this.reviewMode = new ReviewMode({
      // The queue talks to the same coach engine directly (not this.analyze's in-memory cache),
      // so analyzing many games doesn't fill memory.
      analyze: (fen, opts) => this.coachEngine.analyze(fen, { ...opts, owner: 'review' }),
      provider: this.provider,
      baseUrl: base,
      requestRender: () => this.render(),
      practice: (req) => void this.startPractice(req),
      savePuzzle: (p, from) => this.puzzles.addCustom(p, from),
      hasPuzzle: (id) => this.puzzles.stats.custom.some((c) => c.puzzle[0] === id),
      coachAnalyze: (fen) => this.analyze(fen),
      resolved: (fen) => this.resolved.get(fen),
    });

    this.bestMove = new BestMoveMode({
      analyze: (fen, opts) => this.coachEngine.analyze(fen, opts),
      cancel: () => this.coachEngine.cancelAll('analysis'),
      requestRender: () => this.render(),
      promotionHost: $('board-host'),
      playPosition: () => {
        const st = this.session.state;
        return { startFen: st.startFen, moves: this.session.plies.map((p) => p.uci), cursor: this.session.cursor, userColor: st.userColor };
      },
    });

    this.learn = new LearnMode({
      analyze: (fen, depth) => {
        const key = `${depth}|${fen}`;
        let p = this.learnAnalyses.get(key);
        if (!p) {
          p = this.coachEngine.analyze(fen, { depth, multiPv: COACH_CONFIG.multiPv, owner: 'learn' });
          this.learnAnalyses.set(key, p);
          p.catch(() => this.learnAnalyses.delete(key));
        }
        return p;
      },
      provider: this.provider,
      tablebase: new TablebaseClient({ store: openTablebaseStore() }),
      requestRender: () => this.render(),
      promotionHost: $('board-host'),
    });

    this.bindUi();
    this.applyAppearance();
    this.render();
    if (this.settings.mode === 'puzzles') this.puzzles.enter();
    else if (this.settings.mode === 'review') this.reviewMode.enter();
    else if (this.settings.mode === 'analysis') this.bestMove.enter();
    else if (this.settings.mode === 'learn') this.learn.enter();
    else if (!saved) this.openNewGameDialog(true);
    if (saved) this.resume();
    if (saved?.plies.length) void this.tagBookMoves();
  }

  /** Starts the coach's engine worker; the full build falls back to lite if it can't load. */
  startCoachEngine(build: EngineBuild): Engine {
    const engine = new Engine(import.meta.env.BASE_URL, build);
    const info = ENGINE_BUILDS[build];
    $('engine-status').textContent = build === 'full' ? `Loading the full engine (${info.sizeMb} MB, first time only)…` : 'Loading engine…';
    engine.init().then(
      (opts) => {
        if (engine !== this.coachEngine) return;
        const elo = opts.find((o) => o.name === 'UCI_Elo');
        console.info(`[engine] ${engine.name} (${build}); UCI_Elo range ${elo?.min}–${elo?.max} (unused, see config/strength.ts)`, opts);
        this.engineError = null;
        $('engine-status').textContent = engine.name || `Stockfish (${info.label})`;
        this.render();
      },
      (e) => {
        if (engine !== this.coachEngine) return;
        if (build === 'full') {
          console.error(e);
          this.switchEngine('lite', `The full engine couldn't load (${e instanceof Error ? e.message : e}). Using Lite.`);
        } else this.fail(e);
      },
    );
    return engine;
  }

  /** Swaps the coach's engine build. Cached analyses are dropped so everything is re-analyzed by the new build. */
  switchEngine(build: EngineBuild, notice?: string): void {
    this.settings.engine = build;
    saveSettings(this.settings);
    $<HTMLSelectElement>('engine-build').value = build;
    const old = this.coachEngine;
    this.analyses.clear();
    this.resolved.clear();
    this.coachEngine = this.startCoachEngine(build);
    old.terminate();
    if (notice) $('engine-status').textContent = notice;
    // Reviews cancelled by the old worker finish unwinding first, then run again on the new one.
    setTimeout(() => {
      this.reviewMissing();
      if (this.settings.mode === 'play') this.analyze(this.session.fenAt(this.session.cursor)).catch(() => {});
    }, 0);
    if (this.settings.mode === 'analysis') this.bestMove.refresh();
    this.render();
  }

  /** Opening dataset, loaded once (null if it can't be loaded). */
  getBook(): Promise<OpeningBook | null> {
    this.bookPromise ??= loadBook(import.meta.env.BASE_URL).then(
      (b) => (this.book = b),
      () => null,
    );
    return this.bookPromise;
  }

  /** Marks the opening moves of a migrated game as Book (their reviews predate the Book class). */
  async tagBookMoves(): Promise<void> {
    const book = await this.getBook();
    if (!book) return;
    const plies = this.session.plies;
    const n = bookPrefix(book, plies);
    let changed = false;
    plies.slice(0, n).forEach((p) => {
      if (p.review && p.review.classification !== 'Book' && !isBad(p.review.classification)) {
        p.review = { ...p.review, classification: 'Book' };
        changed = true;
      }
    });
    if (changed) {
      this.reviewRevision++;
      this.persist();
      this.render();
    }
  }

  // ------------------------------------------------------------ game flow

  pickColor(): Color {
    const c = this.settings.colorChoice;
    return c === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : c;
  }

  get userColor(): Color {
    return this.session.state.userColor;
  }

  get coachVisible(): boolean {
    return this.settings.coachDuringPlay || this.session.isOver();
  }

  startNewGame(): void {
    this.invalidate();
    this.coachEngine.cancelAll('play');
    this.analyses.clear();
    this.resolved.clear();
    this.session = new Session(newGameState(this.pickColor(), this.settings.elo));
    this.orientation = this.userColor;
    this.hint = null;
    this.focusedTip = null;
    this.tipCache.clear();
    this.persist();
    this.render();
    this.resume();
  }

  /** Continue whatever is pending: reviews and, if it's the bot's turn, its move. */
  resume(): void {
    this.reviewMissing();
    this.analyze(this.session.fenAt(this.session.cursor)).catch(() => {});
    const s = this.session;
    if (!s.isOver() && s.turnAt(s.plies.length) !== this.userColor) void this.botTurn();
  }

  invalidate(): void {
    this.gen++;
    this.screen = null; // a takeback or branch reopens the game, so the review closes
    this.botEngine.cancelAll();
    this.botThinking = false;
    this.previewBetter = false;
  }

  async onUserMove(from: string, to: string): Promise<void> {
    if (this.settings.mode === 'puzzles') return this.puzzles.onMove(from, to);
    if (this.settings.mode === 'review') return this.reviewMode.onBoardMove(from, to, $('board-host'));
    if (this.settings.mode === 'analysis') return this.bestMove.onBoardMove(from, to);
    if (this.settings.mode === 'learn') return this.learn.onBoardMove(from, to);
    if (this.screen) {
      const color = this.screen.currentFen().split(' ')[1] as Color;
      const promo = isPromotionMove(this.screen.currentFen(), from, to) ? await pickPromotion($('board-host'), color) : undefined;
      if (promo === null) return this.render();
      return this.screen.onBoardMove(from, to, promo);
    }
    const s = this.session;
    let promotion: string | undefined;
    if (s.isPromotion(from, to)) {
      const p = await pickPromotion($('board-host'), this.userColor);
      if (!p) return this.render();
      promotion = p;
    }
    if (!s.atLatest) {
      const discard = s.plies.length - s.cursor;
      const ok = await this.confirm(
        `Play from this position? This discards the ${discard} later move${discard === 1 ? '' : 's'}.`,
        'Play from here',
      );
      if (!ok) return this.render();
      this.invalidate();
    }
    this.undone = null;
    const ply = s.play({ from, to, promotion }, 'user');
    if (!ply) return this.render();
    if (this.hint?.fen === ply.fenBefore) ply.hint = this.hint.level;
    this.afterPly();
  }

  afterPly(): void {
    this.previewBetter = false;
    this.focusedTip = null;
    this.openReviewIfOver();
    this.persist();
    this.render();
    this.resume();
  }

  async botTurn(): Promise<void> {
    if (this.botThinking) return;
    const g = this.gen;
    const fen = this.session.fenAt(this.session.plies.length);
    this.botThinking = true;
    this.render();
    try {
      const d = await chooseBotMove(this.botEngine, fen, this.session.state.elo, Math.random);
      await new Promise((r) => setTimeout(r, d.delayMs));
      if (g !== this.gen) return;
      if (d.source === 'mistake') console.debug('[bot] deliberate mistake', d);
      const s = this.session;
      const keepCursor = s.atLatest ? null : s.cursor;
      s.goTo(s.plies.length);
      s.play(d.uci, 'bot');
      if (keepCursor !== null) s.goTo(keepCursor);
      this.botThinking = false;
      this.afterPly();
    } catch (e) {
      if (!(e instanceof SearchCancelled)) this.fail(e);
    } finally {
      if (g === this.gen) this.botThinking = false;
      this.render();
    }
  }

  takeBack(): void {
    const s = this.session;
    if (s.takebackSize() === 0) return;
    this.invalidate();
    const removed = s.takeBack();
    this.undone = removed.find((p) => p.by === 'user') ?? null;
    this.persist();
    this.render();
    this.resume();
  }

  async resign(): Promise<void> {
    if (this.session.isOver()) return;
    if (!(await this.confirm('Resign this game?', 'Resign'))) return;
    this.invalidate();
    this.session.resign();
    this.openReviewIfOver();
    this.persist();
    this.render();
  }

  /** When a game has just ended, open the review if the user turned that on. */
  /** When a game has just ended, offer the review (if the user turned that on). */
  openReviewIfOver(): void {
    // Practice games show their own result card (goal, comparison, Review this game) instead.
    if (!this.session.isOver() || !this.settings.autoReview || this.session.state.practice) return;
    this.session.goTo(this.session.plies.length);
    void this.askToReview();
  }

  async askToReview(): Promise<void> {
    const dlg = $<HTMLDialogElement>('review-prompt');
    if (dlg.open) return;
    $('rp-result').textContent = this.statusText();
    $('rp-text').textContent =
      'Want to review the game? Go through it move by move with the coach, jump straight to the key moments, ' +
      'or just see the summary.';
    dlg.returnValue = '';
    dlg.showModal();
    await new Promise((resolve) => (dlg.onclose = resolve));
    if (!this.session.isOver()) return;
    const how = dlg.returnValue;
    if (how === 'walk' || how === 'summary' || how === 'key') this.openScreen(how);
  }

  // ------------------------------------------------------------ post-game review screen

  /** The finished game as a review-screen model. */
  playModel(): ReviewModel {
    const s = this.session;
    const r = s.result();
    const coachName = `Coach (${s.state.elo})`;
    const youWon = r && ((r.score === '1-0' && this.userColor === 'w') || (r.score === '0-1' && this.userColor === 'b'));
    const resultText = !r ? 'Game in progress'
      : r.reason === 'resignation' ? 'You resigned.'
      : r.score === '1/2-1/2' ? `Draw by ${r.reason}.`
      : `${youWon ? 'You won' : 'The coach won'} by ${r.reason}.`;
    const pending = s.plies.filter((p) => !p.review).length;
    const deep = this.deepRunning;
    return {
      meta: {
        userColor: this.userColor,
        white: { name: this.userColor === 'w' ? 'You' : coachName },
        black: { name: this.userColor === 'b' ? 'You' : coachName },
        resultText,
        date: new Date(s.state.startedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
        timeControl: `Against the coach at ${s.state.elo}`,
        opening: this.book ? identifyOpening(this.book, s.plies) : null,
        // No time class or known ratings: the coach's strength setting isn't a real rating.
        rating: { timeClass: null, known: {}, analyzedAt: s.state.startedAt },
      },
      startFen: s.state.startFen,
      plies: s.plies,
      progress: deep ?? (pending ? { done: s.plies.length - pending, total: s.plies.length } : null),
      revision: this.reviewRevision,
      deeper: { label: `Deeper analysis (depth ${PRESETS.deep.depth})`, running: !!deep, run: () => void this.deepReview() },
    };
  }

  /** Opens the review: from move 1, at the summary, or at the first key moment. */
  openScreen(how: 'walk' | 'summary' | 'key'): void {
    if (!this.session.isOver()) return;
    void this.getBook().then(() => this.render());
    const screen = new ReviewScreen(this.playModel(), {
      analyze: (fen) => this.analyze(fen),
      resolved: (fen) => this.resolved.get(fen),
      requestRender: () => this.render(),
    });
    if (how === 'walk') {
      screen.summaryOpen = false;
      screen.goTo(1);
    } else if (how === 'key') {
      screen.summaryOpen = false;
      screen.jumpKey(1);
    } else {
      screen.summaryOpen = true;
      screen.goTo(this.session.plies.length);
    }
    this.screen = screen;
    this.render();
    $('review').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  closeScreen(): void {
    this.screen = null;
    this.session.goTo(this.session.plies.length);
    this.render();
  }

  /** Re-analyzes every move of the finished game at the Deep preset's depth and replaces the reviews. */
  async deepReview(): Promise<void> {
    if (this.deepRunning) return;
    const g = this.gen;
    const plies = this.session.plies;
    const opts = { depth: PRESETS.deep.depth, multiPv: COACH_CONFIG.multiPv, owner: 'play' };
    const analyze = (fen: string, o: { depth: number; multiPv: number; searchMoves?: string[] }) => this.coachEngine.analyze(fen, { ...o, owner: 'play' });
    const fens = [this.session.state.startFen, ...plies.map((p) => p.fenAfter)];
    this.deepRunning = { done: 0, total: fens.length };
    this.render();
    try {
      const book = await this.getBook();
      const inBook = book ? bookPrefix(book, plies) : 0;
      const analyses: (Analysis | null)[] = [];
      for (let i = 0; i < fens.length; i++) {
        if (g !== this.gen) return;
        analyses.push(i > 0 && terminalScore(fens[i]) !== null ? null : await this.coachEngine.analyze(fens[i], opts));
        this.deepRunning = { done: i + 1, total: fens.length };
        this.render();
      }
      for (let i = 0; i < plies.length; i++) {
        if (g !== this.gen) return;
        const { review } = await reviewPly(plies[i], plies[i - 1] ?? null, analyses[i]!, analyses[i + 1], {
          userColor: this.userColor, inBook: i < inBook, provider: this.provider, analyze, owner: 'play',
        });
        plies[i].review = review;
      }
      this.reviewRevision++;
      this.persist();
    } catch (e) {
      if (!(e instanceof SearchCancelled)) console.error('[coach] deeper analysis failed', e);
    } finally {
      if (g === this.gen) this.deepRunning = null;
      this.render();
    }
  }

  async continueFromHere(): Promise<void> {
    const s = this.session;
    const discard = s.plies.length - s.cursor;
    if (!(await this.confirm(`Continue from this position? This discards the ${discard} later move${discard === 1 ? '' : 's'}.`, 'Continue'))) return;
    this.invalidate();
    this.undone = null;
    s.truncate();
    this.afterPly();
  }

  // ------------------------------------------------------------ hints and tips

  /** Hints are for the user's turn, in the game or when reviewing an earlier position. */
  canHint(): boolean {
    const s = this.session;
    return (
      !this.screen && !this.previewBetter && s.turnAt() === this.userColor && !(s.atLatest && (s.isOver() || this.botThinking))
    );
  }

  hintLevel(fen: string): number {
    return this.hint?.fen === fen ? this.hint.level : 0;
  }

  requestHint(): void {
    if (!this.canHint()) return;
    const s = this.session;
    const fen = s.fenAt();
    const level = this.hintLevel(fen);
    if (level >= HINT_LEVELS) return;
    if (level === 0 && s.atLatest) {
      s.state.hintsUsed = (s.state.hintsUsed ?? 0) + 1;
      this.persist();
    }
    this.hint = { fen, level: level + 1 };
    this.render();
    this.analyze(fen).catch(() => {});
  }

  hintView(fen: string): { steps: HintStep[]; pending: boolean } {
    const level = this.hintLevel(fen);
    if (level === 0) return { steps: [], pending: false };
    const a = this.resolved.get(fen);
    if (!a) return { steps: [], pending: true };
    return { steps: buildHints(fen, a, this.userColor).slice(0, level), pending: false };
  }

  tipsFor(fen: string): { tactics: Tip[]; strategy: Tip[] } {
    let t = this.tipCache.get(fen);
    if (!t) {
      t = { tactics: tacticalTips(fen, this.userColor), strategy: strategicTips(fen, this.userColor) };
      this.tipCache.set(fen, t);
    }
    return t;
  }

  // ------------------------------------------------------------ analysis

  analyze(fen: string): Promise<Analysis> {
    let p = this.analyses.get(fen);
    if (!p) {
      p = this.coachEngine.analyze(fen, { depth: COACH_CONFIG.depth, multiPv: COACH_CONFIG.multiPv, owner: 'play' });
      this.analyses.set(fen, p);
      p.then(
        (a) => {
          this.resolved.set(fen, a);
          if (fen === this.session.fenAt()) this.render();
        },
        () => this.analyses.delete(fen),
      );
    }
    return p;
  }

  reviewMissing(): void {
    for (const p of this.session.plies) if (!p.review) void this.review(p);
  }

  async review(ply: PlyRecord): Promise<void> {
    if (this.reviewing.has(ply)) return;
    this.reviewing.add(ply);
    try {
      const plies = this.session.plies;
      const i = plies.indexOf(ply);
      const prev = i > 0 ? plies[i - 1] : null;
      const before = await this.analyze(ply.fenBefore);
      const after = terminalScore(ply.fenAfter) === null ? await this.analyze(ply.fenAfter) : null;
      const book = await this.getBook();
      const inBook = !!book && i >= 0 && bookPrefix(book, plies.slice(0, i + 1)) === i + 1;
      const { review } = await reviewPly(ply, prev, before, after, {
        userColor: this.userColor,
        inBook,
        provider: this.provider,
        analyze: (fen, o) => this.coachEngine.analyze(fen, { ...o, owner: 'play' }),
        owner: 'play',
      });
      ply.review = review;
      this.reviewRevision++;
      if (this.session.plies.includes(ply)) this.persist();
      this.render();
    } catch (e) {
      if (!(e instanceof SearchCancelled)) console.error('[coach] review failed', e);
    } finally {
      this.reviewing.delete(ply);
    }
  }

  // ------------------------------------------------------------ rendering

  setMode(mode: Settings['mode']): void {
    if (this.settings.mode === mode) return;
    this.settings.mode = mode;
    saveSettings(this.settings);
    if (mode === 'puzzles') this.puzzles.enter();
    if (mode === 'review') this.reviewMode.enter();
    if (mode === 'analysis') this.bestMove.enter();
    else this.coachEngine.cancelAll('analysis');
    if (mode === 'learn') this.learn.enter();
    this.render();
  }

  /** A new game against the coach from a position (see startFromPosition). False if refused or cancelled. */
  async playFrom(fen: string, color: Color, o: { context?: PositionContext; practice?: PracticeOrigin; elo?: number; replaceFinished?: boolean } = {}): Promise<boolean> {
    const start = startFromPosition(fen, { userColor: color, elo: o.elo ?? this.settings.elo, context: o.context });
    if (!start.ok) {
      await this.confirm(`Can't play from this position: ${start.error}`, 'OK');
      return false;
    }
    const s = this.session;
    if (!o.replaceFinished && s.plies.length && !s.isOver() && !(await this.confirm('Start a new game from this position? Your current game will be replaced.', 'Start'))) return false;
    if (o.practice) start.state.practice = o.practice;
    this.invalidate();
    this.undone = null;
    this.hint = null;
    this.session = new Session(start.state);
    this.orientation = color;
    this.persist();
    this.setMode('play');
    this.render();
    this.resume();
    return true;
  }

  /** "Play from here" from a review: ask how to play it, then start a practice game that remembers the way back. */
  async startPractice(req: PracticeRequest): Promise<void> {
    const choice = await askPractice({ fen: req.fen, evalWhite: req.evalWhite, label: req.label, retry: req.retry, elo: this.settings.elo });
    if (!choice) return;
    this.settings.elo = choice.elo;
    saveSettings(this.settings);
    const origin: PracticeOrigin = {
      source: req.back.source,
      url: req.back.url,
      // From Play's own review, the finished game is kept so Back to review can restore it.
      game: req.back.source === 'play' ? stripPractice(this.session.state) : undefined,
      step: req.back.step,
      goal: choice.goal,
      evalStart: req.evalWhite,
      originalEvals: req.originalEvals,
      retry: req.retry,
      label: req.label,
    };
    await this.playFrom(req.fen, choice.userColor, { context: { label: req.label }, practice: origin, elo: choice.elo, replaceFinished: req.back.source === 'play' });
  }

  /** Same position, same side and goal, a fresh game. */
  async practiceAgain(): Promise<void> {
    const st = this.session.state;
    if (!st.practice) return;
    await this.playFrom(st.startFen, st.userColor, { context: st.context, practice: st.practice, elo: st.elo, replaceFinished: true });
  }

  /** What the practice card shows: the goal, and once the game is over, the verdict and both games' winning chances. */
  practiceView(): PracticeView | null {
    const s = this.session;
    const o = s.state.practice;
    if (!o) return null;
    const result = s.result();
    const mine = [o.evalStart, ...s.plies.map((p) => p.review?.evalAfter ?? null)];
    return {
      origin: o,
      result: result ? judgeGoal(o.goal, result, this.userColor) : null,
      pending: s.plies.filter((p) => !p.review).length,
      mine: winTrajectory(mine, this.userColor),
      original: winTrajectory(o.originalEvals, this.userColor),
      reviewOpen: !!this.screen,
    };
  }

  /** Back to the exact review position the practice game came from. */
  async backToReview(): Promise<void> {
    const s = this.session;
    const o = s.state.practice;
    if (!o) return;
    if (o.source === 'play') {
      if (!o.game) return;
      if (s.plies.length && !s.isOver() && !(await this.confirm('Leave this practice game and go back to the review?', 'Go back'))) return;
      this.invalidate();
      this.session = new Session(o.game);
      this.orientation = o.game.userColor;
      this.persist();
      this.setMode('play');
      this.openScreen('summary');
      this.screen?.goTo(o.step);
      this.render();
      return;
    }
    // Review mode: the practice game stays in Play; the Chess.com game reopens at the same step.
    this.setMode('review');
    if (!o.url || !this.reviewMode.returnTo(o.url, o.step)) {
      await this.confirm("That game isn't loaded in Review right now. Load your games there and open it again.", 'OK');
    }
    this.render();
  }

  renderReview(): void {
    const view = this.reviewMode.boardView();
    this.board.render(view);
    renderEvalBar($('evalbar'), view.evalCp, view.orientation, view.showEval);
    renderReviewPanel($('review-panel'), this.reviewMode, $('coach-line'), (f) => this.resolved.get(f), (f) => void this.analyze(f).catch(() => {}), (phases) => this.lessonSuggestions(phases));
  }

  renderAnalysis(): void {
    const view = this.bestMove.boardView();
    this.board.render(view);
    renderEvalBar($('evalbar'), view.evalCp, view.orientation, !this.bestMove.edit);
    renderAnalysisPanel($('analysis-panel'), this.bestMove);
    $('coach-line').hidden = true;
    $('continue-here').hidden = true;
  }

  renderLearn(): void {
    this.board.render(this.learn.boardView());
    renderEvalBar($('evalbar'), null, 'w', false);
    renderLearnPanel($('learn-panel'), this.learn, (theme) => this.openPuzzleTheme(theme));
    $('coach-line').hidden = true;
    $('continue-here').hidden = true;
  }

  /** "Practice this theme": Puzzle mode, rated puzzles of that Lichess theme. */
  openPuzzleTheme(theme: string): void {
    this.setMode('puzzles');
    this.puzzles.setPrefs({ theme, source: 'rated' });
  }

  /** Under a review's summary: lessons for the weakest phase, and which grade triggered it. */
  lessonSuggestions(phases: PhaseStats[]): HTMLElement | null {
    const sg = suggestLessons(phases, this.learn.progress);
    if (!sg) return null;
    const name = { opening: 'opening', middlegame: 'middlegame', endgame: 'endgame' }[sg.phase];
    return h('div', { class: 'rs-learn' },
      h('p', { class: 'small' }, h('strong', {}, 'Suggested lessons. '),
        `Your ${name} was graded ${sg.grade} (about ${sg.avgDrop.toFixed(1)} points of winning chance lost per move over ${sg.counted} counted moves).`),
      h('div', { class: 'controls' }, ...sg.lessons.map((l) =>
        h('button', { type: 'button', class: 'btn small', onclick: () => this.openLesson(l.id) }, l.title))));
  }

  openLesson(id: string): void {
    this.setMode('learn');
    this.learn.open(id);
  }

  /** Puzzle mode draws the shared board, the eval bar (analysis only) and its own panel. */
  renderPuzzles(): void {
    const resolved = (fen: string) => this.resolved.get(fen);
    const view = this.puzzles.boardView(resolved);
    this.board.render(view);
    renderEvalBar($('evalbar'), view.evalCp, view.orientation, !!this.puzzles.analysisBoard);
    renderPuzzlePanel($('puzzle-panel'), this.puzzles, resolved);
  }

  render(): void {
    const mode = this.settings.mode;
    document.body.classList.toggle('mode-puzzles', mode !== 'play');
    document.body.classList.toggle('mode-analysis', mode === 'analysis');
    document.body.classList.toggle('mode-learn', mode === 'learn');
    $('play-panel').hidden = mode !== 'play';
    $('puzzle-panel').hidden = mode !== 'puzzles';
    $('review-panel').hidden = mode !== 'review';
    $('analysis-panel').hidden = mode !== 'analysis';
    $('learn-panel').hidden = mode !== 'learn';
    for (const m of ['play', 'puzzles', 'review', 'analysis', 'learn']) $(`mode-${m}`).setAttribute('aria-selected', String(mode === m));
    if (mode === 'puzzles') return this.renderPuzzles();
    if (mode === 'review') return this.renderReview();
    if (mode === 'analysis') return this.renderAnalysis();
    if (mode === 'learn') return this.renderLearn();

    const s = this.session;
    const over = s.result();
    if (!over) this.screen = null;
    const screen = this.screen;
    if (screen) screen.setModel(this.playModel());
    const coach = this.coachVisible;
    const viewed = s.cursor > 0 ? s.plies[s.cursor - 1] : null;
    const review = viewed?.review;
    // The user's move shown in the coach card: the viewed ply, or the one the viewed bot move answered.
    const prevPly = s.cursor > 1 ? s.plies[s.cursor - 2] : null;
    const userPly = viewed?.by === 'user' ? viewed : prevPly?.by === 'user' ? prevPly : null;
    const userReview = userPly?.review;
    const canPreview = coach && !!userReview?.bestUci && isBad(userReview.classification);
    const preview = this.previewBetter && canPreview;

    // Board
    const shapes: BoardView['shapes'] = [];
    let fen = s.fenAt();
    let lastMove: [string, string] | null = viewed ? [viewed.uci.slice(0, 2), viewed.uci.slice(2, 4)] : null;
    if (preview && userPly && userReview?.bestUci) {
      fen = userPly.fenBefore;
      lastMove = null;
      shapes.push({ from: userReview.bestUci.slice(0, 2), to: userReview.bestUci.slice(2, 4), brush: 'green' });
      shapes.push({ from: userPly.uci.slice(0, 2), to: userPly.uci.slice(2, 4), brush: 'paleRed' });
    }
    const undone = this.undone;
    const showUndone = coach && s.atLatest && !!undone?.review && undone.fenBefore === s.fenAt();
    if (showUndone && undone?.review?.bestUci && undone.review.classification !== 'Best') {
      shapes.push({ from: undone.review.bestUci.slice(0, 2), to: undone.review.bestUci.slice(2, 4), brush: 'green' });
      shapes.push({ from: undone.uci.slice(0, 2), to: undone.uci.slice(2, 4), brush: 'paleRed' });
    }
    // Hints are shown even with the coach hidden: the user asked for them.
    const hint = preview ? { steps: [], pending: false } : this.hintView(fen);
    const hintShapes: BoardView['shapes'] = [];
    for (const st of hint.steps) {
      for (const c of st.circles) hintShapes.push({ from: c, brush: st.level === 1 ? 'yellow' : 'green' });
      if (st.arrow) hintShapes.push({ from: st.arrow.from, to: st.arrow.to, brush: 'blue' });
    }
    const focus = coach && this.focusedTip?.fen === fen ? this.focusedTip.tip : null;
    if (focus) for (const sq of focus.squares) shapes.push({ from: sq, brush: focus.kind === 'tactic' ? 'red' : 'paleBlue' });

    let turn = fen.split(' ')[1] as Color;
    if (screen) {
      // The review screen owns the board while it's open.
      const v = screen.boardView();
      fen = v.fen;
      turn = v.turn;
      this.board.render({ ...v, orientation: this.orientation });
      renderEvalBar($('evalbar'), v.evalCp, this.orientation, true);
    } else {
      const userCanMove = !preview && turn === this.userColor && !(s.atLatest && (over || this.botThinking));
      const chess = s.chessAt();
      this.board.render({
        fen,
        orientation: this.orientation,
        turn,
        movable: userCanMove ? this.userColor : null,
        dests: userCanMove ? s.legalDests() : new Map(),
        lastMove,
        check: !preview && chess.inCheck(),
        shapes: [...(coach ? shapes : []), ...hintShapes],
      });

      // Eval bar: the viewed position's eval.
      let cp: number | null = null;
      if (preview && userReview) cp = userReview.evalBefore;
      else if (review) cp = review.evalAfter;
      else {
        const a = this.resolved.get(fen);
        if (a?.lines[0]) cp = a.lines[0].cp * (turn === 'w' ? 1 : -1);
      }
      renderEvalBar($('evalbar'), cp, this.orientation, coach);
    }

    // Player bars: the side at the top of the board above it, the other below.
    const material = materialSummary(fen);
    const bar = (c: Color) => ({
      name: c === this.userColor ? 'You' : `Coach (${s.state.elo})`,
      status: c !== this.userColor && this.botThinking && s.atLatest ? 'thinking…' : undefined,
      toMove: !over && turn === c,
      captured: material[c].captured,
      capturedColor: (c === 'w' ? 'b' : 'w') as Color,
      lead: material[c].lead,
    });
    renderPlayerBar($('bar-top'), bar(this.orientation === 'w' ? 'b' : 'w'));
    renderPlayerBar($('bar-bottom'), bar(this.orientation));

    // Status
    $('status').textContent = this.statusText();
    const hints = s.state.hintsUsed ?? 0;
    $('game-info').textContent =
      `You play ${colorName(this.userColor)} against the coach at ${s.state.elo} Elo.` +
      (s.state.context ? ` Started from a position: ${s.state.context.label}.` : '') +
      (hints ? ` Hints used: ${hints}.` : '');
    const level = this.hintLevel(fen);
    const hintBtn = $<HTMLButtonElement>('btn-hint');
    hintBtn.disabled = !this.canHint() || level >= HINT_LEVELS;
    hintBtn.textContent = ['Hint', 'More help', 'Show the move', 'Hint'][level];
    renderHint($('hint'), hint);
    const tips = this.tipsFor(fen);
    renderTips($('tips'), {
      hidden: !coach,
      tactics: tips.tactics,
      strategy: tips.strategy,
      focused: focus,
      onSelect: (tip) => {
        const same = this.focusedTip?.fen === fen && this.focusedTip.tip === tip;
        this.focusedTip = same || !tip.squares.length ? null : { fen, tip };
        this.render();
      },
    });
    $('takeback-count').textContent = String(s.state.takebacks);
    $<HTMLButtonElement>('btn-takeback').disabled = s.takebackSize() === 0;
    $<HTMLButtonElement>('btn-resign').disabled = !!over;
    $<HTMLButtonElement>('nav-first').disabled = s.cursor === 0;
    $<HTMLButtonElement>('nav-prev').disabled = s.cursor === 0;
    $<HTMLButtonElement>('nav-next').disabled = s.atLatest;
    $<HTMLButtonElement>('nav-last').disabled = s.atLatest;
    // Any earlier position can become the new end of the game, whoever is to move there.
    $('continue-here').hidden = s.atLatest || !!screen;
    $<HTMLInputElement>('coach-toggle').checked = this.settings.coachDuringPlay;
    $<HTMLInputElement>('review-toggle').checked = this.settings.autoReview;

    // Game review screen (once the game is over)
    const reviewBtn = $<HTMLButtonElement>('btn-review');
    reviewBtn.disabled = !over;
    reviewBtn.textContent = screen ? 'Close review' : 'Game review';
    reviewBtn.setAttribute('aria-pressed', screen ? 'true' : 'false');
    for (const id of ['coach-card', 'tips-card', 'moves-card']) $(id).hidden = !!screen;
    const reviewEl = $('review');
    const coachLine = $('coach-line');
    reviewEl.hidden = !screen;
    coachLine.hidden = !screen;
    if (screen) {
      renderReviewScreen(reviewEl, coachLine, screen, (f) => this.resolved.get(f), (f) => void this.analyze(f).catch(() => {}), {
        before: [h2('Game review'), closeButton(() => this.closeScreen())],
        learn: (phases) => this.lessonSuggestions(phases),
        playFrom: (step, retry) => {
          const at = screen.positionAt(step);
          void this.startPractice({ ...at, label: `your game against the coach, ${positionLabel(at.fen)}`, retry, back: { source: 'play', step: screen.step } });
        },
      });
    }
    renderPracticeCard($('practice-card'), this.practiceView(), {
      back: () => void this.backToReview(),
      again: () => void this.practiceAgain(),
      review: () => this.openScreen('summary'),
    });

    // Explanation
    const view: ExplainView = { kind: 'start' };
    if (!coach) view.kind = 'hidden';
    else if (viewed) {
      view.kind = 'moves';
      const entry = (ply: PlyRecord) =>
        ply === userPly && canPreview
          ? {
              ply,
              previewOn: preview,
              onTogglePreview: () => {
                this.previewBetter = !this.previewBetter;
                this.render();
              },
            }
          : { ply };
      view.entries = userPly && userPly !== viewed ? [entry(userPly), entry(viewed)] : [entry(viewed)];
    }
    if (showUndone && undone?.review) {
      view.takebackNote = { san: undone.san, classification: undone.review.classification, bestSan: undone.review.bestSan };
      if (view.kind === 'moves') view.kind = 'start';
    }
    renderExplanation($('explain'), view);

    renderMoves($('moves'), s.plies, s.cursor, coach, (n) => {
      this.previewBetter = false;
      s.goTo(n);
      this.render();
    });
  }

  statusText(): string {
    if (this.engineError) return `Engine error: ${this.engineError}`;
    const s = this.session;
    if (this.screen) return `Reviewing the game: ${this.screen.step ? `after ${moveLabel(s.plies[this.screen.step - 1])}` : 'start position'}. Use ← → to step through.`;
    const r = s.result();
    const viewing = s.cursor > 0 ? moveLabel(s.plies[s.cursor - 1]) : 'the start';
    if (r) {
      const youWon = (r.score === '1-0' && this.userColor === 'w') || (r.score === '0-1' && this.userColor === 'b');
      const result =
        r.reason === 'resignation' ? 'You resigned. The coach wins.'
        : r.score === '1/2-1/2' ? `Draw by ${r.reason}.`
        : `${r.reason === 'checkmate' ? 'Checkmate' : r.reason}. ${youWon ? 'You win!' : 'The coach wins.'}`;
      return s.atLatest ? result : `${result} Viewing the position after ${viewing}.`;
    }
    if (!s.atLatest) {
      return `Reviewing after ${viewing}. Press End or ⏭ to return to the game.`;
    }
    if (this.botThinking) return 'Coach is thinking…';
    const inCheck = s.chessAt().inCheck();
    return s.turnAt() === this.userColor ? (inCheck ? 'Your move. You are in check.' : 'Your move.') : 'Coach to move…';
  }

  // ------------------------------------------------------------ UI wiring

  bindUi(): void {
    $('btn-new').addEventListener('click', () => this.openNewGameDialog(false));
    $('mode-play').addEventListener('click', () => this.setMode('play'));
    $('mode-puzzles').addEventListener('click', () => this.setMode('puzzles'));
    $('mode-review').addEventListener('click', () => this.setMode('review'));
    $('mode-analysis').addEventListener('click', () => this.setMode('analysis'));
    $('mode-learn').addEventListener('click', () => this.setMode('learn'));
    $('btn-hint').addEventListener('click', () => this.requestHint());
    const build = $<HTMLSelectElement>('engine-build');
    build.value = this.settings.engine;
    build.addEventListener('change', async () => {
      const next = build.value as EngineBuild;
      if (next === this.settings.engine) return;
      if (next === 'full' && !(await this.confirm(`The full engine is a one-time ${ENGINE_BUILDS.full.sizeMb} MB download (then cached by your browser). It analyzes more accurately but each search takes about twice as long. Use it?`, 'Download'))) {
        build.value = this.settings.engine;
        return;
      }
      this.switchEngine(next);
    });
    const fill = (id: string, options: { id: string; name: string }[]) =>
      $<HTMLSelectElement>(id).replaceChildren(...options.map((o) => new Option(o.name, o.id)));
    fill('board-theme', BOARDS);
    fill('piece-set', PIECE_SETS);
    $<HTMLSelectElement>('board-theme').addEventListener('change', (e) => {
      this.settings.boardTheme = (e.target as HTMLSelectElement).value;
      saveSettings(this.settings);
      this.applyAppearance();
    });
    $<HTMLSelectElement>('piece-set').addEventListener('change', (e) => {
      this.settings.pieceSet = (e.target as HTMLSelectElement).value;
      saveSettings(this.settings);
      this.applyAppearance();
    });
    $('btn-takeback').addEventListener('click', () => this.takeBack());
    $('btn-flip').addEventListener('click', () => {
      this.orientation = this.orientation === 'w' ? 'b' : 'w';
      this.render();
    });
    $('btn-resign').addEventListener('click', () => void this.resign());
    $('btn-pgn').addEventListener('click', () => this.downloadPgn());
    $('continue-here').addEventListener('click', () => void this.continueFromHere());
    $('btn-review').addEventListener('click', () => (this.screen ? this.closeScreen() : this.openScreen('summary')));
    $<HTMLInputElement>('review-toggle').addEventListener('change', (e) => {
      this.settings.autoReview = (e.target as HTMLInputElement).checked;
      saveSettings(this.settings);
    });
    $<HTMLInputElement>('coach-toggle').addEventListener('change', (e) => {
      this.settings.coachDuringPlay = (e.target as HTMLInputElement).checked;
      saveSettings(this.settings);
      this.render();
    });

    const nav = (n: number) => {
      if (this.settings.mode === 'analysis') return this.bestMove.goTo(n);
      // While the review is open, the board buttons step through it instead.
      if (this.screen) return this.screen.goTo(n);
      this.previewBetter = false;
      this.session.goTo(n);
      this.render();
    };
    $('nav-first').addEventListener('click', () => nav(0));
    const analysis = () => this.settings.mode === 'analysis';
    $('nav-prev').addEventListener('click', () => nav((analysis() ? this.bestMove.cursor : this.session.cursor) - 1));
    $('nav-next').addEventListener('click', () => nav((analysis() ? this.bestMove.cursor : this.session.cursor) + 1));
    $('nav-last').addEventListener('click', () => nav(analysis() ? this.bestMove.moves.length : this.session.plies.length));
    document.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]') || (e.target as HTMLElement).closest('input, textarea, select')) return;
      if (this.settings.mode === 'puzzles') {
        if (e.key === 'h' && !e.metaKey && !e.ctrlKey && !e.altKey) this.puzzles.hint();
        return;
      }
      if (this.settings.mode === 'learn') {
        const lm = this.learn;
        if (lm.view !== 'lesson') return;
        const keys: Record<string, () => void> = { ArrowLeft: () => lm.prev(), ArrowRight: () => lm.next(), h: () => lm.hint() };
        if (keys[e.key] && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          keys[e.key]();
        }
        return;
      }
      if (this.settings.mode === 'analysis') {
        const bm = this.bestMove;
        if (bm.edit) return;
        const keys: Record<string, () => void> = {
          ArrowLeft: () => bm.goTo(bm.cursor - 1),
          ArrowRight: () => bm.goTo(bm.cursor + 1),
          Home: () => bm.goTo(0),
          End: () => bm.goTo(bm.moves.length),
        };
        if (keys[e.key]) {
          e.preventDefault();
          keys[e.key]();
        }
        return;
      }
      if (this.settings.mode === 'review') {
        const rs = this.reviewMode.view === 'game' ? this.reviewMode.screen : null;
        if (rs && screenKey(rs, e)) e.preventDefault();
        return;
      }
      if (this.screen) {
        if (screenKey(this.screen, e)) e.preventDefault();
        else if (e.key === 'Escape') this.closeScreen();
        return;
      }
      const keys: Record<string, () => number> = {
        ArrowLeft: () => this.session.cursor - 1,
        ArrowRight: () => this.session.cursor + 1,
        Home: () => 0,
        End: () => this.session.plies.length,
      };
      if (keys[e.key]) {
        e.preventDefault();
        nav(keys[e.key]());
      } else if (e.key === 'h' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        this.requestHint();
      }
    });

    const elo = $<HTMLInputElement>('elo');
    elo.addEventListener('input', () => {
      $('elo-out').textContent = elo.value;
      $('elo-desc').textContent = `(${eloDesc(+elo.value)})`;
    });
  }

  openNewGameDialog(firstRun: boolean): void {
    const dlg = $<HTMLDialogElement>('new-game-dialog');
    const elo = $<HTMLInputElement>('elo');
    elo.value = String(this.settings.elo);
    elo.dispatchEvent(new Event('input'));
    for (const r of dlg.querySelectorAll<HTMLInputElement>('input[name=color]')) r.checked = r.value === this.settings.colorChoice;
    $('ng-cancel').hidden = firstRun;
    dlg.returnValue = '';
    dlg.onclose = () => {
      if (dlg.returnValue === 'start' || firstRun) {
        const color = dlg.querySelector<HTMLInputElement>('input[name=color]:checked')!.value as Settings['colorChoice'];
        this.settings = { ...this.settings, elo: clampElo(+elo.value), colorChoice: color };
        saveSettings(this.settings);
        this.startNewGame();
      }
    };
    dlg.showModal();
  }

  confirm(text: string, okLabel = 'OK'): Promise<boolean> {
    const dlg = $<HTMLDialogElement>('confirm-dialog');
    $('confirm-text').textContent = text;
    $('confirm-ok').textContent = okLabel;
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise((resolve) => {
      dlg.onclose = () => resolve(dlg.returnValue === 'ok');
    });
  }

  downloadPgn(): void {
    const pgn = exportPgn(this.session.state);
    const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `chess-coach-${this.session.state.startedAt.slice(0, 10)}.pgn`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  applyAppearance(): void {
    for (const b of BOARDS) document.body.classList.toggle(`board-${b.id}`, this.settings.boardTheme === b.id);
    for (const p of PIECE_SETS) document.body.classList.toggle(`pieces-${p.id}`, this.settings.pieceSet === p.id);
    $<HTMLSelectElement>('board-theme').value = this.settings.boardTheme;
    $<HTMLSelectElement>('piece-set').value = this.settings.pieceSet;
  }

  persist(): void {
    saveGame(this.session.state);
  }

  fail(e: unknown): void {
    console.error(e);
    this.engineError = e instanceof Error ? e.message : String(e);
    $('engine-status').textContent = 'Engine failed to load';
    this.render();
  }
}

const app = new App();
// Dev server only (stripped from production builds): lets tests drive the app from the console.
if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;

/** A finished game kept for Back to review (without its own practice link, so they don't nest). */
function stripPractice(st: GameState): GameState {
  const { practice: _p, ...rest } = st;
  return structuredClone(rest);
}

function isPromotionMove(fen: string, from: string, to: string): boolean {
  return new Chess(fen).moves({ verbose: true }).some((m) => m.from === from && m.to === to && !!m.promotion);
}

function h2(text: string): HTMLElement {
  const el = document.createElement('h2');
  el.textContent = text;
  return el;
}

function closeButton(onClick: () => void): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn small rs-close';
  b.textContent = 'Close';
  b.addEventListener('click', onClick);
  return b;
}

/** Keyboard for a review screen: ← → step, Home/End, Shift+← → jump between key moments. */
function screenKey(rs: ReviewScreen, e: KeyboardEvent): boolean {
  if (rs.mode.kind === 'line' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    rs.lineStep(e.key === 'ArrowRight' ? 1 : -1);
    return true;
  }
  if (rs.mode.kind !== 'game') return false;
  const map: Record<string, () => void> = {
    ArrowLeft: () => (e.shiftKey ? rs.jumpKey(-1) : rs.prev()),
    ArrowRight: () => (e.shiftKey ? rs.jumpKey(1) : rs.next()),
    Home: () => rs.goTo(0),
    End: () => rs.goTo(rs.plies.length),
  };
  if (!map[e.key]) return false;
  map[e.key]();
  return true;
}
