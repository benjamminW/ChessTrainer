import { formatEval, formatLine, whiteShare } from '../coach/format';
import type { HintStep } from '../coach/hints';
import type { Tip } from '../coach/tips';
import type { Classification, Color, PlyRecord } from '../types';

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | ((e: Event) => void)> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false) el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

export const GLYPH: Record<Classification, string> = {
  Best: '',
  Good: '',
  Inaccuracy: '?!',
  Mistake: '?',
  Blunder: '??',
};

export function classSlug(c: Classification): string {
  return c.toLowerCase();
}

// ---------------------------------------------------------------- move list

export function renderMoves(
  el: HTMLElement,
  plies: PlyRecord[],
  cursor: number,
  showReviews: boolean,
  onSelect: (n: number) => void,
): void {
  el.replaceChildren();
  if (plies.length === 0) {
    el.append(h('p', { class: 'muted' }, 'No moves yet.'));
    return;
  }
  const firstFull = Number(plies[0].fenBefore.split(' ')[5]) || 1;
  const blackFirst = plies[0].color === 'b';
  const rows: HTMLElement[] = [];
  let row: HTMLElement | null = null;

  plies.forEach((p, i) => {
    if (p.color === 'w' || !row) {
      const moveNo = firstFull + Math.floor((i + (blackFirst ? 1 : 0)) / 2);
      row = h('div', { class: 'move-row' }, h('span', { class: 'move-no' }, `${moveNo}.`));
      rows.push(row);
      if (p.color === 'b') row.append(h('span', { class: 'move-cell empty' }, '…'));
    }
    const r = showReviews ? p.review : undefined;
    const cell = h(
      'button',
      {
        type: 'button',
        class: `move-cell${i + 1 === cursor ? ' current' : ''}${r ? ' cls-' + classSlug(r.classification) : ''}`,
        'aria-current': i + 1 === cursor ? 'true' : false,
        title: r ? `${r.classification} (${formatEval(r.evalAfter)})` : p.san,
        onclick: () => onSelect(i + 1),
      },
      p.san,
      r && GLYPH[r.classification] ? h('span', { class: 'glyph' }, GLYPH[r.classification]) : null,
      p.hint ? h('span', { class: 'hint-mark', title: `Hint used (level ${p.hint})`, 'aria-label': 'hint used' }, '•') : null,
    );
    row!.append(cell);
  });
  el.append(...rows);
  // Keep the current move visible by scrolling only the list (scrollIntoView would scroll the page too).
  const cur = el.querySelector<HTMLElement>('.current');
  if (cur && (cur.offsetTop < el.scrollTop || cur.offsetTop + cur.offsetHeight > el.scrollTop + el.clientHeight)) {
    el.scrollTop = cur.offsetTop - el.clientHeight / 2;
  }
}

// ---------------------------------------------------------------- eval bar

export function renderEvalBar(el: HTMLElement, cpWhite: number | null, orientation: Color, visible: boolean): void {
  // Keep the bar's space when hidden so the board doesn't change size.
  el.classList.toggle('concealed', !visible);
  el.setAttribute('aria-hidden', visible ? 'false' : 'true');
  if (!visible) return;
  el.classList.toggle('flipped', orientation === 'b');
  const fill = el.querySelector<HTMLElement>('.evalbar-fill')!;
  const label = el.querySelector<HTMLElement>('.evalbar-label')!;
  if (cpWhite === null) {
    label.textContent = '…';
    return;
  }
  fill.style.height = `${(whiteShare(cpWhite) * 100).toFixed(1)}%`;
  label.textContent = formatEval(cpWhite);
  label.classList.toggle('on-white', cpWhite >= 0);
  el.setAttribute('aria-label', `Evaluation ${formatEval(cpWhite)}`);
}

// ---------------------------------------------------------------- explanation

export interface ExplainEntry {
  ply: PlyRecord;
  /** For a user mistake: whether the better-move preview is on, and its toggle. */
  previewOn?: boolean;
  onTogglePreview?: () => void;
}

export interface ExplainView {
  kind: 'start' | 'hidden' | 'moves';
  /** Moves to explain, oldest first (your move, then the coach's reply). */
  entries?: ExplainEntry[];
  /** Shown above the card after a takeback. */
  takebackNote?: { san: string; classification: Classification; bestSan: string | null } | null;
}

export function moveLabel(p: PlyRecord): string {
  const n = p.fenBefore.split(' ')[5];
  return p.color === 'w' ? `${n}. ${p.san}` : `${n}… ${p.san}`;
}

