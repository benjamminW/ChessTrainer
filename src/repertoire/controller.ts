/**
 * Repertoire mode: build your opening repertoire on the board, then train it with spaced
 * repetition. Training plays whole lines from move 1: the app plays the opponent's replies and
 * you play your moves from memory. New moves are shown first and then asked again from memory;
 * moves you know come back less and less often, and a miss brings a move back the same day.
 */
import { Chess } from 'chess.js';
import { REPS_CONFIG } from '../config/repertoire';
import type { Analysis } from '../engine/uci';
import { parseUci } from '../game/session';
import { LESSONS } from '../learn/registry';
import type { DrillStep } from '../learn/types';
import { posKey, type OpeningBook } from '../review/openings';
import type { Color } from '../types';
import type { BoardView } from '../ui/board';
import { pickPromotion } from '../ui/promotion';
import { grade, introduce, isDue } from './srs';
import { loadReps, saveReps, type RepStore } from './store';
import {
  addLine, addMove, allLines, cardKeys, exportPgn, importPgn, lineCards, moveCount, newRepertoire, removeMove, reachable, turnOf,
  type Line, type PgnImport, type RepMove, type Repertoire,
} from './tree';

export interface RepDeps {
  requestRender(): void;
  promotionHost: HTMLElement;
  confirm(message: string, ok: string): Promise<boolean>;
  /** Engine eval while building (optional). */
  analyze?(fen: string, depth: number): Promise<Analysis>;
  /** Opening names and book moves (optional). */
  book?(): Promise<OpeningBook | null>;
  random?(): number;
  replyDelayMs?: number;
  now?(): Date;
}

export type TrainKind = 'due' | 'learn' | 'all';

export interface TrainRun {
  kind: TrainKind;
  line: Line;
  chess: Chess;
  phase: 'playing' | 'thinking' | 'wrong' | 'done';
  /** 'show': new moves are shown with an arrow; 'memory': the same line again, from memory. */
  pass: 'show' | 'memory';
  /** Positions whose move was shown for the first time on this run. */
  shown: Set<string>;
  /** First-try result per position on this run. */
  results: Map<string, boolean>;
  /** Your last wrong move and the repertoire move. */
  wrong: { san: string; expected: RepMove } | null;
  /** Arrow for the expected move (Hint). */
  hint: boolean;
  lastMove: [string, string] | null;
}

export interface Counts {
  moves: number;
  /** Your moves (flashcards). */
  cards: number;
  due: number;
  fresh: number;
  learned: number;
}

export interface LessonSource {
  id: string;
  title: string;
  side: Color;
  lines: string[];
}

/** Opening lessons with a drill: their lines can seed a repertoire. */
export function lessonSources(): LessonSource[] {
  return LESSONS.flatMap((l) => {
    const d = l.steps.find((s): s is DrillStep => s.type === 'drill');
    return d ? [{ id: l.id, title: l.title, side: d.side, lines: d.lines }] : [];
  });
}

const dests = (chess: Chess) => {
  const map = new Map<string, string[]>();
  for (const m of chess.moves({ verbose: true })) map.set(m.from, [...(map.get(m.from) ?? []), m.to]);
  return map;
};

export class RepertoireMode {
  store: RepStore = loadReps();
  view: 'list' | 'edit' | 'train' = 'list';
  rep: Repertoire | null = null;

  // building
  path: string[] = [];
  editChess = new Chess();
  /** Message after a refused move or an import. */
  message: { text: string; bad?: boolean } | null = null;
  importReport: PgnImport | null = null;
  evalCp: number | null = null;
  book: OpeningBook | null = null;

  // training
  run: TrainRun | null = null;
  /** Right and wrong first tries since training started. */
  tally = { right: 0, wrong: 0 };

  private token = 0;
  private evalFor = '';

  constructor(private deps: RepDeps) {}

  now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private save(): void {
    saveReps(this.store);
  }

  enter(): void {
    void this.loadBook();
    this.deps.requestRender();
  }

  private async loadBook(): Promise<void> {
    if (this.book || !this.deps.book) return;
    try {
      this.book = await this.deps.book();
      this.deps.requestRender();
    } catch {
      /* names are optional */
    }
  }

  // ------------------------------------------------------------ repertoires

  get reps(): Repertoire[] {
    return this.store.reps;
  }

