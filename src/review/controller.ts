/**
 * Review mode: import your chess.com games, analyze them in the background, and review them
 * one by one or as patterns. Uses the app's single Board, coach Engine, classifier and explanations.
 */
import { Chess, type Color } from 'chess.js';
import type { ExplanationProvider } from '../coach/provider';
import { PRESETS, REVIEW_CONFIG, type AnalysisPreset } from '../config/review';
import type { Analysis, SearchOptions } from '../engine/uci';
import { read, write } from '../game/persistence';
import type { Puzzle } from '../puzzles/types';
import type { BoardView } from '../ui/board';
import { BAD_CLASSES } from '../ui/walkthrough';
import { AnalysisQueue } from './analyzer';
import { cacheUsable, openStores, type ReviewStores } from './cache';
import { ChessComClient, ChessComError, archiveMonth, isPastMonth, type ChessComGame } from './chesscom';
import { summarizeGame, type GameSummary } from './gameStats';
import { identifyOpening, loadBook, type OpeningBook, type OpeningInfo } from './openings';
import { computePatterns, userResult, type Patterns, type Ref, type UserResult } from './patterns';
import { importChessComGame, type ImportedGame } from './pgn';
import { mistakeToPuzzle } from './toPuzzle';
import type { GameAnalysis } from './types';

const KEY = 'chess-coach:review:v1';

export interface ReviewFilters {
  timeClass: 'all' | 'bullet' | 'blitz' | 'rapid' | 'daily';
  color: 'all' | Color;
  result: 'all' | UserResult;
  /** YYYY-MM-DD or '' */
  from: string;
  to: string;
}

export interface ReviewPrefs {
  username: string;
  filters: ReviewFilters;
  preset: AnalysisPreset['id'];
  batch: number;
}

const DEFAULT_PREFS: ReviewPrefs = {
  username: '',
  filters: { timeClass: 'all', color: 'all', result: 'all', from: '', to: '' },
  preset: 'quick',
  batch: REVIEW_CONFIG.defaultBatch,
};

export interface ReviewDeps {
  analyze(fen: string, opts: SearchOptions): Promise<Analysis>;
  provider: ExplanationProvider;
  baseUrl: string;
  requestRender(): void;
  /** Start a Play-mode game from this position, with you to move. */
  playFrom(fen: string, color: Color): void;
  /** Add a puzzle to Puzzle mode's "My mistakes" set. Returns false if it was already there. */
  savePuzzle(p: Puzzle, from: { label: string; url: string }): boolean;
  hasPuzzle(id: string): boolean;
}

export interface OpenGame {
  game: ChessComGame;
  imported: ImportedGame;
  userColor: Color;
  analysis: GameAnalysis | null;
  summary: GameSummary | null;
  opening: OpeningInfo | null;
  /** Plies applied on the board (0 = start). */
  step: number;
  /** Show the position before your move with the better-move arrows. */
  showBetter: boolean;
}

export type ReviewView = 'games' | 'game' | 'patterns';

export class ReviewMode {
  prefs: ReviewPrefs;
  view: ReviewView = 'games';
  archives: string[] = [];
  monthsLoaded = 0;
  games: ChessComGame[] = [];
  analyses = new Map<string, GameAnalysis>();
  loading = false;
  error = '';
  selected = new Set<string>();
  current: OpenGame | null = null;
  readonly queue: AnalysisQueue;
  private stores: ReviewStores = openStores();
  private client = new ChessComClient();
  private book: OpeningBook | null = null;
  private loadToken = 0;

  constructor(private deps: ReviewDeps) {
    this.prefs = { ...DEFAULT_PREFS, ...read<Partial<ReviewPrefs>>(KEY) };
    this.prefs.filters = { ...DEFAULT_PREFS.filters, ...this.prefs.filters };
    this.queue = new AnalysisQueue({
      analyze: deps.analyze,
      provider: deps.provider,
      store: this.stores.analyses,
      book: () => this.getBook(),
      onChange: () => deps.requestRender(),
      onAnalyzed: (a) => {
        this.analyses.set(a.url, a);
        if (this.current?.game.url === a.url) this.attach(this.current, a);
        deps.requestRender();
      },
    });
  }

