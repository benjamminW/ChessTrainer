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
import { scoreMove, terminalScore } from './coach/review';
import { RuleBasedProvider } from './coach/ruleBased';
import { Engine, SearchCancelled, type Analysis } from './engine/uci';
import { loadGame, loadSettings, saveGame, saveSettings, type Settings } from './game/persistence';
import { materialSummary } from './game/material';
import { exportPgn } from './game/pgn';
import { Session, newGameState } from './game/session';
import type { Color, PlyRecord } from './types';
import { Board, type BoardView } from './ui/board';
import {
  moveLabel, renderEvalBar, renderExplanation, renderHint, renderMoves, renderPlayerBar, renderTips,
  type ExplainView,
} from './ui/panel';
import { pickPromotion } from './ui/promotion';
import { buildGameReview } from './coach/gameReview';
import { renderReviewCard } from './ui/reviewCard';
import { PuzzleMode } from './puzzles/controller';
import { renderPuzzlePanel } from './ui/puzzlePanel';
import { BAD_CLASSES, nextMistake, renderWalkthrough } from './ui/walkthrough';

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
  /** Whether the game review card is open (only shown once the game is over). */
  reviewOpen = false;
  /** Ply index being explained in the move-by-move review, or null when not in it. */
  walk: number | null = null;
  puzzles: PuzzleMode;

  analyses = new Map<string, Promise<Analysis>>();
  resolved = new Map<string, Analysis>();
  reviewing = new WeakSet<PlyRecord>();

  constructor() {
    const saved = loadGame();
    this.session = new Session(saved ?? newGameState(this.pickColor(), this.settings.elo));
    this.orientation = this.session.state.userColor;

    this.board = new Board($('board'), (from, to) => void this.onUserMove(from, to));
    const base = import.meta.env.BASE_URL;
    // Two workers: the coach analyses at fixed depth while the bot searches at its own strength.
    this.coachEngine = new Engine(base);
    this.botEngine = new Engine(base);
    this.coachEngine.init().then(
      (opts) => {
        const elo = opts.find((o) => o.name === 'UCI_Elo');
        console.info(`[engine] ${this.coachEngine.name}; UCI_Elo range ${elo?.min}–${elo?.max} (unused, see config/strength.ts)`, opts);
        $('engine-status').textContent = this.coachEngine.name || 'Engine ready';
      },
      (e) => this.fail(e),
    );

    this.puzzles = new PuzzleMode({
      board: this.board,
      analyze: (fen) => this.analyze(fen),
      provider: this.provider,
      baseUrl: base,
      requestRender: () => this.render(),
      promotionHost: $('board-host'),
    });

    this.bindUi();
    this.applyAppearance();
    this.render();
    if (this.settings.mode === 'puzzles') this.puzzles.enter();
    else if (!saved) this.openNewGameDialog(true);
    if (saved) this.resume();
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
    this.reviewOpen = false;
    this.coachEngine.cancelAll();
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
    this.reviewOpen = false; // a takeback or branch reopens the game, so the review closes
    this.walk = null;
    this.botEngine.cancelAll();
    this.botThinking = false;
    this.previewBetter = false;
  }

  async onUserMove(from: string, to: string): Promise<void> {
    if (this.settings.mode === 'puzzles') return this.puzzles.onMove(from, to);
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
    if (!this.session.isOver() || !this.settings.autoReview) return;
    this.session.goTo(this.session.plies.length);
    void this.askToReview();
  }

  async askToReview(): Promise<void> {
    const dlg = $<HTMLDialogElement>('review-prompt');
    if (dlg.open) return;
    $('rp-result').textContent = this.statusText();
    $('rp-text').textContent =
      'Want to go through the game move by move? The coach will step through every move and, ' +
      'at each of your mistakes, show what you could have done better.';
    dlg.returnValue = '';
    dlg.showModal();
    await new Promise((resolve) => (dlg.onclose = resolve));
    if (!this.session.isOver()) return;
    if (dlg.returnValue === 'walk') this.startWalkthrough();
    else if (dlg.returnValue === 'summary') {
      this.reviewOpen = true;
      this.render();
    }
  }

  // ------------------------------------------------------------ move-by-move review

  isUserMistake(i: number): boolean {
    const p = this.session.plies[i];
    return !!p && p.color === this.userColor && !!p.review && BAD_CLASSES.includes(p.review.classification);
  }

  startWalkthrough(): void {
    if (!this.session.isOver() || this.session.plies.length === 0) return;
    this.reviewOpen = false;
    this.walkGo(0);
    $('walkthrough').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** Shows ply `i`: the position after it, or for your mistakes the position before it with the better move. */
  walkGo(i: number): void {
    const s = this.session;
    this.walk = Math.max(0, Math.min(s.plies.length - 1, i));
    s.goTo(this.walk + 1);
    this.previewBetter = this.isUserMistake(this.walk);
    this.render();
  }

  exitWalkthrough(): void {
    this.walk = null;
    this.previewBetter = false;
    this.session.goTo(this.session.plies.length);
    this.reviewOpen = true;
    this.render();
  }

  /** Leave the review at the position before this move so the user can play it differently. */
  walkTry(): void {
    if (this.walk === null) return;
    const i = this.walk;
    this.walk = null;
    this.reviewOpen = false;
    this.previewBetter = false;
    this.session.goTo(i);
    this.render();
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
      this.walk === null && !this.previewBetter && s.turnAt() === this.userColor && !(s.atLatest && (s.isOver() || this.botThinking))
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
      p = this.coachEngine.analyze(fen, { depth: COACH_CONFIG.depth, multiPv: COACH_CONFIG.multiPv });
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
      const numbers = scoreMove(ply, before, after);
      const explanation = await this.provider.explain({ ply, prev, userColor: this.userColor, before, after, numbers });
      ply.review = {
        classification: numbers.classification,
        cpLoss: numbers.cpLoss,
        evalBefore: numbers.evalBefore,
        evalAfter: numbers.evalAfter,
        bestUci: numbers.bestUci,
        bestSan: numbers.bestSan,
        explanation,
      };
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
    this.render();
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
    const puzzleMode = this.settings.mode === 'puzzles';
    document.body.classList.toggle('mode-puzzles', puzzleMode);
    $('play-panel').hidden = puzzleMode;
    $('puzzle-panel').hidden = !puzzleMode;
    $('mode-play').setAttribute('aria-selected', String(!puzzleMode));
    $('mode-puzzles').setAttribute('aria-selected', String(puzzleMode));
    if (puzzleMode) return this.renderPuzzles();

    const s = this.session;
    const over = s.result();
    const coach = this.coachVisible;
    const viewed = s.cursor > 0 ? s.plies[s.cursor - 1] : null;
    const review = viewed?.review;
    // The user's move shown in the coach card: the viewed ply, or the one the viewed bot move answered.
    const prevPly = s.cursor > 1 ? s.plies[s.cursor - 2] : null;
    const userPly = viewed?.by === 'user' ? viewed : prevPly?.by === 'user' ? prevPly : null;
    const userReview = userPly?.review;
    const canPreview =
      coach && !!userReview?.bestUci && ['Inaccuracy', 'Mistake', 'Blunder'].includes(userReview.classification);
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

    const turn = fen.split(' ')[1] as Color;
    if (this.walk !== null && (!over || this.walk >= s.plies.length)) this.walk = null;
    const walking = this.walk !== null;
    const userCanMove =
      !walking && !preview && turn === this.userColor && !(s.atLatest && (over || this.botThinking));
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
    $('continue-here').hidden = s.atLatest || this.walk !== null;
    $<HTMLInputElement>('coach-toggle').checked = this.settings.coachDuringPlay;
    $<HTMLInputElement>('review-toggle').checked = this.settings.autoReview;

    // Game review (once the game is over)
    const showReview = this.reviewOpen && !!over && !walking;
    const gameReview = over && (showReview || walking) ? buildGameReview(s.plies, this.userColor) : null;
    $('coach-card').hidden = walking;
    $('tips-card').hidden = walking;
    const walkEl = $('walkthrough');
    walkEl.hidden = !walking;
    if (walking && gameReview) {
      renderWalkthrough(walkEl, {
        plies: s.plies,
        step: this.walk!,
        userColor: this.userColor,
        moments: gameReview.moments,
        previewOn: preview,
        onTogglePreview: () => {
          this.previewBetter = !this.previewBetter;
          this.render();
        },
        onGo: (i) => this.walkGo(i),
        onNextMistake: () => {
          const next = nextMistake(s.plies, this.walk ?? -1, this.userColor);
          if (next !== null) this.walkGo(next);
        },
        onTry: () => this.walkTry(),
        onExit: () => this.exitWalkthrough(),
      });
    }
    const reviewBtn = $<HTMLButtonElement>('btn-review');
    reviewBtn.disabled = !over;
    reviewBtn.textContent = showReview ? 'Hide review' : 'Game review';
    reviewBtn.setAttribute('aria-pressed', showReview ? 'true' : 'false');
    const reviewEl = $('review');
    reviewEl.hidden = !showReview;
    if (showReview && over) {
      renderReviewCard(reviewEl, {
        review: gameReview!,
        onWalk: () => this.startWalkthrough(),
        result: over,
        userColor: this.userColor,
        elo: s.state.elo,
        cursor: s.cursor,
        onClose: () => {
          this.reviewOpen = false;
          this.render();
        },
        onShow: (i) => {
          s.goTo(i + 1);
          this.previewBetter = true;
          this.render();
        },
        onRetry: (i) => {
          s.goTo(i);
          this.previewBetter = false;
          this.render();
        },
        onSeek: (n) => {
          s.goTo(n);
          this.previewBetter = false;
          this.render();
        },
      });
    }

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
      if (this.walk !== null) return this.walkGo(n - 1);
      this.previewBetter = false;
      s.goTo(n);
      this.render();
    });
  }

  statusText(): string {
    if (this.engineError) return `Engine error: ${this.engineError}`;
    const s = this.session;
    if (this.walk !== null) return `Move-by-move review: move ${this.walk + 1} of ${s.plies.length}. Use ← → to step through.`;
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
    $('btn-hint').addEventListener('click', () => this.requestHint());
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
    $('btn-review').addEventListener('click', () => {
      this.reviewOpen = !this.reviewOpen;
      this.render();
      if (this.reviewOpen) $('review').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
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
      // In the move-by-move review the board buttons step through the review instead.
      if (this.walk !== null) return this.walkGo(n - 1);
      this.previewBetter = false;
      this.session.goTo(n);
      this.render();
    };
    $('nav-first').addEventListener('click', () => nav(0));
    $('nav-prev').addEventListener('click', () => nav(this.session.cursor - 1));
    $('nav-next').addEventListener('click', () => nav(this.session.cursor + 1));
    $('nav-last').addEventListener('click', () => nav(this.session.plies.length));
    document.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]') || (e.target as HTMLElement).closest('input, textarea, select')) return;
      if (this.settings.mode === 'puzzles') {
        if (e.key === 'h' && !e.metaKey && !e.ctrlKey && !e.altKey) this.puzzles.hint();
        return;
      }
      if (this.walk !== null) {
        const step = this.walk;
        const go: Record<string, () => void> = {
          ArrowLeft: () => this.walkGo(step - 1),
          ArrowRight: () => (step >= this.session.plies.length - 1 ? this.exitWalkthrough() : this.walkGo(step + 1)),
          Home: () => this.walkGo(0),
          End: () => this.walkGo(this.session.plies.length - 1),
          Escape: () => this.exitWalkthrough(),
        };
        if (go[e.key]) {
          e.preventDefault();
          go[e.key]();
        }
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