  counts(rep: Repertoire): Counts {
    const now = this.now();
    const keys = cardKeys(rep);
    let due = 0;
    let fresh = 0;
    let learned = 0;
    for (const k of keys) {
      const c = rep.cards[k];
      if (!c) fresh++;
      else {
        if (isDue(c, now)) due++;
        if (c.reps > 0) learned++;
      }
    }
    return { moves: moveCount(rep), cards: keys.length, due, fresh, learned };
  }

  create(name: string, color: Color, lessonId?: string): Repertoire {
    const rep = newRepertoire(name, color, this.now());
    const src = lessonId ? lessonSources().find((s) => s.id === lessonId) : null;
    if (!name.trim() && src) rep.name = src.title.replace(/^The /, '');
    this.store.reps.push(rep);
    this.save();
    this.openEdit(rep.id);
    if (src) this.addLesson(src.id);
    return rep;
  }

  async remove(id: string): Promise<void> {
    const rep = this.reps.find((r) => r.id === id);
    if (!rep || !(await this.deps.confirm(`Delete "${rep.name}" and its training history?`, 'Delete'))) return;
    this.store.reps = this.reps.filter((r) => r.id !== id);
    if (this.store.lastId === id) this.store.lastId = null;
    this.save();
    this.backToList();
  }

  rename(name: string): void {
    if (!this.rep || !name.trim()) return;
    this.rep.name = name.trim();
    this.save();
    this.deps.requestRender();
  }

  backToList(): void {
    this.token++;
    this.view = 'list';
    this.rep = null;
    this.run = null;
    this.message = null;
    this.importReport = null;
    this.deps.requestRender();
  }

  private open(id: string): Repertoire | null {
    const rep = this.reps.find((r) => r.id === id) ?? null;
    if (!rep) return null;
    this.token++;
    this.rep = rep;
    this.store.lastId = id;
    this.save();
    this.message = null;
    this.importReport = null;
    return rep;
  }

  // ------------------------------------------------------------ building

  openEdit(id: string, path: string[] = []): void {
    if (!this.open(id)) return;
    this.view = 'edit';
    this.run = null;
    this.setPath(path);
  }

  get editKey(): string {
    return posKey(this.editChess.fen());
  }

  /** Moves from the current position, yours or the opponent's. */
  get editMoves(): RepMove[] {
    return this.rep?.moves[this.editKey] ?? [];
  }

  setPath(path: string[]): void {
    const chess = new Chess();
    const ok: string[] = [];
    for (const uci of path) {
      try {
        chess.move(parseUci(uci));
        ok.push(uci);
      } catch {
        break;
      }
    }
    this.path = ok;
    this.editChess = chess;
    this.requestEval();
    this.deps.requestRender();
  }

  goTo(n: number): void {
    this.message = null;
    this.setPath(this.path.slice(0, Math.max(0, n)));
  }

  back(): void {
    this.goTo(this.path.length - 1);
  }

  /** Follows the first repertoire move from here. */
  forward(): void {
    const m = this.editMoves[0];
    if (m) this.setPath([...this.path, m.uci]);
  }

  /** Plays a move while building: adds it (if new) and moves on. */
  editPlay(uci: string): void {
    const rep = this.rep;
    if (!rep) return;
    const r = addMove(rep, this.editKey, uci);
    if (!r.ok) {
      this.message = r.reason === 'conflict'
        ? { text: `You already play ${r.existing.san} here. Delete it first to choose a different move (one move per position, so training knows what to expect).`, bad: true }
        : { text: 'That move is not legal here.', bad: true };
      return this.deps.requestRender();
    }
    this.message = r.added ? { text: `Added ${this.sanOf(uci)}.` } : null;
    this.importReport = null;
    this.save();
    this.setPath([...this.path, uci]);
  }

  private sanOf(uci: string): string {
    try {
      return new Chess(this.editChess.fen()).move(parseUci(uci)).san;
    } catch {
      return uci;
    }
  }