  get preset(): AnalysisPreset {
    return PRESETS[this.prefs.preset];
  }

  private save(): void {
    write(KEY, this.prefs);
  }

  private getBook(): Promise<OpeningBook> {
    return loadBook(this.deps.baseUrl).then((b) => (this.book = b));
  }

  /** Called when the user switches to Review mode. */
  enter(): void {
    if (this.prefs.username && !this.games.length && !this.loading) void this.loadUser(this.prefs.username);
  }

  // ------------------------------------------------------------ games

  userColorIn(g: ChessComGame): Color {
    return g.white.username.toLowerCase() === this.prefs.username.toLowerCase() ? 'w' : 'b';
  }

  async loadUser(username: string): Promise<void> {
    const name = username.trim();
    if (!name) return;
    if (name.toLowerCase() !== this.prefs.username.toLowerCase()) {
      this.queue.cancel();
      this.games = [];
      this.analyses.clear();
      this.selected.clear();
      this.current = null;
    }
    this.prefs.username = name;
    this.save();
    const t = ++this.loadToken;
    this.loading = true;
    this.error = '';
    this.view = 'games';
    this.deps.requestRender();
    try {
      this.archives = await this.client.archives(name);
      if (t !== this.loadToken) return;
      this.monthsLoaded = 0;
      this.games = [];
      // Fill the list with at least a couple of batches' worth of games, newest month first.
      while (this.monthsLoaded < this.archives.length && this.games.length < this.prefs.batch * 3 && this.monthsLoaded < 6) {
        await this.loadMonth(t);
      }
    } catch (e) {
      if (t === this.loadToken) this.error = e instanceof ChessComError ? e.message : `Something went wrong: ${String(e)}`;
    } finally {
      if (t === this.loadToken) {
        this.loading = false;
        this.deps.requestRender();
      }
    }
  }

  async loadOlder(): Promise<void> {
    if (this.loading || this.monthsLoaded >= this.archives.length) return;
    const t = this.loadToken;
    this.loading = true;
    this.deps.requestRender();
    try {
      await this.loadMonth(t);
    } catch (e) {
      this.error = e instanceof ChessComError ? e.message : String(e);
    } finally {
      this.loading = false;
      this.deps.requestRender();
    }
  }

  private async loadMonth(t: number): Promise<void> {
    const url = this.archives[this.monthsLoaded];
    let games = isPastMonth(url) ? await this.stores.archives.get(url).catch(() => undefined) : undefined;
    if (!games) {
      games = await this.client.month(url);
      if (isPastMonth(url)) await this.stores.archives.put(url, games).catch(() => {});
    }
    if (t !== this.loadToken) return;
    this.monthsLoaded++;
    // Standard chess only (no Chess960 or variants), newest first.
    const chess = games.filter((g) => g.rules === 'chess' && g.pgn).sort((a, b) => b.end_time - a.end_time);
    this.games.push(...chess);
    for (const g of chess) {
      const a = await this.stores.analyses.get(g.url).catch(() => undefined);
      if (a && a.version === REVIEW_CONFIG.analysisVersion) this.analyses.set(g.url, a);
    }
    this.deps.requestRender();
  }

  get olderMonthsLeft(): number {
    return this.archives.length - this.monthsLoaded;
  }

  get loadedRange(): string {
    if (!this.monthsLoaded) return '';
    const months = this.archives.slice(0, this.monthsLoaded).map(archiveMonth);
    return months.length === 1 ? months[0] : `${months[months.length - 1]} – ${months[0]}`;
  }

  setFilters(f: Partial<ReviewFilters>): void {
    Object.assign(this.prefs.filters, f);
    this.save();
    this.deps.requestRender();
  }

