import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import type { Color } from '../types';

export interface BoardView {
  fen: string;
  orientation: Color;
  turn: Color;
  /** Color the user may move now, or null to lock the board. */
  movable: Color | null;
  dests: Map<string, string[]>;
  lastMove: [string, string] | null;
  check: boolean;
  shapes: { from: string; to: string; brush: string }[];
}

const cgColor = (c: Color) => (c === 'w' ? 'white' : 'black');

/** Thin wrapper over chessground: the app re-renders the whole view from state. */
export class Board {
  private cg: Api;

  constructor(el: HTMLElement, onMove: (from: string, to: string) => void) {
    this.cg = Chessground(el, {
      coordinates: true,
      animation: { enabled: true, duration: 180 },
      highlight: { lastMove: true, check: true },
      movable: { free: false, showDests: true, events: { after: (from, to) => onMove(from, to) } },
      premovable: { enabled: false },
      draggable: { showGhost: true },
      drawable: { enabled: true, visible: true },
    });
  }

  render(v: BoardView): void {
    const shapes: DrawShape[] = v.shapes.map((s) => ({ orig: s.from as Key, dest: s.to as Key, brush: s.brush }));
    this.cg.set({
      fen: v.fen.split(' ')[0],
      orientation: cgColor(v.orientation),
      turnColor: cgColor(v.turn),
      check: v.check,
      lastMove: v.lastMove ? (v.lastMove as Key[]) : undefined,
      movable: {
        color: v.movable ? cgColor(v.movable) : undefined,
        dests: v.dests as Map<Key, Key[]>,
      },
      drawable: { autoShapes: shapes },
    });
    if (!v.lastMove) this.cg.state.lastMove = undefined;
  }
}
