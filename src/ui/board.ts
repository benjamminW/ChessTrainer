import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import type { Classification, Color } from '../types';
import { boardBadgeSvg } from './classIcons';

export interface BoardView {
  fen: string;
  orientation: Color;
  turn: Color;
  /** Color the user may move now ('both' for a free analysis board), or null to lock the board. */
  movable: Color | 'both' | null;
  dests: Map<string, string[]>;
  lastMove: [string, string] | null;
  check: boolean;
  /** Arrows (from → to) or circles (no `to`). */
  shapes: { from: string; to?: string; brush: string }[];
  /** Move-class badge drawn in the corner of a square (the destination of the move being reviewed). */
  badge?: { square: string; cls: Classification } | null;
  /** Extra CSS classes for squares, e.g. a class-colored highlight. */
  squareClasses?: Map<string, string>;
  /** Setting up a position: pieces move freely and can be dragged off the board. */
  editable?: boolean;
}

export interface BoardEditEvents {
  /** A square was clicked (used to place the selected piece while setting up). */
  onSelect?: (square: string) => void;
  /** Pieces were moved by hand while setting up; gets the new piece placement. */
  onChange?: (placement: string) => void;
}

const cgColor = (c: Color) => (c === 'w' ? 'white' : 'black');

/** Thin wrapper over chessground: the app re-renders the whole view from state. */
export class Board {
  private cg: Api;
  private editing = false;

  constructor(el: HTMLElement, onMove: (from: string, to: string) => void, edit: BoardEditEvents = {}) {
    this.cg = Chessground(el, {
      coordinates: true,
      animation: { enabled: true, duration: 180 },
      highlight: { lastMove: true, check: true },
      movable: { free: false, showDests: true, events: { after: (from, to) => onMove(from, to) } },
      premovable: { enabled: false },
      draggable: { showGhost: true },
      drawable: { enabled: true, visible: true },
      events: {
        select: (key) => {
          if (this.editing) edit.onSelect?.(key);
        },
        change: () => {
          if (this.editing) edit.onChange?.(this.cg.getFen());
        },
      },
    });
  }

  render(v: BoardView): void {
    const shapes: DrawShape[] = v.shapes.map((s) => ({
      orig: s.from as Key,
      dest: s.to ? (s.to as Key) : undefined,
      brush: s.brush,
    }));
    if (v.badge) shapes.push({ orig: v.badge.square as Key, customSvg: { html: boardBadgeSvg(v.badge.cls), center: 'orig' } });
    this.editing = !!v.editable;
    this.cg.set({
      fen: v.fen.split(' ')[0],
      orientation: cgColor(v.orientation),
      turnColor: cgColor(v.turn),
      check: v.check,
      lastMove: v.lastMove ? (v.lastMove as Key[]) : undefined,
      movable: v.editable
        ? { free: true, color: 'both', dests: new Map() }
        : {
            free: false,
            color: v.movable === 'both' ? 'both' : v.movable ? cgColor(v.movable) : undefined,
            dests: v.dests as Map<Key, Key[]>,
          },
      draggable: { deleteOnDropOff: !!v.editable },
      drawable: { autoShapes: shapes },
      highlight: { lastMove: true, check: true, custom: (v.squareClasses ?? new Map()) as Map<Key, string> },
    });
    if (!v.lastMove) this.cg.state.lastMove = undefined;
  }
}
