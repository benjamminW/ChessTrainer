import { describe, expect, it } from 'vitest';
import css from '../src/themes/generated.css?raw';
import { BOARDS, PIECE_SETS } from '../src/themes/catalog';

// Paths of every SVG in src/themes, e.g. '../src/themes/neon/wK.svg'.
const files = new Set(Object.keys(import.meta.glob('../src/themes/**/*.svg')));
const has = (path: string) => files.has(`../src/themes/${path}`);

describe('theme catalog', () => {
  it('has the built-in defaults first', () => {
    expect(BOARDS[0].id).toBe('brown');
    expect(PIECE_SETS[0].id).toBe('classic');
  });

  it('has an image and a CSS rule for every board', () => {
    for (const b of BOARDS.filter((b) => b.id !== 'brown')) {
      expect(has(`board-${b.id}.svg`), b.id).toBe(true);
      expect(css).toContain(`.board-${b.id} cg-board`);
    }
  });

  it('has all 12 pieces and CSS rules for every piece set', () => {
    for (const p of PIECE_SETS.filter((p) => p.id !== 'classic')) {
      for (const c of ['w', 'b']) for (const k of 'KQRBNP') expect(has(`${p.id}/${c}${k}.svg`), `${p.id}/${c}${k}`).toBe(true);
      expect(css).toContain(`.pieces-${p.id} .cg-wrap piece.king.white`);
    }
  });

  it('has unique ids', () => {
    expect(new Set(BOARDS.map((b) => b.id)).size).toBe(BOARDS.length);
    expect(new Set(PIECE_SETS.map((p) => p.id)).size).toBe(PIECE_SETS.length);
  });
});
