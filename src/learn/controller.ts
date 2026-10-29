/**
 * Learn mode: the lesson list, and stepping through a lesson's Explain / Try / Practice steps.
 * Uses the app's board, coach engine, move classifier, explanation provider and promotion picker.
 * With 7 pieces or fewer, moves are judged by the Lichess tablebase; otherwise (or when the
 * tablebase can't be reached) by the engine, and the panel says which.
 */
import { Chess } from 'chess.js';
import { scoreMove, terminalScore } from '../coach/review';
import { describeIdea } from '../coach/ruleBased';
import { winDrop } from '../coach/moveClass';
import type { ExplanationProvider } from '../coach/provider';
import { LEARN_CONFIG } from '../config/learn';
import type { Analysis } from '../engine/uci';
import type { Explanation, PlyRecord } from '../types';
import type { BoardView } from '../ui/board';
import { pickPromotion } from '../ui/promotion';
import { isComplete, lessonProgress, loadProgress, recordStep, saveProgress, type LearnProgress } from './progress';
import { LESSONS, lessonById } from './registry';
import { MAX_PIECES, TablebaseUnavailable, bestTbMove, moverOutcome, outcomeOf, type Outcome, type TablebaseClient, type TbResult } from './tablebase';
import type { Lesson, LessonStep, PracticeStep, Side, TryStep } from './types';
import { pieceCount } from './validate';

export interface LearnDeps {
  analyze(fen: string, depth: number): Promise<Analysis>;
  provider: ExplanationProvider;
  tablebase: TablebaseClient;
  requestRender(): void;
  promotionHost: HTMLElement;
  /** Opens Puzzle mode on a theme ("Practice this theme"). */
  openPuzzles?(theme: string): void;
}

/** Who judged a move: the tablebase (exact) or the engine (an estimate). */
export type Judge = 'tablebase' | 'engine';

export interface Feedback {
  ok: boolean;
  text: string;
  details: string[];
  judge: Judge;
  /** Shown when the tablebase couldn't be used. */
  note?: string;
}

export interface TryState {
  phase: 'waiting' | 'checking' | 'correct' | 'wrong';
  hint: 0 | 1 | 2;
  played: { uci: string; san: string; fenAfter: string } | null;
  feedback: Feedback | null;
  attempts: number;
}

export interface PracticeState {
  chess: Chess;
  phase: 'playing' | 'thinking' | 'flagged' | 'done' | 'failed';
  judge: Judge;
  note: string | null;
  /** Result for you at the start (null when unknown). */
  start: Outcome | null;
  /** Latest message about your last move. */
  message: string | null;
  /** A move that changed the result: what it was and why. */
  flag: { san: string; from: Outcome; to: Outcome; explanation: Explanation | null } | null;
  /** Shown on request: the best move for you. */
  hint: string | null;
  lastMove: [string, string] | null;
  movesMade: number;
  end: string | null;
}

const MATE_SHAPES = { green: 'green', red: 'red', blue: 'blue', yellow: 'yellow' } as const;
const sideName = (c: Side) => (c === 'w' ? 'White' : 'Black');
const OUT_WORDS: Record<Outcome, string> = { win: 'a win', draw: 'a draw', loss: 'a loss' };

export class LearnMode {
  progress: LearnProgress = loadProgress();
  view: 'list' | 'lesson' = 'list';
  lesson: Lesson | null = null;
  index = 0;
  tryState: TryState | null = null;
  practice: PracticeState | null = null;
  /** Bumped on every step change so late async results are dropped. */
  private token = 0;

  constructor(private deps: LearnDeps) {}

  get lessons(): Lesson[] {
    return LESSONS;
  }

  get step(): LessonStep | null {
    return this.lesson?.steps[this.index] ?? null;
  }

  enter(): void {
    this.deps.requestRender();
  }

  // ------------------------------------------------------------ navigation

  open(id: string, at?: number): void {
    const l = lessonById(id);
    if (!l) return;
    this.lesson = l;
    this.view = 'lesson';
    this.progress.lastOpened = id;
    const lp = lessonProgress(this.progress, id);
    this.goToStep(at ?? (isComplete(this.progress, l) ? 0 : Math.min(lp.lastStep, l.steps.length - 1)));
  }

  backToList(): void {
    this.token++;
    this.view = 'list';
    this.lesson = null;
    this.tryState = null;
    this.practice = null;
    this.deps.requestRender();
  }

