// Generates every custom board and piece set in src/themes/:
//   - the SVG images (src/themes/board-*.svg, src/themes/<set>/<color><piece>.svg)
//   - src/themes/generated.css  (which class shows which image)
//   - src/themes/catalog.ts     (the lists shown in the Board / Pieces dropdowns)
// Run with `node scripts/generate-themes.mjs` after adding or editing a theme.
// It's not part of the build: the generated files are committed.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'themes');
mkdirSync(out, { recursive: true });

const svg = (inner, viewBox = '0 0 45 45', extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${extra}>${inner}</svg>\n`;

// ================================================================= boards

// Board color combos: [id, dropdown name, light square, dark square]. a8 (top-left) is light.
const FLAT_BOARDS = [
  ['green', 'Green', '#eeeed2', '#769656'],
  ['ocean', 'Ocean', '#d6e6f2', '#5a86ad'],
  ['walnut', 'Walnut', '#ecd3a8', '#a0703f'],
  ['slate', 'Slate', '#dde1e6', '#6b7686'],
  ['coral', 'Coral', '#f8e4d8', '#d9786a'],
  ['lavender', 'Lavender', '#ece5f6', '#8f78bd'],
  ['midnight', 'Midnight', '#4b5680', '#232a47'],
  ['sakura', 'Sakura', '#fcebf0', '#e39ab3'],
  ['sand', 'Sand', '#f4e6c8', '#c89b5c'],
  ['emerald', 'Emerald', '#e3f0e1', '#3e7d58'],
  ['royal', 'Royal', '#e3cf94', '#2c2b36'],
];

const darkSquares = (fill) => {
  let r = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) r += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  return `<g fill="${fill}">${r}</g>`;
};

for (const [id, , light, dark] of FLAT_BOARDS) {
  writeFileSync(
    join(out, `board-${id}.svg`),
    svg(`<rect width="8" height="8" fill="${light}"/>${darkSquares(dark)}`, '0 0 8 8', ' shape-rendering="crispEdges"'),
  );
}

// Neon: deep purple grid with glowing lines and a magenta haze. Its glow effects are in src/themes.css.
export const NEON = { w: '#5ff3ff', b: '#ff4fd8' };
{
  let lines = '';
  for (let i = 0; i <= 8; i++) lines += `<path d="M${i} 0V8M0 ${i}H8"/>`;
  writeFileSync(
    join(out, 'board-neon.svg'),
    svg(
      '<defs><radialGradient id="h" cx=".5" cy=".5" r=".75">' +
        `<stop offset="0" stop-color="${NEON.b}" stop-opacity=".16"/><stop offset="1" stop-color="${NEON.b}" stop-opacity="0"/></radialGradient></defs>` +
        `<rect width="8" height="8" fill="#211a4d"/>${darkSquares('#0d0b22')}` +
        '<rect width="8" height="8" fill="url(#h)"/>' +
        `<g stroke="${NEON.w}" stroke-opacity=".28" stroke-width=".025">${lines}</g>`,
      '0 0 8 8',
    ),
  );
}

const BOARDS = [
  { id: 'brown', name: 'Brown', bg: '#f0d9b5' }, // chessground's built-in board
  ...FLAT_BOARDS.slice(0, 1).map(([id, name, light]) => ({ id, name, bg: light })),
  { id: 'neon', name: 'Neon', bg: '#0d0b22' },
  ...FLAT_BOARDS.slice(1).map(([id, name, light]) => ({ id, name, bg: light })),
];

// ================================================================= vector piece shapes (45×45)
// Classes: .d = detail line, .e = detail dot (eye). Each style colors them.

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

const detailStyle = (color, width = 1.6) =>
  `<style>.d{stroke:${color};stroke-width:${width};stroke-linecap:round;fill:none}.e{fill:${color};stroke:none}</style>`;

const linear = (id, stops, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">` +
  stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('') +
  '</linearGradient>';

// Minimal: flat fill with a dark outline.
function minimal(color, body) {
  const [fill, stroke, detail] = color === 'w' ? ['#f9f9f6', '#262626', '#262626'] : ['#3a3a3a', '#111111', '#f2f2f2'];
  return svg(
    `<style>.d{stroke:${detail};stroke-width:1.6;stroke-linecap:round}.e{fill:${detail};stroke:none}</style>` +
      `<g fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round">${body}</g>`,
  );
}

// Neon: glass body with a glowing tube outline. White = cyan, Black = hot pink.
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

// Metal: polished silver (White) and gold (Black), with a shine line.
function metal(color, body) {
  const g = color === 'w'
    ? [[0, '#ffffff'], [0.45, '#d9dde3'], [0.55, '#aab1bc'], [1, '#e8ebef']]
    : [[0, '#fff1b8'], [0.45, '#e3b33f'], [0.55, '#a8781a'], [1, '#f1cf6a']];
  const stroke = color === 'w' ? '#4a515c' : '#5b3d06';
  return svg(
    `<defs>${linear('m', g, 1, 1)}${linear('s', [[0, '#fff', 0.7], [0.4, '#fff', 0]], 0, 1)}</defs>` +
      detailStyle(stroke, 1.4) +
      `<g fill="url(#m)" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round">${body}</g>` +
      `<g fill="url(#s)" stroke="none">${body}</g>`,
  );
}

// Toy: shiny plastic, sky blue (White) vs cherry red (Black), with a glossy highlight.
function toy(color, body) {
  const [hi, mid, lo, stroke] = color === 'w'
    ? ['#e6f6ff', '#5bb6f0', '#1f6fb5', '#0f3f6e']
    : ['#ffd0c8', '#ef4a3c', '#a3150c', '#5c0904'];
  return svg(
    '<defs>' +
      `<radialGradient id="t" cx=".35" cy=".25" r=".9"><stop offset="0" stop-color="${hi}"/>` +
      `<stop offset=".45" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></radialGradient>` +
      linear('gl', [[0, '#fff', 0.75], [0.35, '#fff', 0]], 0.3, 1) +
      '</defs>' +
      detailStyle('#ffffff', 1.6) +
      `<g fill="url(#t)" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round">${body}</g>` +
      `<g fill="url(#gl)" stroke="none">${body}</g>`,
  );
}

// Tokens: a coin with a rim and the piece's emblem embossed in the middle.
function tokens(color, body) {
  const [face, rim, emblem, edge] = color === 'w'
    ? ['#f6f1e4', '#a8916a', '#4a3d28', '#6b5a3c']
    : ['#2d2c31', '#c9a45c', '#efe1c2', '#111014'];
  return svg(
    `<defs>${linear('c', color === 'w' ? [[0, '#fffdf6'], [1, face]] : [[0, '#45444b'], [1, face]])}</defs>` +
      `<circle cx="22.5" cy="23" r="19" fill="${edge}"/>` +
      `<circle cx="22.5" cy="22" r="19" fill="url(#c)" stroke="${rim}" stroke-width="2"/>` +
      `<circle cx="22.5" cy="22" r="15.5" fill="none" stroke="${rim}" stroke-width=".8" stroke-dasharray="1.2 1.4"/>` +
      `<style>.d{stroke:${face};stroke-width:2.2;stroke-linecap:round;fill:none}.e{fill:${face};stroke:none}</style>` +
      `<g transform="translate(22.5 22) scale(.58) translate(-22.5 -22)" fill="${emblem}" stroke="${emblem}" stroke-width="1" stroke-linejoin="round">${body}</g>`,
  );
}

// Wood: carved maple (White) and walnut (Black) with grain and soft shading.
function wood(color, body) {
  const [base, grain, stroke] = color === 'w' ? ['#e9c78e', '#b88a4a', '#6b4a1f'] : ['#5a3418', '#2e1909', '#1d0f04'];
  let lines = '';
  for (let i = 0; i < 9; i++) {
    const x = 2 + i * 5;
    lines += `<path d="M${x} 0c2 8-2 14 0 22s-2 14 0 23" />`;
  }
  return svg(
    '<defs>' +
      `<pattern id="w" width="45" height="45" patternUnits="userSpaceOnUse"><rect width="45" height="45" fill="${base}"/>` +
      `<g fill="none" stroke="${grain}" stroke-width=".6" opacity=".55">${lines}</g></pattern>` +
      linear('sh', [[0, '#fff', 0.35], [0.5, '#fff', 0], [1, '#000', 0.35]], 1, 0) +
      '</defs>' +
      detailStyle(color === 'w' ? stroke : '#d9b483', 1.5) +
      `<g fill="url(#w)" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round">${body}</g>` +
      `<g fill="url(#sh)" stroke="none">${body}</g>`,
  );
}

// ================================================================= pixel art pieces
// 15×15 maps ('#' = body); outline and shading are added automatically.

const PIXEL_MAPS = {
  P: [
    '...............',
    '...............',
    '...............',
    '......###......',
    '.....#####.....',
    '.....#####.....',
    '......###......',
    '.....#####.....',
    '......###......',
    '......###......',
    '.....#####.....',
    '....#######....',
    '...#########...',
    '...#########...',
    '...............',
  ],
  R: [
    '...............',
    '...............',
    '...##.###.##...',
    '...#########...',
    '....#######....',
    '....#######....',
    '....#######....',
    '....#######....',
    '....#######....',
    '....#######....',
    '...#########...',
    '..###########..',
    '..###########..',
    '..###########..',
    '...............',
  ],
  N: [
    '...............',
    '......#.#......',
    '.....######....',
    '....########...',
    '...##.#######..',
    '..###########..',
    '.############..',
    '.####..#######.',
    '.###...#######.',
    '......#######..',
    '.....########..',
    '.....########..',
    '...##########..',
    '..###########..',
    '...............',
  ],
  B: [
    '...............',
    '.......#.......',
    '......###......',
    '.....#####.....',
    '....###.###....',
    '....##.####....',
    '....#######....',
    '.....#####.....',
    '......###......',
    '.....#####.....',
    '......###......',
    '....#######....',
    '...#########...',
    '...#########...',
    '...............',
  ],
  Q: [
    '...............',
    '.#..#..#..#..#.',
    '.#..#..#..#..#.',
    '.##.##.#.##.##.',
    '.#############.',
    '..###########..',
    '..###########..',
    '...#########...',
    '....#######....',
    '....#######....',
    '...#########...',
    '..###########..',
    '..###########..',
    '..###########..',
    '...............',
  ],
  K: [
    '.......#.......',
    '......###......',
    '.......#.......',
    '...#########...',
    '..###########..',
    '..###########..',
    '...#########...',
    '....#######....',
    '....#######....',
    '....#######....',
    '...#########...',
    '..###########..',
    '..###########..',
    '..###########..',
    '...............',
  ],
};

function pixel(color, map) {
  const N = 17; // 15×15 map with a 1-cell margin for the outline
  const body = (x, y) => map[y - 1]?.[x - 1] === '#';
  const [fill, shade, light, outline] = color === 'w'
    ? ['#f2f2ee', '#b9b9b3', '#ffffff', '#141414']
    : ['#4a4a60', '#2b2b3b', '#6c6c88', '#0b0b10'];
  let rects = '';
  const px = (x, y, c) => (rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (body(x, y)) {
        const edgeBR = !body(x + 1, y) || !body(x, y + 1);
        const edgeTL = !body(x - 1, y) || !body(x, y - 1);
        px(x, y, edgeBR ? shade : edgeTL ? light : fill);
      } else if (body(x - 1, y) || body(x + 1, y) || body(x, y - 1) || body(x, y + 1)) {
        px(x, y, outline);
      }
    }
  }
  // Leave a little room around the sprite so it matches the vector sets' size.
  return svg(rects, '-2 -2.5 21 21', ' shape-rendering="crispEdges"');
}