  setPrefs(p: Partial<Omit<ReviewPrefs, 'filters' | 'username'>>): void {
    Object.assign(this.prefs, p);
    this.save();
    this.deps.requestRender();
  }

  filtered(): ChessComGame[] {
    const f = this.prefs.filters;
    const from = f.from ? Date.parse(f.from) / 1000 : -Infinity;
    const to = f.to ? Date.parse(f.to) / 1000 + 86400 : Infinity;
    return this.games.filter((g) => {
      const color = this.userColorIn(g);
      return (
        (f.timeClass === 'all' || g.time_class === f.timeClass) &&
        (f.color === 'all' || f.color === color) &&
        (f.result === 'all' || f.result === userResult(g, color)) &&
        g.end_time >= from &&
        g.end_time < to
      );
    });
  }

  /** Cached at the current preset's depth (or deeper)? */
  isAnalyzed(url: string): boolean {
    return cacheUsable(this.analyses.get(url), this.preset.depth, REVIEW_CONFIG.analysisVersion);
  }

  private label(g: ChessComGame): string {
    const c = this.userColorIn(g);
    return `vs ${c === 'w' ? g.black.username : g.white.username}`;
  }

  analyze(games: ChessComGame[]): void {
    const todo = games.filter((g) => !this.isAnalyzed(g.url)).sort((a, b) => b.end_time - a.end_time);
    this.queue.enqueue(
      todo.map((g) => ({ game: importChessComGame(g), userColor: this.userColorIn(g), label: this.label(g) })),
      this.preset,
    );
  }

  analyzeLatest(): void {
    this.analyze(this.filtered().slice(0, this.prefs.batch));
  }

  analyzeSelected(): void {
    this.analyze(this.games.filter((g) => this.selected.has(g.url)));
    this.selected.clear();
  }

  toggleSelected(url: string): void {
    if (this.selected.has(url)) this.selected.delete(url);
    else this.selected.add(url);
    this.deps.requestRender();
  }

  async clearCache(): Promise<void> {
    this.queue.cancel();
    await Promise.all([this.stores.analyses.clear(), this.stores.archives.clear()]).catch(() => {});
    this.analyses.clear();
    if (this.current) this.attach(this.current, null);
    this.deps.requestRender();
  }

  /** Forget the username, filters and every cached game and analysis. */
  async forget(): Promise<void> {
    await this.clearCache();
    this.loadToken++;
    this.prefs = { ...DEFAULT_PREFS, filters: { ...DEFAULT_PREFS.filters } };
    write(KEY, null);
    this.games = [];
    this.archives = [];
    this.monthsLoaded = 0;
    this.current = null;
    this.selected.clear();
    this.error = '';
    this.loading = false;
    this.view = 'games';
    this.deps.requestRender();
  }

  // ------------------------------------------------------------ single game

  openGame(url: string, step?: number): void {
    const game = this.games.find((g) => g.url === url);
    if (!game) return;
    const imported = importChessComGame(game);
    const og: OpenGame = { game, imported, userColor: this.userColorIn(game), analysis: null, summary: null, opening: null, step: 0, showBetter: false };
    this.attach(og, this.analyses.get(url) ?? null);
    this.current = og;
    this.view = 'game';
    this.goTo(step ?? 0);
    this.getBook().then(
      (b) => {
        if (this.current === og) {
          og.opening = identifyOpening(b, imported.moves);
          this.deps.requestRender();
        }
      },
      () => {},
    );
  }

  /** Jump to an example position from the patterns screen: the position with your move, better move shown. */
  openRef(ref: Ref): void {
    this.openGame(ref.url, ref.index + 1);
    if (this.current && ref.index > 0) this.showMoment(ref.index);
  }

  private attach(og: OpenGame, a: GameAnalysis | null): void {
    og.analysis = a;
    og.summary = a ? summarizeGame(og.imported, a) : null;
    if (this.book) og.opening = identifyOpening(this.book, og.imported.moves);
  }