  goToStep(i: number): void {
    const l = this.lesson;
    if (!l) return;
    this.token++;
    this.index = Math.max(0, Math.min(l.steps.length - 1, i));
    lessonProgress(this.progress, l.id).lastStep = this.index;
    const s = l.steps[this.index];
    this.tryState = s.type === 'try' ? { phase: 'waiting', hint: 0, played: null, feedback: null, attempts: 0 } : null;
    this.practice = null;
    if (s.type === 'explain') recordStep(this.progress, l, this.index, { done: true });
    if (s.type === 'practice') this.startPractice(s);
    saveProgress(this.progress);
    this.deps.requestRender();
  }

  next(): void {
    if (this.lesson && this.index < this.lesson.steps.length - 1) this.goToStep(this.index + 1);
  }

  prev(): void {
    if (this.index > 0) this.goToStep(this.index - 1);
  }

  /** The next lesson in the same section, if any. */
  nextLesson(): Lesson | null {
    const l = this.lesson;
    if (!l) return null;
    const same = LESSONS.filter((x) => x.section === l.section);
    return same[same.indexOf(l) + 1] ?? null;
  }

  // ------------------------------------------------------------ judging moves

  /** Tablebase answer for a position, or null (with the reason) when it has too many pieces or can't be reached. */
  private async probe(fen: string): Promise<{ tb: TbResult | null; note: string | null }> {
    if (pieceCount(fen) > MAX_PIECES) return { tb: null, note: null };
    try {
      return { tb: await this.deps.tablebase.probe(fen), note: null };
    } catch (e) {
      const why = e instanceof TablebaseUnavailable ? e.message : 'The tablebase failed.';
      return { tb: null, note: `${why} These results are engine-based, not tablebase-exact.` };
    }
  }

  /** The coach's explanation of a move (as in Puzzles: classifier + explanation provider). */
  private async explain(fenBefore: string, uci: string, san: string, fenAfter: string): Promise<Explanation | null> {
    try {
      const color = fenBefore.split(' ')[1] as Side;
      const before = await this.deps.analyze(fenBefore, LEARN_CONFIG.engineDepth);
      const after = terminalScore(fenAfter) === null ? await this.deps.analyze(fenAfter, LEARN_CONFIG.engineDepth) : null;
      const ply: PlyRecord = { san, uci, color, by: 'user', fenBefore, fenAfter };
      const numbers = scoreMove(ply, before, after);
      return await this.deps.provider.explain({ ply, prev: null, userColor: color, before, after, numbers });
    } catch {
      return null;
    }
  }

  /** Win% drop of a move against the engine's best (mover's POV). */
  private async engineDrop(fenBefore: string, uci: string, fenAfter: string): Promise<number> {
    const before = await this.deps.analyze(fenBefore, LEARN_CONFIG.engineDepth);
    const best = before.lines[0];
    if (!best) return 0;
    const own = before.lines.find((l) => l.pv[0] === uci);
    let playedCp: number;
    if (own) playedCp = own.cp;
    else {
      const term = terminalScore(fenAfter);
      if (term !== null) playedCp = term; // already from the mover's side
      else {
        const after = await this.deps.analyze(fenAfter, LEARN_CONFIG.engineDepth);
        playedCp = -(after.lines[0]?.cp ?? 0);
      }
    }
    return winDrop(best.cp, playedCp);
  }

  // ------------------------------------------------------------ Try

  async onBoardMove(from: string, to: string): Promise<void> {
    const s = this.step;
    if (!s || s.type === 'explain') return this.deps.requestRender();
    const chess = s.type === 'try' ? new Chess(s.fen) : this.practice?.chess;
    if (!chess) return;
    const isPromo = chess.moves({ verbose: true }).some((m) => m.from === from && m.to === to && m.promotion);
    const promo = isPromo ? await pickPromotion(this.deps.promotionHost, chess.turn()) : undefined;
    if (promo === null) return this.deps.requestRender();
    const uci = from + to + (promo ?? '');
    if (s.type === 'try') return this.tryMove(s, uci);
    return this.practiceMove(uci);
  }

  private async tryMove(s: TryStep, uci: string): Promise<void> {
    const st = this.tryState;
    if (!st || st.phase === 'checking' || st.phase === 'correct') return;
    const chess = new Chess(s.fen);
    let m;
    try {
      m = chess.move(uci);
    } catch {
      return this.deps.requestRender();
    }
    const t = this.token;
    st.phase = 'checking';
    st.played = { uci, san: m.san, fenAfter: m.after };
    st.attempts++;
    this.deps.requestRender();

    const feedback = await this.judgeTry(s, uci, m.san, m.after);
    if (t !== this.token) return;
    st.feedback = feedback;
    st.phase = feedback.ok ? 'correct' : 'wrong';
    if (feedback.ok) recordStep(this.progress, this.lesson!, this.index, { done: true, attempts: st.attempts, clean: st.attempts === 1 && st.hint === 0 });
    else recordStep(this.progress, this.lesson!, this.index, { done: false, attempts: st.attempts });
    saveProgress(this.progress);
    this.deps.requestRender();
  }