// ================================================================= write piece sets

const PIECE_SETS = [
  { id: 'minimal', name: 'Minimal', draw: (c, k) => minimal(c, SHAPES[k]) },
  { id: 'neon', name: 'Neon', draw: (c, k) => neon(c, SHAPES[k]) },
  { id: 'metal', name: 'Metal (silver & gold)', draw: (c, k) => metal(c, SHAPES[k]) },
  { id: 'toy', name: 'Toy (blue & red)', draw: (c, k) => toy(c, SHAPES[k]) },
  { id: 'pixel', name: 'Pixel (8-bit)', draw: (c, k) => pixel(c, PIXEL_MAPS[k]) },
  { id: 'tokens', name: 'Tokens', draw: (c, k) => tokens(c, SHAPES[k]) },
  { id: 'wood', name: 'Wood', draw: (c, k) => wood(c, SHAPES[k]) },
];

const PIECE_NAMES = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };

for (const set of PIECE_SETS) {
  rmSync(join(out, set.id), { recursive: true, force: true });
  mkdirSync(join(out, set.id), { recursive: true });
  for (const c of ['w', 'b']) for (const k of Object.keys(PIECE_NAMES)) writeFileSync(join(out, set.id, `${c}${k}.svg`), set.draw(c, k));
}

// ================================================================= CSS and catalog

