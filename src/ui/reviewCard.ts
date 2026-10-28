import { CLASSES, label, type GameReview, type KeyMoment } from '../coach/gameReview';
import { formatEval, whiteShare } from '../coach/format';
import type { Classification, Color, GameResult } from '../types';
import { classSlug, h } from './panel';

export interface ReviewCardView {
  review: GameReview;
  result: GameResult;
  userColor: Color;
  elo: number;
  /** Ply count currently shown on the board (cursor), to mark it on the graph. */
  cursor: number;
  onClose: () => void;
  /** Jump to the position after ply `index` with the better move shown. */
  onShow: (index: number) => void;
  /** Jump to the position before ply `index` to try a better move. */
  onRetry: (index: number) => void;
  /** Jump to a ply count from the graph. */
  onSeek: (n: number) => void;
}

const SHORT: Record<Classification, string> = {
  Best: 'Best',
  Good: 'Good',
  Inaccuracy: 'Inacc.',
  Mistake: 'Mistake',
  Blunder: 'Blunder',
};

const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x)}%`);

function resultLine(r: GameResult, user: Color): string {
  if (r.score === '1/2-1/2') return `Draw by ${r.reason}.`;
  const youWon = (r.score === '1-0') === (user === 'w');
  return `${youWon ? 'You won' : 'The coach won'} by ${r.reason}.`;
}

/** Eval graph: White's share over the game, with markers on the user's mistakes. */
function evalGraph(v: ReviewCardView): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const evals = v.review.evals;
  const n = Math.max(1, evals.length - 1);
  const W = 300;
  const H = 70;
  const x = (i: number) => (i / n) * W;
  const y = (cp: number) => (1 - whiteShare(cp)) * H;

  const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
    return e;
  };

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'eval-graph', role: 'img', preserveAspectRatio: 'none' });
  svg.setAttribute('aria-label', 'Evaluation over the game. Click to jump to a move.');

  // Carry the last known eval through moves still being analysed.
  let last = evals[0] ?? 0;
  const pts = evals.map((e, i) => {
    if (e !== null) last = e;
    return `${x(i).toFixed(1)},${y(last).toFixed(1)}`;
  });
  svg.append(
    el('rect', { x: 0, y: 0, width: W, height: H, class: 'g-black' }),
    el('polygon', { points: `0,${H} ${pts.join(' ')} ${W},${H}`, class: 'g-white' }),
    el('line', { x1: 0, y1: H / 2, x2: W, y2: H / 2, class: 'g-mid' }),
  );
  if (v.cursor > 0) svg.append(el('line', { x1: x(v.cursor), y1: 0, x2: x(v.cursor), y2: H, class: 'g-cursor' }));
  for (const m of v.review.moments) {
    const cp = evals[m.index + 1] ?? 0;
    svg.append(el('circle', { cx: x(m.index + 1), cy: y(cp), r: 3.2, class: `g-dot cls-${classSlug(m.classification)}` }));
  }
  svg.addEventListener('click', (e) => {
    const box = svg.getBoundingClientRect();
    v.onSeek(Math.round(((e.clientX - box.left) / box.width) * n));
  });
  return svg;
}

function momentItem(m: KeyMoment, v: ReviewCardView): HTMLElement {
  const tags: HTMLElement[] = [];
  if (m.turningPoint) tags.push(h('span', { class: 'tag tag-turn' }, 'Turning point'));
  if (m.missedChance) tags.push(h('span', { class: 'tag tag-missed' }, 'Missed chance'));
  return h(
    'li',
    { class: 'moment' },
    h(
      'div',
      { class: 'moment-head' },
      h('span', { class: 'explain-move' }, label(m.ply)),
      h('span', { class: `badge cls-${classSlug(m.classification)}` }, m.classification),
      ...tags,
    ),
    m.bestSan ? h('p', { class: 'moment-better' }, `Better was ${m.bestSan} (${m.bestEval}).`) : null,
    h('p', { class: 'moment-reason' }, m.reason),
    m.tip ? h('p', { class: 'moment-tip' }, h('span', { class: 'lesson-label' }, 'Tip'), m.tip) : null,
    h(
      'div',
      { class: 'moment-actions' },
      h('button', { type: 'button', class: 'btn small', onclick: () => v.onShow(m.index) }, 'Show on board'),
      h('button', { type: 'button', class: 'btn small', onclick: () => v.onRetry(m.index) }, 'Try it again'),
    ),
  );
}

export function renderReviewCard(el: HTMLElement, v: ReviewCardView): void {
  el.replaceChildren();
  const { review: r } = v;
  const you = r.stats[v.userColor];
  const coach = r.stats[v.userColor === 'w' ? 'b' : 'w'];

  el.append(
    h(
      'div',
      { class: 'review-head' },
      h('h2', {}, 'Game review'),
      h('button', { type: 'button', class: 'btn small', onclick: v.onClose, 'aria-label': 'Close game review' }, 'Close'),
    ),
    h('p', { class: 'status' }, resultLine(v.result, v.userColor)),
  );
  if (r.pending > 0) {
    el.append(h('p', { class: 'muted small' }, `Analyzing ${r.pending} more move${r.pending === 1 ? '' : 's'}… the review fills in as they finish.`));
  }

  // Accuracy and counts
  const row = (name: string, s: typeof you) =>
    h(
      'tr',
      {},
      h('th', { scope: 'row' }, name),
      h('td', { class: 'acc' }, pct(s.accuracy)),
      ...CLASSES.map((c) => h('td', { class: s.counts[c] ? `cnt cls-${classSlug(c)}` : 'cnt zero' }, String(s.counts[c]))),
    );
  el.append(
    h(
      'table',
      { class: 'review-table' },
      h(
        'thead',
        {},
        h('tr', {}, h('th', {}, ''), h('th', {}, 'Accuracy'), ...CLASSES.map((c) => h('th', { title: c }, SHORT[c]))),
      ),
      h('tbody', {}, row('You', you), row(`Coach (${v.elo})`, coach)),
    ),
  );

  el.append(evalGraph(v));

  if (r.summary.length) el.append(h('ul', { class: 'review-summary' }, ...r.summary.map((s) => h('li', {}, s))));

  if (r.phases.length) {
    el.append(
      h(
        'div',
        { class: 'phases' },
        ...r.phases.map((p) =>
          h(
            'div',
            { class: 'phase' },
            h('span', { class: 'phase-name' }, p.phase[0].toUpperCase() + p.phase.slice(1)),
            h('span', { class: 'phase-bar' }, h('span', { style: `width:${Math.round(p.accuracy ?? 0)}%` })),
            h('span', { class: 'phase-acc' }, pct(p.accuracy)),
          ),
        ),
      ),
    );
  }

  el.append(h('h3', {}, r.moments.length ? 'Where you can improve' : 'Key moments'));
  if (r.moments.length === 0) {
    el.append(h('p', { class: 'muted' }, r.pending ? 'Nothing yet.' : 'No inaccuracies, mistakes or blunders to go over. Well played!'));
  } else {
    el.append(h('ol', { class: 'moments' }, ...r.moments.map((m) => momentItem(m, v))));
  }

  el.append(
    h(
      'p',
      { class: 'muted small' },
      `Final evaluation: ${formatEval(r.evals[r.evals.length - 1] ?? 0)}. Click the graph or a move to jump there.`,
    ),
  );
}