  /** Accepted when the tablebase result doesn't get worse (7 pieces or fewer), else within the win% margin of the engine's best. */
  async judgeTry(s: TryStep, uci: string, san: string, fenAfter: string): Promise<Feedback> {
    // The solution was verified when the lesson was built (tablebase for 7 pieces or fewer, else the engine).
    if (uci === s.solution) return { ok: true, text: s.success, details: [], judge: pieceCount(s.fen) <= MAX_PIECES ? 'tablebase' : 'engine' };
    const { tb, note } = await this.probe(s.fen);
    let ok: boolean;
    let judge: Judge;
    let why = '';
    if (tb) {
      judge = 'tablebase';
      const mine = tb.moves.find((x) => x.uci === uci);
      const best = bestTbMove(tb);
      const got = mine ? moverOutcome(mine) : null;
      const could = best ? moverOutcome(best) : outcomeOf(tb.category);
      ok = got !== null && could !== null && got === could;
      // "Fastest": a mate in one must be the mate, a longer win must be as quick as the best.
      if (ok && s.fastest && best && mine) ok = new Chess(fenAfter).isCheckmate() || (!best.checkmate && tbDist(mine) === tbDist(best));
      if (!ok && got && could) why = `${san} turns ${OUT_WORDS[could]} into ${OUT_WORDS[got]} (tablebase).`;
    } else {
      judge = 'engine';
      const drop = await this.engineDrop(s.fen, uci, fenAfter);
      ok = drop <= (s.fastest ? 0.5 : s.margin ?? LEARN_CONFIG.tryMargin);
      if (!ok) why = `${san} gives away about ${Math.round(drop)}% of the winning chances.`;
    }
    if (ok) return { ok, text: `${san} works too. ${s.success}`, details: [], judge, note: note ?? undefined };
    const e = await this.explain(s.fen, uci, san, fenAfter);
    const details = [why, ...(e?.details ?? []).slice(0, 2)].filter(Boolean);
    return { ok, text: e?.headline || `${san} isn't it.`, details, judge, note: note ?? undefined };
  }

  hint(): void {
    const st = this.tryState;
    if (st && st.phase !== 'correct') {
      st.hint = Math.min(2, st.hint + 1) as 0 | 1 | 2;
      return this.deps.requestRender();
    }
    if (this.practice) void this.practiceHint();
  }

  retry(): void {
    const s = this.step;
    if (s?.type === 'try') {
      const attempts = this.tryState?.attempts ?? 0;
      const hint = this.tryState?.hint ?? 0;
      this.tryState = { phase: 'waiting', hint, played: null, feedback: null, attempts };
      this.deps.requestRender();
    } else if (s?.type === 'practice') {
      this.token++;
      this.startPractice(s);
      this.deps.requestRender();
    }
  }

  // ------------------------------------------------------------ Practice

  private startPractice(s: PracticeStep): void {
    const chess = new Chess(s.fen);
    this.practice = { chess, phase: 'playing', judge: 'tablebase', note: null, start: null, message: null, flag: null, hint: null, lastMove: null, movesMade: 0, end: null };
    const t = this.token;
    void this.probe(s.fen).then(({ tb, note }) => {
      const p = this.practice;
      if (t !== this.token || !p) return;
      p.judge = tb ? 'tablebase' : 'engine';
      p.note = note;
      if (tb) {
        const o = outcomeOf(tb.category);
        p.start = chess.turn() === s.userColor ? o : o === 'win' ? 'loss' : o === 'loss' ? 'win' : o;
      }
      this.deps.requestRender();
    });
    if (chess.turn() !== s.userColor) void this.opponentMove();
  }