let css = '/* Generated by scripts/generate-themes.mjs. Do not edit by hand. */\n\n';
for (const b of BOARDS.filter((b) => b.id !== 'brown')) {
  css += `.board-${b.id} cg-board { background-color: ${b.bg}; background-image: url('./board-${b.id}.svg'); }\n`;
}
for (const set of PIECE_SETS) {
  css += '\n';
  for (const [c, cname] of [['w', 'white'], ['b', 'black']]) {
    for (const [k, n] of Object.entries(PIECE_NAMES)) {
      css += `.pieces-${set.id} .cg-wrap piece.${n}.${cname} { background-image: url('./${set.id}/${c}${k}.svg'); }\n`;
    }
  }
}
writeFileSync(join(out, 'generated.css'), css);

const list = (items) => items.map((i) => `  { id: '${i.id}', name: '${i.name}' },`).join('\n');
writeFileSync(
  join(out, 'catalog.ts'),
  `// Generated by scripts/generate-themes.mjs. Do not edit by hand.

export interface ThemeOption {
  id: string;
  name: string;
}

/** Boards in dropdown order. 'brown' is chessground's built-in board. */
export const BOARDS: ThemeOption[] = [
${list(BOARDS)}
];

/** Piece sets in dropdown order. 'classic' is chessground's built-in cburnett set. */
export const PIECE_SETS: ThemeOption[] = [
  { id: 'classic', name: 'Classic' },
${list(PIECE_SETS)}
];
`,
);

console.log(`[generate-themes] wrote ${BOARDS.length - 1} boards and ${PIECE_SETS.length} piece sets to src/themes/`);
