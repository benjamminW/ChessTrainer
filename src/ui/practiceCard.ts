import { GOAL_LABELS, type GoalVerdict, type PracticeOrigin } from '../game/practice';
import { h } from './panel';

export interface PracticeView {
  origin: PracticeOrigin;
  /** null while the game is still going. */
  result: GoalVerdict | null;
  /** Moves still waiting for the coach's analysis (the comparison fills in as they finish). */
  pending: number;
  /** Your winning chance (0–100) at the start and after each ply: this game, and the original game from the same position. */
  mine: (number | null)[];
  original: (number | null)[];
  reviewOpen: boolean;
}

const W = 300;
const H = 90;

/** Two lines of your winning chances: the original game (dashed) and this one. */
function comparison(mine: (number | null)[], original: (number | null)[]): HTMLElement {
  const n = Math.max(mine.length, original.length, 2) - 1;
  const x = (i: number) => (i / n) * W;
  const y = (w: number) => H - (w / 100) * H;
  const path = (pts: (number | null)[]) =>
    pts.map((w, i) => (w === null ? null : `${x(i).toFixed(1)},${y(w).toFixed(1)}`)).filter(Boolean).join(' ');
  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Your winning chances, this game against the original">
    <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" class="pc-mid"/>
    <polyline points="${path(original)}" class="pc-original"/>
    <polyline points="${path(mine)}" class="pc-mine"/>
  </svg>`;
  const box = h('div', { class: 'pc-graph' });
  box.innerHTML = svg;
  return h('div', {},
    box,
    h('p', { class: 'muted small pc-legend' },
      h('span', { class: 'pc-key mine' }), ' This game  ',
      h('span', { class: 'pc-key original' }), ' Original game · your winning chances, 50% line in the middle'));
}

export function renderPracticeCard(el: HTMLElement, v: PracticeView | null, on: { back: () => void; again: () => void; review: () => void }): void {
  el.hidden = !v;
  if (!v) return;
  const o = v.origin;
  const btn = (label: string, fn: () => void, primary = false) => h('button', { type: 'button', class: `btn${primary ? ' primary' : ''}`, onclick: fn }, label);
  el.replaceChildren(
    h('h2', {}, o.retry ? 'Trying this position again' : 'Playing from a review'),
    h('p', { class: 'small' }, `From ${o.label}. Goal: `, h('strong', {}, GOAL_LABELS[o.goal]), '.'),
  );
  if (v.result) {
    const mark = v.result.met === null ? '' : v.result.met ? '✓ ' : '✗ ';
    el.append(h('p', { class: `status pc-verdict${v.result.met === true ? ' good' : v.result.met === false ? ' bad' : ''}` }, mark + v.result.text));
    el.append(comparison(v.mine, v.original));
    if (v.pending) el.append(h('p', { class: 'muted small' }, `Analyzing ${v.pending} more move${v.pending === 1 ? '' : 's'}…`));
  }
  el.append(h('div', { class: 'controls' },
    btn('Back to review', on.back, !v.result),
    v.result && !v.reviewOpen ? btn('Review this game', on.review, true) : null,
    v.result ? btn('Try again', on.again) : null,
  ));
}