  private async practiceMove(uci: string): Promise<void> {
    const p = this.practice;
    const s = this.step as PracticeStep;
    if (!p || p.phase !== 'playing' || p.chess.turn() !== s.userColor) return this.deps.requestRender();
    const fenBefore = p.chess.fen();
    let m;
    try {
      m = p.chess.move(uci);
    } catch {
      return this.deps.requestRender();
    }
    const t = this.token;
    p.lastMove = [m.from, m.to];
    p.hint = null;
    p.movesMade++;
    p.phase = 'thinking';
    p.message = null;
    this.deps.requestRender();

    // Did this move change the result?
    const { tb, note } = await this.probe(fenBefore);
    if (t !== this.token) return;
    if (note) p.note = note;
    p.judge = tb ? 'tablebase' : 'engine';
    let before: Outcome | null = null;
    let after: Outcome | null = null;
    if (tb) {
      before = moverOutcome(bestTbMove(tb)!) ?? outcomeOf(tb.category);
      const mine = tb.moves.find((x) => x.uci === uci);
      after = mine ? moverOutcome(mine) : null;
      const dtm = mine?.dtm ?? null;
      const idea = describeIdea(fenBefore, uci, s.userColor);
      p.message = after === 'win' && dtm ? `${m.san}: still winning, mate in ${Math.ceil(Math.abs(dtm) / 2)}.${idea ? ' ' + idea : ''}`
        : after === 'draw' ? `${m.san}: still ${s.goal === 'draw' ? 'holding the draw' : 'a draw'}.${idea ? ' ' + idea : ''}`
        : after ? `${m.san}: ${OUT_WORDS[after]} for you.` : `${m.san}.`;
    } else {
      const drop = await this.engineDrop(fenBefore, uci, m.after).catch(() => 0);
      if (t !== this.token) return;
      if (drop >= 20) {
        before = s.goal === 'win' ? 'win' : 'draw';
        after = s.goal === 'win' ? 'draw' : 'loss';
      }
      p.message = `${m.san}${drop < 3 ? ': a good move' : drop < 10 ? ': playable' : `: costs about ${Math.round(drop)}% of your winning chances`} (engine estimate).`;
    }
    if (before && after && RANK[after] < RANK[before]) {
      p.flag = { san: m.san, from: before, to: after, explanation: null };
      p.phase = 'flagged';
      this.deps.requestRender();
      const e = await this.explain(fenBefore, uci, m.san, m.after);
      if (t === this.token && p.flag) p.flag.explanation = e;
      this.deps.requestRender();
      return;
    }
    if (this.checkEnd()) return;
    await this.opponentMove();
  }

  /** Take back the flagged move (and keep playing from before it). */
  undoFlagged(): void {
    const p = this.practice;
    if (!p || p.phase !== 'flagged') return;
    p.chess.undo();
    p.movesMade = Math.max(0, p.movesMade - 1);
    p.flag = null;
    p.phase = 'playing';
    p.message = null;
    const last = p.chess.history({ verbose: true }).pop();
    p.lastMove = last ? [last.from, last.to] : null;
    this.deps.requestRender();
  }

  /** Play on after a flagged move. */
  continueFlagged(): void {
    const p = this.practice;
    if (!p || p.phase !== 'flagged') return;
    p.flag = null;
    p.phase = 'thinking';
    if (!this.checkEnd()) void this.opponentMove();
  }

  private async opponentMove(): Promise<void> {
    const p = this.practice;
    if (!p) return;
    const t = this.token;
    p.phase = 'thinking';
    this.deps.requestRender();
    const fen = p.chess.fen();
    const { tb, note } = await this.probe(fen);
    if (t !== this.token) return;
    if (note) p.note = note;
    let uci: string | null = tb ? bestTbMove(tb)?.uci ?? null : null;
    if (!uci) {
      p.judge = 'engine';
      const a = await this.deps.analyze(fen, LEARN_CONFIG.engineDepth).catch(() => null);
      if (t !== this.token) return;
      uci = a?.lines[0]?.pv[0] ?? a?.bestmove ?? null;
    }
    if (!uci) {
      p.phase = 'failed';
      p.end = "The coach couldn't find a move. Press Restart to try again.";
      return this.deps.requestRender();
    }
    const m = p.chess.move(uci);
    p.lastMove = [m.from, m.to];
    p.phase = 'playing';
    if (!this.checkEnd()) this.deps.requestRender();
  }