export function renderExplanation(el: HTMLElement, v: ExplainView): void {
  el.replaceChildren();
  if (v.takebackNote) {
    const t = v.takebackNote;
    el.append(
      h('div', { class: 'note' },
        `You took back ${t.san} (${t.classification}).`,
        t.bestSan && t.classification !== 'Best' ? ` The green arrow shows ${t.bestSan}, the engine's choice.` : '',
      ),
    );
  }

  if (v.kind === 'start') {
    if (!v.takebackNote) {
      el.append(h('p', { class: 'muted' }, 'Make a move. After each move the coach rates it and explains the idea here.'));
    }
    return;
  }
  if (v.kind === 'hidden') {
    el.append(
      h('p', { class: 'muted' }, 'Coach is hidden while you play. Explanations, the eval bar and arrows appear when the game ends.'),
    );
    return;
  }
  for (const entry of v.entries ?? []) {
    const box = h('div', { class: 'explain-entry' });
    renderEntry(box, entry);
    el.append(box);
  }
}

function renderEntry(el: HTMLElement, v: ExplainEntry): void {
  const p = v.ply;
  const r = p.review;
  const header = h('div', { class: 'explain-head' },
    h('span', { class: 'explain-move' }, moveLabel(p)),
    h('span', { class: 'who' }, p.by === 'user' ? 'You' : 'Coach'),
  );
  el.append(header);
  if (!r) {
    el.append(h('p', { class: 'muted' }, 'Analyzing…'));
    return;
  }
  header.append(
    h('span', { class: `badge cls-${classSlug(r.classification)}` }, r.classification),
    h('span', { class: 'eval' }, formatEval(r.evalAfter)),
  );
  const e = r.explanation;
  el.append(h('p', { class: 'headline' }, e.headline));
  if (e.details.length) el.append(h('ul', { class: 'details' }, ...e.details.map((d) => h('li', {}, d))));
  if (e.tip) el.append(h('p', { class: 'lesson' }, h('span', { class: 'lesson-label' }, 'Tip'), e.tip));

  if (e.betterLineSan?.length) {
    el.append(
      h('p', { class: 'line' }, h('span', { class: 'line-label' }, 'Better'), formatLine(p.fenBefore, e.betterLineSan)),
    );
  }
  if (e.pvSan.length) {
    el.append(
      h('p', { class: 'line' }, h('span', { class: 'line-label' }, 'Engine line'), formatLine(p.fenAfter, e.pvSan)),
    );
  }
  if (v.onTogglePreview) {
    el.append(
      h('button', { type: 'button', class: 'btn small', onclick: v.onTogglePreview, 'aria-pressed': v.previewOn ? 'true' : 'false' },
        v.previewOn ? 'Back to the game position' : 'Show the better move on the board'),
    );
  }
}

// ---------------------------------------------------------------- hints

export interface HintView {
  /** Hint steps revealed so far (empty = none asked yet). */
  steps: HintStep[];
  /** Waiting for the coach's analysis of this position. */
  pending: boolean;
}

export function renderHint(el: HTMLElement, v: HintView): void {
  el.replaceChildren();
  el.hidden = !v.pending && v.steps.length === 0;
  if (v.pending) {
    el.append(h('p', { class: 'muted' }, 'Looking for a hint…'));
    return;
  }
  const labels = ['Idea', 'Piece', 'Move'];
  for (const s of v.steps) {
    el.append(h('p', { class: 'hint-step' }, h('span', { class: 'hint-label' }, labels[s.level - 1]), s.text));
  }
}

// ---------------------------------------------------------------- tips

export interface TipsView {
  hidden: boolean;
  tactics: Tip[];
  strategy: Tip[];
  focused: Tip | null;
  onSelect: (tip: Tip) => void;
}

const sameTip = (a: Tip | null, b: Tip) => !!a && a.kind === b.kind && a.title === b.title && a.text === b.text;

export function renderTips(el: HTMLElement, v: TipsView): void {
  el.replaceChildren();
  if (v.hidden) {
    el.append(h('p', { class: 'muted' }, "Tips are hidden while you play. Use Hint if you're stuck."));
    return;
  }
  const group = (title: string, tips: Tip[], empty: string) => {
    const items = tips.map((t) =>
      h(
        'button',
        {
          type: 'button',
          class: `tip tip-${t.kind}${sameTip(v.focused, t) ? ' focused' : ''}`,
          'aria-pressed': sameTip(v.focused, t) ? 'true' : 'false',
          title: t.squares.length ? 'Show on the board' : '',
          onclick: () => v.onSelect(t),
        },
        h('strong', {}, t.title),
        ' ',
        t.text,
      ),
    );
    el.append(
      h('h3', {}, title),
      items.length ? h('div', { class: 'tip-list' }, ...items) : h('p', { class: 'muted small' }, empty),
    );
  };
  group('Tactics', v.tactics, 'Nothing tactical right now. Still check every capture and check before you move.');
  group('Strategy', v.strategy, '');
}