  async deleteMove(uci: string): Promise<void> {
    const rep = this.rep;
    if (!rep) return;
    const key = this.editKey;
    const move = rep.moves[key]?.find((m) => m.uci === uci);
    if (!move) return;
    // Count what goes with it before asking.
    const trial: Repertoire = JSON.parse(JSON.stringify(rep));
    const gone = removeMove(trial, key, uci);
    if (gone > 0 && !(await this.deps.confirm(`Delete ${move.san} and the ${gone} move${gone === 1 ? '' : 's'} after it?`, 'Delete'))) return;
    removeMove(rep, key, uci);
    this.save();
    this.message = { text: `Deleted ${move.san}${gone ? ` and ${gone} move${gone === 1 ? '' : 's'} after it` : ''}.` };
    this.deps.requestRender();
  }

  importText(text: string): void {
    const rep = this.rep;
    if (!rep || !text.trim()) return;
    this.importReport = importPgn(rep, text);
    this.message = null;
    this.save();
    this.deps.requestRender();
  }

  addLesson(id: string): void {
    const rep = this.rep;
    const src = lessonSources().find((s) => s.id === id);
    if (!rep || !src) return;
    let added = 0;
    let conflicts = 0;
    for (const l of src.lines) {
      const r = addLine(rep, l.split(' '));
      added += r.added;
      conflicts += r.conflicts;
    }
    this.importReport = { added, conflicts, errors: [], games: src.lines.length };
    this.message = null;
    this.save();
    this.deps.requestRender();
  }

  exportText(): string {
    return this.rep ? exportPgn(this.rep) : '';
  }

  /** Opening name of the current position (deepest named position along the path). */
  openingName(path = this.path): string | null {
    if (!this.book) return null;
    const chess = new Chess();
    let name: string | null = null;
    for (const uci of path) {
      try {
        chess.move(parseUci(uci));
      } catch {
        break;
      }
      const n = this.book.named.get(posKey(chess.fen()));
      if (n) name = n.name;
    }
    return name;
  }

  /** Book moves (Lichess openings dataset) from the current position, as SAN. */
  bookMoves(): RepMove[] {
    const next = this.book?.next.get(this.editKey);
    if (!next) return [];
    const out: RepMove[] = [];
    for (const uci of next) {
      try {
        out.push({ uci, san: new Chess(this.editChess.fen()).move(parseUci(uci)).san });
      } catch {
        /* skip */
      }
    }
    // Most-covered moves first (e4 and d4 before Nh3).
    const n = (uci: string) => this.book?.lines.get(`${this.editKey}|${uci}`) ?? 0;
    return out.sort((a, b) => n(b.uci) - n(a.uci)).slice(0, REPS_CONFIG.bookMovesShown);
  }

  private requestEval(): void {
    const fen = this.editChess.fen();
    if (!this.deps.analyze || fen === this.evalFor) return;
    this.evalFor = fen;
    this.evalCp = null;
    if (this.editChess.isGameOver()) return;
    const white = this.editChess.turn() === 'w';
    this.deps.analyze(fen, REPS_CONFIG.evalDepth).then(
      (a) => {
        if (this.evalFor !== fen || !a.lines[0]) return;
        this.evalCp = white ? a.lines[0].cp : -a.lines[0].cp;
        this.deps.requestRender();
      },
      () => {},
    );
  }

  // ------------------------------------------------------------ training

  /** The line to train next, or null when there's nothing of that kind. */
  pickLine(rep: Repertoire, kind: TrainKind, avoid?: Line): Line | null {
    const now = this.now();
    const lines = allLines(rep);
    if (kind === 'learn') return lines.find((l) => lineCards(rep, l).some((k) => !rep.cards[k])) ?? null;
    if (kind === 'due') {
      let best: { line: Line; first: number; n: number } | null = null;
      for (const line of lines) {
        const due = lineCards(rep, line).filter((k) => isDue(rep.cards[k], now));
        if (!due.length) continue;
        const first = Math.min(...due.map((k) => Date.parse(rep.cards[k].due)));
        if (!best || first < best.first || (first === best.first && due.length > best.n)) best = { line, first, n: due.length };
      }
      return best?.line ?? null;
    }
    const pool = lines.length > 1 && avoid ? lines.filter((l) => l.ucis.join(' ') !== avoid.ucis.join(' ')) : lines;
    if (!pool.length) return null;
    return pool[Math.floor((this.deps.random?.() ?? Math.random()) * pool.length)];
  }

