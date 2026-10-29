/**
 * Best move tab: any position (set up by hand, pasted as FEN/PGN, or taken from your game),
 * moves for both sides, and the engine's best moves for whoever is to move. DOM-free apart
 * from the promotion picker; src/ui/analysisPanel.ts draws the panel.
 */
import { Chess } from 'chess.js';
import { MATE_CP } from '../config/coach';
import { ANALYSIS_CONFIG, ANALYSIS_DEPTHS, type AnalysisDepth } from '../config/analysis';
import { describeIdea } from '../coach/ruleBased';
import { lineToSan } from '../coach/facts';
import type { Analysis, SearchOptions } from '../engine/uci';
import { read, write } from '../game/persistence';
import type { Color } from '../types';
import type { BoardView } from '../ui/board';
import { pickPromotion } from '../ui/promotion';
import { START_FEN, autoCastling, compress, expand, parsePosition, setupFen } from '../game/position';

const STORE_KEY = 'chess-coach:analysis:v1';

export interface AnalysisDeps {
  analyze(fen: string, opts: SearchOptions): Promise<Analysis>;
  cancel(): void;
  requestRender(): void;
  promotionHost: HTMLElement;
  /** The position currently shown in Play (for "Use my game"). */
  playPosition(): { startFen: string; moves: string[]; cursor: number; userColor: Color };
}

/** A piece letter to place (FEN case: uppercase White), or 'erase'. */
export type EditTool = string | 'erase' | null;

export interface EditState {
  board: Map<string, string>;
  turn: Color;
  castling: string;
  tool: EditTool;
  error: string | null;
}

export interface BestMove {
  uci: string;
  san: string;
  /** White-POV eval after the line. */
  evalWhite: number;
  mate: number | null;
  sanLine: string[];
  idea: string;
}

interface Saved {
  startFen: string;
  moves: string[];
  cursor: number;
  depth: AnalysisDepth['id'];
  orientation: Color;
  arrows: boolean;
}

export class BestMoveMode {
  startFen = START_FEN;
  /** The line played from startFen (UCI); the board shows the position after `cursor` moves. */
  moves: string[] = [];
  cursor = 0;
  orientation: Color = 'w';
  depth: AnalysisDepth['id'] = ANALYSIS_CONFIG.defaultDepth;
  arrows = true;
  edit: EditState | null = null;
  loadError: string | null = null;
  engineError: string | null = null;

  private results = new Map<string, Analysis>();
  private pending = new Set<string>();

  constructor(private deps: AnalysisDeps) {
    const s = read<Saved>(STORE_KEY);
    if (s) {
      try {
        this.load({ startFen: s.startFen, moves: s.moves }, false);
        this.cursor = Math.min(s.cursor, this.moves.length);
        if (ANALYSIS_DEPTHS.some((d) => d.id === s.depth)) this.depth = s.depth;
        this.orientation = s.orientation === 'b' ? 'b' : 'w';
        this.arrows = s.arrows !== false;
      } catch {
        this.reset();
      }
    }
  }

  enter(): void {
    this.request();
  }

  // ------------------------------------------------------------ position and line

  /** Chess instance at the cursor. */
  chess(at = this.cursor): Chess {
    const c = new Chess(this.startFen);
    for (const m of this.moves.slice(0, at)) c.move(m);
    return c;
  }

  fen(): string {
    return this.chess().fen();
  }

  get depthValue(): number {
    return (ANALYSIS_DEPTHS.find((d) => d.id === this.depth) ?? ANALYSIS_DEPTHS[1]).depth;
  }

  /** Loads a position and line; throws if a move is illegal. */
  private load(p: { startFen: string; moves: string[] }, save = true): void {
    const c = new Chess(p.startFen);
    for (const m of p.moves) c.move(m);
    this.startFen = new Chess(p.startFen).fen();
    this.moves = [...p.moves];
    this.cursor = this.moves.length;
    this.edit = null;
    this.loadError = null;
    if (save) this.changed();
  }

  /** Paste box: a FEN, a PGN or a move list. Returns true when it loaded. */
  loadText(text: string): boolean {
    const r = parsePosition(text);
    if (!r.ok) {
      this.loadError = r.error;
      this.deps.requestRender();
      return false;
    }
    this.load(r.position);
    this.orientation = new Chess(r.position.startFen).turn() === 'b' && !r.position.moves.length ? 'b' : this.orientation;
    return true;
  }