  /** Ends the practice when the game is over or a draw has been held long enough. True if it ended. */
  private checkEnd(): boolean {
    const p = this.practice;
    const s = this.step as PracticeStep;
    if (!p) return false;
    const c = p.chess;
    let won = false;
    let drew = false;
    let lost = false;
    if (c.isCheckmate()) (c.turn() === s.userColor ? (lost = true) : (won = true));
    else if (c.isDraw()) drew = true;
    const held = s.goal === 'draw' && !lost && p.movesMade >= (s.maxMoves ?? LEARN_CONFIG.holdMoves) && c.turn() !== s.userColor;
    if (!won && !drew && !lost && !held) return false;
    const reason = c.isStalemate() ? 'stalemate' : c.isInsufficientMaterial() ? 'not enough material' : c.isThreefoldRepetition() ? 'repetition' : c.isDraw() ? 'the 50-move rule' : '';
    const ok = s.goal === 'win' ? won : !lost;
    p.phase = ok ? 'done' : 'failed';
    p.end = won ? 'Checkmate. Well done!'
      : lost ? 'You were checkmated.'
      : drew ? `Draw by ${reason}.${s.goal === 'win' ? ' The win slipped away.' : ' Held!'}`
      : `You held the draw for ${p.movesMade} moves.`;
    recordStep(this.progress, this.lesson!, this.index, { done: ok, attempts: (lessonProgress(this.progress, this.lesson!.id).steps[this.index]?.attempts ?? 0) + 1 });
    saveProgress(this.progress);
    this.deps.requestRender();
    return true;
  }

  private async practiceHint(): Promise<void> {
    const p = this.practice;
    if (!p || p.phase !== 'playing') return;
    const t = this.token;
    const fen = p.chess.fen();
    const { tb } = await this.probe(fen);
    let uci = tb ? bestTbMove(tb)?.uci : undefined;
    if (!uci) uci = (await this.deps.analyze(fen, LEARN_CONFIG.engineDepth).catch(() => null))?.lines[0]?.pv[0];
    if (t !== this.token || !uci) return;
    p.hint = uci;
    this.deps.requestRender();
  }

  // ------------------------------------------------------------ board

  boardView(): BoardView {
    const s = this.step;
    const empty: BoardView = { fen: new Chess().fen(), orientation: 'w', turn: 'w', movable: null, dests: new Map(), lastMove: null, check: false, shapes: [] };
    if (!s || this.view !== 'lesson') return empty;
    const arrow = (uci: string, brush: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), brush });
    if (s.type === 'explain') {
      const c = new Chess(s.fen);
      return {
        fen: s.fen, orientation: orientationOf(s.fen, null), turn: c.turn(), movable: null, dests: new Map(), lastMove: null, check: c.inCheck(),
        shapes: [
          ...(s.arrows ?? []).map((a) => ({ from: a.from, to: a.to, brush: MATE_SHAPES[a.color ?? 'green'] })),
          ...(s.squares ?? []).map((q) => ({ from: q.sq, brush: MATE_SHAPES[q.color ?? 'yellow'] })),
        ],
      };
    }
    if (s.type === 'try') {
      const st = this.tryState!;
      const c = new Chess(s.fen);
      const shapes: BoardView['shapes'] = [];
      const showPlayed = st.played && st.phase !== 'waiting';
      if (st.phase === 'wrong' && st.played) shapes.push(arrow(st.played.uci, 'red'));
      if (st.hint >= 2 || st.phase === 'wrong') shapes.push(arrow(s.solution, 'green'));
      const fen = showPlayed && st.phase === 'correct' ? st.played!.fenAfter : s.fen;
      const live = new Chess(fen);
      return {
        fen, orientation: orientationOf(s.fen, null), turn: live.turn(),
        movable: st.phase === 'waiting' ? c.turn() : null,
        dests: st.phase === 'waiting' ? destsOf(c) : new Map(),
        lastMove: st.phase === 'correct' && st.played ? [st.played.uci.slice(0, 2), st.played.uci.slice(2, 4)] : null,
        check: live.inCheck(),
        shapes,
      };
    }
    const p = this.practice!;
    const c = p.chess;
    const mine = p.phase === 'playing' && c.turn() === s.userColor;
    return {
      fen: c.fen(), orientation: s.userColor, turn: c.turn(),
      movable: mine ? s.userColor : null, dests: mine ? destsOf(c) : new Map(),
      lastMove: p.lastMove, check: c.inCheck(),
      shapes: p.hint ? [arrow(p.hint, 'blue')] : [],
    };
  }
}

const RANK: Record<Outcome, number> = { win: 2, draw: 1, loss: 0 };
const tbDist = (m: { dtm: number | null; dtz: number | null }) => Math.abs(m.dtm ?? m.dtz ?? 0);

function destsOf(c: Chess): Map<string, string[]> {
  const d = new Map<string, string[]>();
  for (const m of c.moves({ verbose: true })) d.set(m.from, [...(d.get(m.from) ?? []), m.to]);
  return d;
}

/** Explain and Try boards face the side to move. */
function orientationOf(fen: string, user: Side | null): Side {
  return user ?? (fen.split(' ')[1] as Side);
}

export { sideName };
