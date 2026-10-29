/**
 * Original move-class icons: a colored disc with a simple white mark. Drawn for this app
 * (no third-party artwork). Used in move lists, the summary table, the eval graph and as
 * badges on the board.
 */
import type { Classification } from '../types';

/** Disc color per class (also used for the square highlight and graph dots). */
export const CLASS_COLOR: Record<Classification, string> = {
  Brilliant: '#1fb5a8',
  Great: '#4f86d8',
  Best: '#5ca33b',
  Excellent: '#86b84a',
  Good: '#8fa88a',
  Book: '#a9865f',
  Inaccuracy: '#e3b21b',
  Mistake: '#e5822b',
  Miss: '#d9577a',
  Blunder: '#cf3a2f',
};

const text = (t: string, size = 54) =>
  `<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-weight="800" font-size="${size}" fill="#fff">${t}</text>`;

/** White marks drawn in a 100×100 box. */
const MARK: Record<Classification, string> = {
  Brilliant: text('!!', 50),
  Great: text('!', 60),
  // five-point star
  Best: '<path d="M50 18 59 39 82 40 64 55 70 78 50 65 30 78 36 55 18 40 41 39Z" fill="#fff"/>',
  // thick check mark
  Excellent: '<path d="M27 52 43 68 74 34" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>',
  // thin check mark
  Good: '<path d="M30 52 44 66 70 37" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>',
  // open book
  Book: '<path d="M50 34C42 28 31 27 22 29V71C31 69 42 70 50 76 58 70 69 69 78 71V29C69 27 58 28 50 34ZM50 34V76" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/>',
  Inaccuracy: text('?!', 46),
  Mistake: text('?', 60),
  // a cross: the win slipped through
  Miss: '<path d="M33 33 67 67M67 33 33 67" stroke="#fff" stroke-width="12" stroke-linecap="round"/>',
  Blunder: text('??', 48),
};

/** Full icon as an SVG string (100×100 viewBox). */
export function classIconSvg(c: Classification, size = 18): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">` +
    `<circle cx="50" cy="50" r="48" fill="${CLASS_COLOR[c]}" stroke="rgba(0,0,0,.25)" stroke-width="3"/>${MARK[c]}</svg>`;
}

/** Icon element for HTML (with an accessible label). */
export function classIcon(c: Classification, size = 18): HTMLElement {
  const span = document.createElement('span');
  span.className = 'cls-icon';
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', c);
  span.title = c;
  span.innerHTML = classIconSvg(c, size);
  return span;
}

/**
 * Badge for a board square, as chessground `customSvg` content. Chessground draws it in a
 * 100×100 box over the square; the badge sits in the top-right corner, half outside.
 */
export function boardBadgeSvg(c: Classification): string {
  return `<g transform="translate(66 -14) scale(0.46)"><circle cx="50" cy="50" r="48" fill="${CLASS_COLOR[c]}" stroke="rgba(0,0,0,.35)" stroke-width="4"/>${MARK[c]}</g>`;
}