  /** Takes the position shown in Play (the whole game, at the move you're looking at). */
  usePlayGame(): void {
    const p = this.deps.playPosition();
    this.load({ startFen: p.startFen, moves: p.moves });
    this.cursor = p.cursor;
    this.orientation = p.userColor;
    this.changed();
  }

  reset(): void {
    this.load({ startFen: START_FEN, moves: [] });
  }

  goTo(n: number): void {
    const c = Math.max(0, Math.min(this.moves.length, n));
    if (c === this.cursor) return;
    this.cursor = c;
    this.changed();
  }

  /** Plays a move at the cursor; a move different from the next one in the line replaces the rest of it. */
  play(uci: string): boolean {
    const c = this.chess();
    try {
      c.move(uci);
    } catch {
      return false;
    }
    if (this.moves[this.cursor] !== uci) this.moves = this.moves.slice(0, this.cursor).concat(uci);
    this.cursor++;
    this.changed();
    return true;
  }

  undo(): void {
    if (!this.cursor) return;
    this.moves = this.moves.slice(0, this.cursor - 1);
    this.cursor--;
    this.changed();
  }

  flip(): void {
    this.orientation = this.orientation === 'w' ? 'b' : 'w';
    this.changed();
  }

  setDepth(id: AnalysisDepth['id']): void {
    this.depth = id;
    this.changed();
  }

  setArrows(on: boolean): void {
    this.arrows = on;
    this.changed();
  }

  private changed(): void {
    this.save();
    this.request();
    this.deps.requestRender();
  }

  private save(): void {
    write(STORE_KEY, { startFen: this.startFen, moves: this.moves, cursor: this.cursor, depth: this.depth, orientation: this.orientation, arrows: this.arrows } satisfies Saved);
  }

  // ------------------------------------------------------------ engine

  private key(fen: string): string {
    return `${this.depthValue}|${fen}`;
  }

  analysis(): Analysis | undefined {
    return this.results.get(this.key(this.fen()));
  }

  get thinking(): boolean {
    return this.pending.has(this.key(this.fen()));
  }

  /** Forgets all results (e.g. after switching engine builds) and searches the shown position again. */
  refresh(): void {
    this.results.clear();
    this.pending.clear();
    this.request();
    this.deps.requestRender();
  }

  /** Searches the shown position (only that one: older searches are cancelled). */
  request(): void {
    if (this.edit) return;
    const chess = this.chess();
    if (chess.isGameOver()) return;
    const fen = chess.fen();
    const key = this.key(fen);
    if (this.results.has(key) || this.pending.has(key)) return;
    this.deps.cancel();
    this.pending.clear();
    this.pending.add(key);
    this.engineError = null;
    this.deps.analyze(fen, { depth: this.depthValue, multiPv: ANALYSIS_CONFIG.lines, owner: 'analysis' }).then(
      (a) => {
        this.pending.delete(key);
        this.results.set(key, a);
        this.deps.requestRender();
      },
      (e: unknown) => {
        this.pending.delete(key);
        if (!(e instanceof Error && e.message === 'search cancelled')) {
          this.engineError = e instanceof Error ? e.message : String(e);
          this.deps.requestRender();
        }
      },
    );
  }

  /** The engine's candidate moves for the side to move, best first. */
  bestMoves(): BestMove[] {
    const a = this.analysis();
    if (!a) return [];
    const fen = a.fen;
    const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
    const turn = fen.split(' ')[1] as Color;
    return a.lines.filter((l) => l.pv.length).map((l) => {
      const sanLine = lineToSan(fen, l.pv, ANALYSIS_CONFIG.lineLength);
      return {
        uci: l.pv[0],
        san: sanLine[0] ?? l.pv[0],
        evalWhite: l.cp * sign,
        mate: l.mate,
        sanLine,
        idea: describeIdea(fen, l.pv[0], turn),
      };
    });
  }

  // ------------------------------------------------------------ board setup

  startEdit(): void {
    const [placement, turn, castling] = this.fen().split(' ');
    this.deps.cancel();
    this.pending.clear();
    this.edit = { board: expand(placement), turn: turn as Color, castling, tool: null, error: null };
    this.deps.requestRender();
  }

  setTool(t: EditTool): void {
    if (!this.edit) return;
    this.edit.tool = this.edit.tool === t ? null : t;
    this.deps.requestRender();
  }

  /** A click on a square while setting up: place the selected piece (or erase). */
  editClick(square: string): void {
    const e = this.edit;
    if (!e || !e.tool) return;
    if (e.tool === 'erase') e.board.delete(square);
    else if (e.board.get(square) === e.tool) e.board.delete(square);
    else e.board.set(square, e.tool);
    this.refreshCastling();
    this.deps.requestRender();
  }