  /** Starts training a repertoire. False when there's nothing to train of that kind. */
  train(id: string, kind: TrainKind): boolean {
    const rep = this.open(id);
    if (!rep) return false;
    this.tally = { right: 0, wrong: 0 };
    const line = this.pickLine(rep, kind);
    this.view = 'train';
    if (!line) {
      this.run = null;
      this.deps.requestRender();
      return false;
    }
    this.startRun(kind, line, 'show');
    return true;
  }

  private startRun(kind: TrainKind, line: Line, pass: TrainRun['pass']): void {
    this.token++;
    this.run = { kind, line, chess: new Chess(), phase: 'playing', pass, shown: new Set(), results: new Map(), wrong: null, hint: false, lastMove: null };
    this.deps.requestRender();
    if (this.rep && this.rep.color !== 'w') void this.reply();
    else this.prepareTurn();
  }

  /** At your turn: a move you haven't seen yet is shown (and scheduled for a check from memory). */
  private prepareTurn(): void {
    const run = this.run;
    const rep = this.rep;
    if (!run || !rep) return;
    const key = posKey(run.chess.fen());
    if (!rep.cards[key] && !run.results.has(key)) {
      rep.cards[key] = introduce(this.now());
      run.shown.add(key);
      this.save();
    }
    this.deps.requestRender();
  }

  /** The repertoire move expected now (your turn), or null. */
  get expected(): RepMove | null {
    const run = this.run;
    if (!run || !this.rep) return null;
    const uci = run.line.ucis[run.chess.history().length];
    if (!uci || run.chess.turn() !== this.rep.color) return null;
    return this.rep.moves[posKey(run.chess.fen())]?.find((m) => m.uci === uci) ?? null;
  }

  /** The move to play now is new (shown for the first time). */
  get newHere(): boolean {
    const run = this.run;
    return !!run && run.phase !== 'done' && run.shown.has(posKey(run.chess.fen()));
  }

  /** Whether the move to play now is being shown (new move, hint, or after a mistake). */
  get showing(): boolean {
    const run = this.run;
    if (!run || run.phase === 'done') return false;
    return run.hint || run.phase === 'wrong' || run.shown.has(posKey(run.chess.fen()));
  }

  async onBoardMove(from: string, to: string): Promise<void> {
    if (this.view === 'edit') {
      const promo = await this.promotion(this.editChess, from, to);
      if (promo === null) return this.deps.requestRender();
      return this.editPlay(from + to + (promo ?? ''));
    }
    const run = this.run;
    if (!run || (run.phase !== 'playing' && run.phase !== 'wrong')) return this.deps.requestRender();
    const promo = await this.promotion(run.chess, from, to);
    if (promo === null || this.run !== run) return this.deps.requestRender();
    this.trainMove(from + to + (promo ?? ''));
  }

  private async promotion(chess: Chess, from: string, to: string): Promise<string | undefined | null> {
    const isPromo = chess.moves({ verbose: true }).some((m) => m.from === from && m.to === to && m.promotion);
    return isPromo ? pickPromotion(this.deps.promotionHost, chess.turn()) : undefined;
  }

  /** Records a position's first-try result and updates its card. */
  private record(key: string, ok: boolean): void {
    const run = this.run!;
    const rep = this.rep!;
    if (run.results.has(key)) return;
    run.results.set(key, ok);
    if (run.shown.has(key)) return; // just shown: it's checked from memory next
    const card = rep.cards[key];
    if (!ok) {
      rep.cards[key] = grade(card, false, this.now());
      this.tally.wrong++;
    } else {
      this.tally.right++;
      // Due cards, and moves still being learned (new or missed), move up a step.
      if (!card || isDue(card, this.now()) || card.reps === 0) rep.cards[key] = grade(card, true, this.now());
    }
    this.save();
  }

  trainMove(uci: string): void {
    const run = this.run;
    const rep = this.rep;
    const want = this.expected;
    if (!run || !rep || !want) return;
    const key = posKey(run.chess.fen());
    if (uci !== want.uci) {
      let san = uci;
      try {
        san = new Chess(run.chess.fen()).move(parseUci(uci)).san;
      } catch {
        return this.deps.requestRender();
      }
      this.record(key, false);
      run.phase = 'wrong';
      run.wrong = { san, expected: want };
      return this.deps.requestRender();
    }
    this.record(key, !run.hint);
    run.wrong = null;
    run.hint = false;
    this.applyMove(uci);
    if (this.finished()) return;
    void this.reply();
  }

