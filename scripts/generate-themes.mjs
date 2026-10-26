// Generates the custom piece sets and boards in src/themes/.
// Run with `node scripts/generate-themes.mjs` after editing a shape or color.
// (Not part of the build: the generated SVGs are committed.)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'themes');

// ---------------------------------------------------------------- piece shapes (45×45 canvas)

const BASE = '<rect x="11" y="34" width="23" height="5" rx="1.5"/>';
const SHAPES = {
  P: '<circle cx="22.5" cy="13.5" r="5"/><path d="M19 19h7l3 15H16z"/>' + BASE,
  R: '<path d="M13 9h4v3h3V9h5v3h3V9h4v8H13z"/><path d="M15.5 17h14l1 17h-16z"/>' + BASE,
  B: '<circle cx="22.5" cy="7.5" r="2.2"/><path d="M22.5 9.5c-5 4.5-7 9.5-6 14 .8 3 11.2 3 12 0 1-4.5-1-9.5-6-14z"/>' +
    '<path class="d" d="M20 14.5l5 5" fill="none"/><path d="M17 27h11v3H17z"/><path d="M18 30h9l2 4H16z"/>' + BASE,
  N: '<path d="M14 34l2-7c1-2 2.5-3 4-3.5l-6.5-.5c-2 0-3-2-2.5-3.5l6-7 2-5 3 3.5c5-.5 10 3.5 10 11.5l-1 11.5z"/>' +
    '<circle class="e" cx="18" cy="16" r="1.2"/>' + BASE,
  Q: '<circle cx="10.5" cy="13.5" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/><circle cx="26.5" cy="10" r="2.2"/><circle cx="34.5" cy="13.5" r="2.2"/>' +
    '<path d="M11 16l4 14h15l4-14-6 7-2.5-11-3 10.5-3-10.5L17 23z"/><path d="M14 30h17v4H14z"/>' + BASE,
  K: '<path d="M21 4h3v3h3v3h-3v4h-3v-4h-3V7h3z"/><path d="M13.5 19c0-4 18-4 18 0l-3 11h-12z"/><path d="M15 30h15v4H15z"/>' + BASE,
};

const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45">${inner}</svg>\n`;

// Minimal: flat fill with a dark outline.
function minimal(color, body) {
  const [fill, stroke, detail] = color === 'w' ? ['#f9f9f6', '#262626', '#262626'] : ['#3a3a3a', '#111111', '#f2f2f2'];
  return svg(
    `<style>.d{stroke:${detail};stroke-width:1.6;stroke-linecap:round}.e{fill:${detail};stroke:none}</style>` +
      `<g fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round">${body}</g>`,
  );
}

// Neon: glass body with a glowing tube outline. White = cyan, Black = hot pink.
export const NEON = { w: '#5ff3ff', b: '#ff4fd8' };
function neon(color, body) {
  const c = NEON[color];
  const core = color === 'w' ? '#e6fdff' : '#ffe3f8';
  return svg(
    '<defs>' +
      '<filter id="g" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="b"/>' +
      '<feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      `<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".55"/>` +
      `<stop offset="1" stop-color="${c}" stop-opacity=".12"/></linearGradient>` +
      '</defs>' +
      `<style>.d{stroke:${core};stroke-width:1.4;stroke-linecap:round}.e{fill:${core};stroke:none}</style>` +
      // Glow layer in the neon color, then a thin bright core line on top, like a lit tube.
      `<g filter="url(#g)" fill="url(#f)" stroke="${c}" stroke-width="2" stroke-linejoin="round">${body}</g>` +
      `<g fill="none" stroke="${core}" stroke-width=".7" stroke-linejoin="round" opacity=".9">${body}</g>`,
  );
}

for (const [name, style] of [['minimal', minimal], ['neon', neon]]) {
  mkdirSync(join(out, name), { recursive: true });
  for (const color of ['w', 'b']) {
    for (const [k, body] of Object.entries(SHAPES)) writeFileSync(join(out, name, `${color}${k}.svg`), style(color, body));
  }
}

// ---------------------------------------------------------------- boards (8×8, a8 top-left is light)

const darkSquares = (fill) => {
  let r = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) r += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  return `<g fill="${fill}">${r}</g>`;
};

writeFileSync(
  join(out, 'board-green.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges">` +
    `<rect width="8" height="8" fill="#eeeed2"/>${darkSquares('#769656')}</svg>\n`,
);

// Neon: deep purple grid with glowing lines and a magenta haze in the middle.
let lines = '';
for (let i = 0; i <= 8; i++) lines += `<path d="M${i} 0V8M0 ${i}H8"/>`;
writeFileSync(
  join(out, 'board-neon.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">' +
    '<defs><radialGradient id="h" cx=".5" cy=".5" r=".75">' +
    '<stop offset="0" stop-color="#ff4fd8" stop-opacity=".16"/><stop offset="1" stop-color="#ff4fd8" stop-opacity="0"/></radialGradient></defs>' +
    `<rect width="8" height="8" fill="#211a4d"/>${darkSquares('#0d0b22')}` +
    '<rect width="8" height="8" fill="url(#h)"/>' +
    `<g stroke="${NEON.w}" stroke-opacity=".28" stroke-width=".025">${lines}</g></svg>\n`,
);

console.log('[generate-themes] wrote src/themes/');