  goTo(step: number): void {
    const og = this.current;
    if (!og) return;
    og.step = Math.max(0, Math.min(og.imported.moves.length, step));
    og.showBetter = false;
    this.deps.requestRender();
  }

  /** Show your move at `index` with the better move (position before it, arrows on). */
  showMoment(index: number): void {
    const og = this.current;
    if (!og) return;
    og.step = index + 1;
    og.showBetter = this.isUserMistake(index);
    this.deps.requestRender();
  }

  toggleBetter(): void {
    if (this.current) this.current.showBetter = !this.current.showBetter;
    this.deps.requestRender();
  }

  isUserMistake(index: number): boolean {
    const og = this.current;
    const m = og?.analysis?.moves[index];
    return !!og && !!m && og.imported.moves[index].color === og.userColor && BAD_CLASSES.includes(m.classification);
  }

  playFrom(index: number): void {
    const og = this.current;
    if (!og) return;
    const fen = og.imported.moves[index].fenBefore;
    this.deps.playFrom(fen, new Chess(fen).turn());
  }

  puzzleFor(index: number): Puzzle | null {
    const og = this.current;
    return og?.analysis ? mistakeToPuzzle(og.imported, og.analysis, index) : null;
  }

  saveAsPuzzle(index: number): void {
    const og = this.current;
    const p = this.puzzleFor(index);
    if (!og || !p) return;
    const opp = og.userColor === 'w' ? og.game.black.username : og.game.white.username;
    const n = Math.floor(index / 2) + 1;
    this.deps.savePuzzle(p, { label: `Your game vs ${opp}, move ${n}${index % 2 ? '…' : '.'}`, url: og.game.url });
    this.deps.requestRender();
  }

  isSaved(index: number): boolean {
    const p = this.puzzleFor(index);
    return !!p && this.deps.hasPuzzle(p.id);
  }

  back(): void {
    this.view = 'games';
    this.deps.requestRender();
  }

  // ------------------------------------------------------------ patterns

  patterns(): { patterns: Patterns; analyzed: number; total: number } {
    const list = this.filtered();
    const entries = list.filter((g) => this.analyses.has(g.url)).map((g) => ({ game: g, analysis: this.analyses.get(g.url)! }));
    return { patterns: computePatterns(entries), analyzed: entries.length, total: list.length };
  }

  // ------------------------------------------------------------ board

  boardView(): BoardView & { evalCp: number | null; showEval: boolean } {
    const og = this.current;
    if (!og) {
      return { fen: new Chess().fen(), orientation: 'w', turn: 'w', movable: null, dests: new Map(), lastMove: null, check: false, shapes: [], evalCp: null, showEval: false };
    }
    const moves = og.imported.moves;
    const i = og.step - 1;
    const m = i >= 0 ? moves[i] : null;
    const a = i >= 0 ? og.analysis?.moves[i] : undefined;
    const better = og.showBetter && m && a?.bestUci && this.isUserMistake(i);
    const fen = better ? m!.fenBefore : m ? m.fenAfter : og.imported.startFen;
    const shapes: BoardView['shapes'] = better
      ? [
          { from: a!.bestUci!.slice(0, 2), to: a!.bestUci!.slice(2, 4), brush: 'green' },
          { from: m!.uci.slice(0, 2), to: m!.uci.slice(2, 4), brush: 'paleRed' },
        ]
      : [];
    const chess = new Chess(fen);
    return {
      fen,
      orientation: og.userColor,
      turn: chess.turn(),
      movable: null,
      dests: new Map(),
      lastMove: better || !m ? null : [m.uci.slice(0, 2), m.uci.slice(2, 4)],
      check: chess.inCheck(),
      shapes,
      evalCp: og.analysis ? (i < 0 ? og.analysis.moves[0]?.evalBefore ?? 0 : better ? a!.evalBefore : og.analysis.moves[i].evalAfter) : null,
      showEval: !!og.analysis && this.view === 'game',
    };
  }
}
