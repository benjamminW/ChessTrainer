/** Display metadata and groupings for the move classes. */
import type { Classification } from '../types';

/** Best to worst; also the order of the summary's count table. */
export const CLASS_ORDER: Classification[] = [
  'Brilliant', 'Great', 'Best', 'Excellent', 'Good', 'Book', 'Inaccuracy', 'Mistake', 'Miss', 'Blunder',
];

export interface ClassInfo {
  /** "a blunder", "the best move"… for the coach line. */
  phrase: string;
  /** Shown after the move in lists, e.g. '??'. */
  glyph: string;
}

export const CLASS_INFO: Record<Classification, ClassInfo> = {
  Brilliant: { phrase: 'brilliant', glyph: '!!' },
  Great: { phrase: 'a great move', glyph: '!' },
  Best: { phrase: 'the best move', glyph: '' },
  Excellent: { phrase: 'excellent', glyph: '' },
  Good: { phrase: 'a good move', glyph: '' },
  Book: { phrase: 'a book move', glyph: '' },
  Inaccuracy: { phrase: 'an inaccuracy', glyph: '?!' },
  Mistake: { phrase: 'a mistake', glyph: '?' },
  Miss: { phrase: 'a miss', glyph: '?' },
  Blunder: { phrase: 'a blunder', glyph: '??' },
};

/** Moves that lost ground: get explanations, count as "mistakes" in reviews and patterns. */
export const BAD_CLASSES: Classification[] = ['Inaccuracy', 'Mistake', 'Miss', 'Blunder'];

/** The serious ones (used for time-trouble and pattern counts). */
export const ERROR_CLASSES: Classification[] = ['Mistake', 'Miss', 'Blunder'];

/** Moves worth celebrating in key moments. */
export const GOOD_HIGHLIGHTS: Classification[] = ['Brilliant', 'Great'];

export const isBad = (c: Classification | undefined | null): boolean => !!c && BAD_CLASSES.includes(c);

export function classSlug(c: Classification): string {
  return c.toLowerCase();
}