  private applyMove(uci: string): void {
    const run = this.run!;
    const m = run.chess.move(parseUci(uci));
    run.lastMove = [m.from, m.to];
    run.phase = 'playing';
  }

  private finished(): boolean {
    const run = this.run!;
    if (run.chess.history().length < run.line.ucis.length) return false;
    run.phase = 'done';
    this.deps.requestRender();
    return true;
  }

  private async reply(): Promise<void> {
    const run = this.run;
    if (!run) return;
    const t = this.token;
    run.phase = 'thinking';
    this.deps.requestRender();
    const delay = this.deps.replyDelayMs ?? REPS_CONFIG.replyDelayMs;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    if (t !== this.token || this.run !== run) return;
    this.applyMove(run.line.ucis[run.chess.history().length]);
    if (this.finished()) return;
    this.prepareTurn();
  }

  hint(): void {
    const run = this.run;
    if (!run || run.phase !== 'playing' || !this.expected) return;
    run.hint = true;
    this.deps.requestRender();
  }

  /** What "Next" does after a line: check new moves from memory, or the next line. */
  get nextAction(): { label: string; go: () => void } | null {
    const run = this.run;
    const rep = this.rep;
    if (!rep) return null;
    if (run?.phase === 'done' && run.pass === 'show' && run.shown.size) {
      return { label: 'Play it again from memory', go: () => this.startRun(run.kind, run.line, 'memory') };
    }
    const kind = run?.kind ?? 'due';
    const line = this.pickLine(rep, kind, run?.line);
    if (!line) return null;
    const c = this.counts(rep);
    const label = kind === 'due' ? `Next line (${c.due} due)` : kind === 'learn' ? `Learn the next line (${c.fresh} new)` : 'Another line';
    return { label, go: () => this.startRun(kind, line, 'show') };
  }

  next(): void {
    if (this.run?.phase !== 'done' && this.run) return;
    this.nextAction?.go();
  }

  /** Restarts the current line (same pass). */
  restart(): void {
    const run = this.run;
    if (run) this.startRun(run.kind, run.line, run.pass === 'memory' ? 'memory' : 'show');
  }

  /** Opens the current training position in the builder. */
  editHere(): void {
    const run = this.run;
    const rep = this.rep;
    if (!rep) return;
    this.openEdit(rep.id, run ? run.chess.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? '')) : []);
  }

  // ------------------------------------------------------------ board

  boardView(): BoardView & { evalCp: number | null } {
    const rep = this.rep;
    const orientation: Color = rep?.color ?? 'w';
    if (this.view === 'edit' && rep) {
      const chess = this.editChess;
      const key = this.editKey;
      const hist = chess.history({ verbose: true });
      const last = hist[hist.length - 1];
      const mine = turnOf(key) === rep.color;
      return {
        fen: chess.fen(),
        orientation,
        turn: chess.turn(),
        movable: chess.isGameOver() ? null : chess.turn(),
        dests: dests(chess),
        lastMove: last ? [last.from, last.to] : null,
        check: chess.inCheck(),
        shapes: this.editMoves.map((m) => ({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), brush: mine ? 'green' : 'blue' })),
        evalCp: this.evalCp,
      };
    }
    const run = this.view === 'train' ? this.run : null;
    if (run && rep) {
      const chess = run.chess;
      const want = this.expected;
      const canMove = (run.phase === 'playing' || run.phase === 'wrong') && chess.turn() === rep.color && !!want;
      return {
        fen: chess.fen(),
        orientation,
        turn: chess.turn(),
        movable: canMove ? rep.color : null,
        dests: canMove ? dests(chess) : new Map(),
        lastMove: run.lastMove,
        check: chess.inCheck(),
        shapes: want && this.showing ? [{ from: want.uci.slice(0, 2), to: want.uci.slice(2, 4), brush: 'green' }] : [],
        evalCp: null,
      };
    }
    const start = new Chess();
    return { fen: start.fen(), orientation, turn: 'w', movable: null, dests: new Map(), lastMove: null, check: false, shapes: [], evalCp: null };
  }

  /** Positions in the repertoire (for "N positions"). */
  positions(rep: Repertoire): number {
    return reachable(rep).size;
  }
}