  /** Pieces dragged on the board (moved, or dropped off it to remove). */
  editChanged(placement: string): void {
    if (!this.edit) return;
    this.edit.board = expand(placement);
    this.refreshCastling();
    this.deps.requestRender();
  }

  setEditTurn(c: Color): void {
    if (!this.edit) return;
    this.edit.turn = c;
    this.edit.error = null;
    this.deps.requestRender();
  }

  toggleCastle(right: string): void {
    const e = this.edit;
    if (!e) return;
    const allowed = autoCastling(compress(e.board));
    if (!allowed.includes(right)) return;
    const has = e.castling.includes(right);
    const next = has ? e.castling.replace(right, '') : e.castling.replace('-', '') + right;
    e.castling = 'KQkq'.split('').filter((c) => next.includes(c)).join('') || '-';
    this.deps.requestRender();
  }

  /** Castling rights the current setup allows (king and rook on their home squares). */
  castlingAllowed(): string {
    return this.edit ? autoCastling(compress(this.edit.board)) : '-';
  }

  editClear(): void {
    if (!this.edit) return;
    this.edit.board = new Map();
    this.edit.castling = '-';
    this.deps.requestRender();
  }

  editStartPosition(): void {
    if (!this.edit) return;
    this.edit.board = expand(START_FEN.split(' ')[0]);
    this.edit.turn = 'w';
    this.edit.castling = 'KQkq';
    this.deps.requestRender();
  }

  /** Applies the setup: a new position with no moves. False (with an error shown) if it isn't legal. */
  finishEdit(): boolean {
    const e = this.edit;
    if (!e) return false;
    const r = setupFen(compress(e.board), e.turn, e.castling);
    if (!r.ok) {
      e.error = r.error;
      this.deps.requestRender();
      return false;
    }
    this.load({ startFen: r.fen, moves: [] });
    return true;
  }

  cancelEdit(): void {
    this.edit = null;
    this.changed();
  }

  /** Rights still allowed are kept; ones the new placement rules out are dropped. */
  private refreshCastling(): void {
    const e = this.edit!;
    const allowed = autoCastling(compress(e.board));
    e.castling = [...e.castling].filter((c) => allowed.includes(c)).join('') || '-';
    e.error = null;
  }

  // ------------------------------------------------------------ board

  async onBoardMove(from: string, to: string): Promise<void> {
    if (this.edit) return;
    const c = this.chess();
    const isPromo = c.moves({ verbose: true }).some((m) => m.from === from && m.to === to && m.promotion);
    const promo = isPromo ? await pickPromotion(this.deps.promotionHost, c.turn()) : undefined;
    if (promo === null) return this.deps.requestRender();
    if (!this.play(from + to + (promo ?? ''))) this.deps.requestRender();
  }

  boardView(): BoardView & { evalCp: number | null } {
    const e = this.edit;
    if (e) {
      return {
        fen: `${compress(e.board)} ${e.turn} - - 0 1`,
        orientation: this.orientation,
        turn: e.turn,
        movable: null,
        dests: new Map(),
        lastMove: null,
        check: false,
        shapes: [],
        editable: true,
        evalCp: null,
      };
    }
    const chess = this.chess();
    const last = this.cursor ? this.moves[this.cursor - 1] : null;
    const best = this.bestMoves();
    const shapes: BoardView['shapes'] = this.arrows
      ? best.map((b, i) => ({ from: b.uci.slice(0, 2), to: b.uci.slice(2, 4), brush: i === 0 ? 'green' : 'paleBlue' })).reverse()
      : [];
    const dests = new Map<string, string[]>();
    for (const m of chess.moves({ verbose: true })) dests.set(m.from, [...(dests.get(m.from) ?? []), m.to]);
    return {
      fen: chess.fen(),
      orientation: this.orientation,
      turn: chess.turn(),
      movable: chess.isGameOver() ? null : 'both',
      dests,
      lastMove: last ? [last.slice(0, 2), last.slice(2, 4)] : null,
      check: chess.inCheck(),
      shapes,
      evalCp: chess.isCheckmate() ? (chess.turn() === 'w' ? -MATE_CP : MATE_CP) : best[0]?.evalWhite ?? null,
    };
  }

  /** SAN of the moves in the line (for the move list). */
  sanMoves(): string[] {
    const c = new Chess(this.startFen);
    return this.moves.map((m) => c.move(m).san);
  }
}
