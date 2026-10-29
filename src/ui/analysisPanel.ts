import { Chess } from 'chess.js';
import type { BestMoveMode } from '../analysis/controller';
import { ANALYSIS_DEPTHS, type AnalysisDepth } from '../config/analysis';
import { formatEval, formatLine } from '../coach/format';
import { h } from './panel';

const NAMES: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const sideName = (c: string) => (c === 'w' ? 'White' : 'Black');

function btn(label: string, onclick: () => void, opts: { primary?: boolean; disabled?: boolean; title?: string } = {}): HTMLElement {
  return h('button', { type: 'button', class: `btn${opts.primary ? ' primary' : ''}`, onclick, disabled: !!opts.disabled, title: opts.title ?? '' }, label);
}

/** The headline: best move for the side to move, its eval and idea, and the other candidates. */
function bestBlock(m: BestMoveMode): HTMLElement[] {
  const chess = m.chess();
  const turn = sideName(chess.turn());
  if (chess.isCheckmate()) return [h('p', { class: 'status' }, `Checkmate. ${sideName(chess.turn() === 'w' ? 'b' : 'w')} wins.`)];
  if (chess.isGameOver()) return [h('p', { class: 'status' }, 'Draw. There are no moves to calculate.')];
  if (m.engineError) return [h('p', { class: 'status bad' }, `The engine failed: ${m.engineError}`)];
  const best = m.bestMoves();
  if (!best.length) {
    return [
      h('p', { class: 'status' }, `${turn} to move.`),
      h('p', { class: 'bm-thinking' }, `Calculating the best move (depth ${m.depthValue})…`),
    ];
  }
  const top = best[0];
  const fen = m.fen();
  return [
    h('p', { class: 'status' }, `${turn} to move.`),
    h(
      'div',
      { class: 'bm-best' },
      h('span', { class: 'bm-label' }, 'Best move'),
      h('span', { class: 'bm-move' }, top.san),
      h('span', { class: 'bm-eval', title: 'Engine evaluation from White\'s side' }, formatEval(top.evalWhite)),
    ),
    top.idea ? h('p', { class: 'bm-idea' }, top.idea) : h('span', {}),
    h('p', { class: 'line' }, h('span', { class: 'line-label' }, 'Expected line'), formatLine(fen, top.sanLine)),
    h('div', { class: 'controls' }, btn(`Play ${top.san}`, () => m.play(top.uci), { primary: true })),
    best.length > 1 ? h('h3', {}, 'Other good moves') : h('span', {}),
    h(
      'ol',
      { class: 'bm-lines' },
      ...best.slice(1).map((b) =>
        h(
          'li',
          {},
          h('button', { type: 'button', class: 'rs-line', onclick: () => m.play(b.uci), title: `Play ${b.san}` },
            h('span', { class: 'rs-line-eval' }, formatEval(b.evalWhite)), ' ', formatLine(fen, b.sanLine)),
        ),
      ),
    ),
    h('p', { class: 'muted small' }, `Depth ${m.analysis()?.depth ?? m.depthValue}. Green arrow: best move. Blue: the alternatives.`),
  ];
}

function lineBlock(m: BestMoveMode): HTMLElement {
  const san = m.sanMoves();
  const blackFirst = new Chess(m.startFen).turn() === 'b';
  const firstNo = Number(m.startFen.split(' ')[5]) || 1;
  const list = h('div', { class: 'moves bm-moves' });
  let row: HTMLElement | null = null;
  san.forEach((s, i) => {
    const white = (i + (blackFirst ? 1 : 0)) % 2 === 0;
    if (white || !row) {
      row = h('div', { class: 'move-row' }, h('span', { class: 'move-no' }, `${firstNo + Math.floor((i + (blackFirst ? 1 : 0)) / 2)}.`));
      list.append(row);
      if (!white) row.append(h('span', { class: 'move-cell empty' }, '…'));
    }
    row.append(h('button', { type: 'button', class: `move-cell${i + 1 === m.cursor ? ' current' : ''}`, 'aria-current': i + 1 === m.cursor ? 'true' : false, onclick: () => m.goTo(i + 1) }, s));
  });
  return h(
    'div',
    { class: 'bm-section' },
    h('h3', {}, 'Moves'),
    san.length ? list : h('p', { class: 'muted small' }, 'Move pieces for either side to explore. Use ◀ ▶ under the board to step back and forth.'),
    h(
      'div',
      { class: 'controls' },
      btn('Undo', () => m.undo(), { disabled: !m.cursor }),
      btn('Flip board', () => m.flip()),
      btn('Starting position', () => m.reset()),
    ),
  );
}

function optionsBlock(m: BestMoveMode): HTMLElement {
  const depth = h('select', { onchange: (e: Event) => m.setDepth((e.target as HTMLSelectElement).value as AnalysisDepth['id']) },
    ...ANALYSIS_DEPTHS.map((d) => {
      const o = new Option(d.name, d.id);
      o.selected = d.id === m.depth;
      return o;
    }));
  const arrows = h('input', { type: 'checkbox', checked: m.arrows, onchange: (e: Event) => m.setArrows((e.target as HTMLInputElement).checked) });
  return h(
    'div',
    { class: 'appearance bm-options' },
    h('label', {}, 'Strength ', depth),
    h('label', { class: 'toggle' }, arrows, h('span', {}, 'Show arrows')),
  );
}

function loadBlock(m: BestMoveMode): HTMLElement {
  const area = h('textarea', { class: 'bm-paste', rows: '3', placeholder: 'Paste a FEN or a PGN (or a move list like 1. e4 e5 2. Nf3)', 'aria-label': 'FEN or PGN' }) as HTMLTextAreaElement;
  const fen = m.fen();
  return h(
    'div',
    { class: 'bm-section' },
    h('h3', {}, 'Position'),
    h(
      'div',
      { class: 'controls' },
      btn('Set up position', () => m.startEdit(), { primary: true }),
      btn('Use my game', () => m.usePlayGame(), { title: 'Load the position from the Play tab' }),
    ),
    area,
    h('div', { class: 'controls' }, btn('Load', () => m.loadText(area.value) && (area.value = ''))),
    m.loadError ? h('p', { class: 'status bad' }, m.loadError) : h('span', {}),
    h(
      'p',
      { class: 'bm-fen muted small' },
      h('span', {}, 'FEN '),
      h('code', {}, fen),
      ' ',
      h('button', { type: 'button', class: 'btn small', onclick: () => void navigator.clipboard?.writeText(fen) }, 'Copy'),
    ),
  );
}

/** A piece drawn with the board's current piece set (the theme CSS targets `.cg-wrap piece.<role>.<color>`). */
function pieceIcon(letter: string): HTMLElement {
  const piece = document.createElement('piece');
  piece.className = `${NAMES[letter.toLowerCase()]} ${letter === letter.toUpperCase() ? 'white' : 'black'}`;
  const wrap = h('span', { class: 'cg-wrap bm-piece' });
  wrap.append(piece);
  return wrap;
}

function editBlock(m: BestMoveMode): HTMLElement[] {
  const e = m.edit!;
  const tool = (t: string, label: Node | string, title: string) =>
    h('button', { type: 'button', class: `bm-tool${e.tool === t ? ' on' : ''}`, onclick: () => m.setTool(t), title, 'aria-label': title, 'aria-pressed': String(e.tool === t) }, label);
  const pieces = (letters: string) => [...letters].map((p) => tool(p, pieceIcon(p), `${p === p.toUpperCase() ? 'White' : 'Black'} ${NAMES[p.toLowerCase()]}`));
  const allowed = m.castlingAllowed();
  const castle = (r: string, label: string) =>
    h('label', { class: allowed.includes(r) ? '' : 'muted' },
      h('input', { type: 'checkbox', checked: e.castling.includes(r), disabled: !allowed.includes(r), onchange: () => m.toggleCastle(r) }), ` ${label}`);
  const turn = (c: 'w' | 'b') =>
    h('label', {}, h('input', { type: 'radio', name: 'bm-turn', checked: e.turn === c, onchange: () => m.setEditTurn(c) }), ` ${sideName(c)}`);
  return [
    h('h3', {}, 'Set up position'),
    h('p', { class: 'muted small' }, 'Pick a piece, then click squares to place it (click again to remove). Drag pieces to move them, or drag them off the board to remove them.'),
    h('div', { class: 'bm-palette' }, ...pieces('KQRBNP')),
    h('div', { class: 'bm-palette' }, ...pieces('kqrbnp'), tool('erase', '✕', 'Erase')),
    h('fieldset', { class: 'field bm-fieldset' }, h('legend', {}, 'Side to move'), turn('w'), turn('b')),
    h('fieldset', { class: 'field bm-fieldset' }, h('legend', {}, 'Castling'), castle('K', 'White O-O'), castle('Q', 'White O-O-O'), castle('k', 'Black O-O'), castle('q', 'Black O-O-O')),
    e.error ? h('p', { class: 'status bad' }, e.error) : h('span', {}),
    h(
      'div',
      { class: 'controls' },
      btn('Done', () => m.finishEdit(), { primary: true }),
      btn('Clear board', () => m.editClear()),
      btn('Starting position', () => m.editStartPosition()),
      btn('Cancel', () => m.cancelEdit()),
    ),
  ];
}

export function renderAnalysisPanel(el: HTMLElement, m: BestMoveMode): void {
  el.replaceChildren(h('h2', {}, 'Best move'));
  if (m.edit) {
    el.append(...editBlock(m));
    return;
  }
  el.append(
    h('div', { class: 'bm-body', 'aria-live': 'polite' }, ...bestBlock(m)),
    optionsBlock(m),
    lineBlock(m),
    loadBlock(m),
  );
}
