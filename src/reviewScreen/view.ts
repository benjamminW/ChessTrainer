/** Rendering for the shared review screen. */
import { Chess } from 'chess.js';
import { CLASS_INFO, classSlug, isBad } from '../coach/classes';
import { mateIn } from '../coach/classify';
import { lineToSan } from '../coach/facts';
import { formatEval, formatLine, whiteShare } from '../coach/format';
import { label as plyLabel } from '../coach/gameReview';
import { describeIdea } from '../coach/ruleBased';
import { CLASS_ORDER } from '../coach/classes';
import { ESTIMATE_CONFIG, type RatingEstimate } from '../coach/estimate';
import type { ExcludeReason } from '../coach/ratingMoves';
import type { Classification, PlyRecord } from '../types';
import { CLASS_COLOR, classIcon } from '../ui/classIcons';
import { h } from '../ui/panel';
import type { ReviewScreen } from './controller';

const pct = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${Math.round(x)}`);

/** "+0.35", "M3", "M−2" — the graph and coach line use M-style mate labels. */
export function evalLabel(cpWhite: number): string {
  const m = mateIn(cpWhite);
  if (m === null) return formatEval(cpWhite);
  if (m === 0) return 'Mate';
  return m > 0 ? `M${m}` : `M−${-m}`;
}

export interface ScreenViewOptions {
  /** Extra buttons on each of your key moments (e.g. Play from here, Save as puzzle). */
  momentActions?: (index: number) => (HTMLElement | null)[];
  /** Extra sections appended at the end (e.g. clock use). */
  extras?: HTMLElement[];
  /** Shown above the summary (e.g. a back link). */
  before?: HTMLElement[];
  /** "Play from here" from a review step (plies applied); `retry` = just before one of your blunders. */
  playFrom?: (step: number, retry: boolean) => void;
}

// ---------------------------------------------------------------- summary

function summaryCard(s: ReviewScreen): HTMLElement {
  const r = s.review();
  const meta = s.model.meta;
  const me = s.user;
  const opp = me === 'w' ? 'b' : 'w';
  const name = (c: 'w' | 'b') => (c === 'w' ? meta.white : meta.black);
  const progress = s.model.progress;

  const body = h('div', { class: 'rs-summary-body' });
  body.append(
    h('p', { class: 'rs-result' }, meta.resultText),
    h('p', { class: 'muted small' }, [meta.timeControl, meta.date].filter(Boolean).join(' · '), meta.url ? ' · ' : '', meta.url ? h('a', { href: meta.url, target: '_blank', rel: 'noopener' }, 'View the game') : null),
  );
  if (progress) {
    body.append(
      h('div', { class: 'walk-progress', 'aria-hidden': 'true' }, h('span', { style: `width:${(progress.done / Math.max(1, progress.total)) * 100}%` })),
      h('p', { class: 'muted small' }, `Analyzing… ${progress.done} of ${progress.total}. You can step through the moves already analyzed; the summary fills in when it's done.`),
    );
  }

  // Players with accuracy and estimated rating
  const player = (c: 'w' | 'b', who: string) => {
    const st = r.stats[c];
    const est = st.rating;
    return h('div', { class: 'rs-player' },
      h('div', { class: 'rs-player-name' }, h('span', { class: `rv-color ${c}` }), who, name(c).rating ? h('span', { class: 'muted small' }, ` ${name(c).rating}`) : null),
      h('div', { class: 'rs-acc' }, progress ? '…' : pct(st.accuracy), h('span', { class: 'rs-acc-label' }, 'accuracy')),
      ratingBlock(progress || !est ? null : est),
    );
  };
  body.append(h('div', { class: 'rs-players' }, player(me, 'You'), player(opp, me === 'w' ? meta.black.name : meta.white.name)));
  body.append(h('p', { class: 'muted small rs-note' },
    'Game rating: estimated from this game\'s move quality. Not a real rating. ',
    r.ratingRecalculated ? h('strong', {}, 'Recalculated with the updated method (earlier versions read too high). ') : null,
    "Accuracy and game rating are this app's own estimates (method in the README) and won't match other sites' numbers.",
    meta.externalAccuracy ? ` ${meta.externalAccuracy.source}'s own figures: you ${meta.externalAccuracy.you}, opponent ${meta.externalAccuracy.opponent}.` : ''));

  // Class counts, two columns
  const rows = CLASS_ORDER.map((c) =>
    h('tr', {},
      h('td', { class: 'rs-n' }, String(r.stats[me].counts[c])),
      h('th', { scope: 'row' }, classIcon(c, 18), h('span', {}, c)),
      h('td', { class: 'rs-n' }, String(r.stats[opp].counts[c])),
    ));
  body.append(h('table', { class: 'rs-counts' },
    h('thead', {}, h('tr', {}, h('th', {}, 'You'), h('th', {}, ''), h('th', {}, 'Opp.'))),
    h('tbody', {}, ...rows)));

  // Opening
  const o = meta.opening;
  if (o) {
    const left = o.leftAt === null ? 'The game never left known theory.'
      : `${o.leftBy === me ? 'You' : 'Your opponent'} left book with ${plyLabel({ ...s.plies[o.leftAt], by: 'user' })}${o.bookMoves.length ? ` (book: ${o.bookMoves.join(', ')})` : ''}.`;
    body.append(h('p', { class: 'small' }, h('strong', {}, `${o.name}`), ` (${o.eco}). `, left));
  }

  // Phase grades
  const phaseRow = (c: 'w' | 'b') => Object.fromEntries(r.stats[c].phases.map((p) => [p.phase, p]));
  const mine = phaseRow(me);
  const theirs = phaseRow(opp);
  const phases = (['opening', 'middlegame', 'endgame'] as const).filter((p) => mine[p] || theirs[p]);
  if (phases.length && !progress) {
    const grade = (p?: { grade: string | null; avgDrop: number | null }) =>
      p?.grade ? h('span', { class: `rs-grade g-${p.grade.toLowerCase()}`, title: `Lost ${p.avgDrop!.toFixed(1)} points of winning chance per move` }, p.grade) : h('span', { class: 'muted' }, '–');
    body.append(h('table', { class: 'rs-phases' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Phase'), h('th', {}, 'You'), h('th', {}, 'Opp.'))),
      h('tbody', {}, ...phases.map((p) => h('tr', {}, h('th', { scope: 'row' }, p[0].toUpperCase() + p.slice(1)), h('td', {}, grade(mine[p])), h('td', {}, grade(theirs[p])))))));
  }

  const d = s.model.deeper;
  if (d) body.append(h('button', { type: 'button', class: 'btn small', onclick: d.run, disabled: d.running }, d.running ? 'Deeper analysis running…' : d.label));

  s.summaryOpen ??= !window.matchMedia('(max-width: 860px)').matches;
  const details = h('details', { class: 'rs-summary', open: s.summaryOpen }, h('summary', {}, 'Game summary'), body);
  details.addEventListener('toggle', () => (s.summaryOpen = (details as HTMLDetailsElement).open));
  return details;
}

// ---------------------------------------------------------------- eval graph

function graph(s: ReviewScreen): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const plies = s.plies;
  const evals: (number | null)[] = [plies[0]?.review?.evalBefore ?? 0, ...plies.map((p) => p.review?.evalAfter ?? null)];
  const n = Math.max(1, evals.length - 1);
  const W = 300;
  const H = 72;
  const x = (i: number) => (i / n) * W;
  // Mates clamp to the edges via whiteShare; nothing else needs special casing.
  const y = (cp: number) => (1 - whiteShare(cp)) * H;
  const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'eval-graph rs-graph', role: 'img', preserveAspectRatio: 'none' });
  svg.setAttribute('aria-label', 'Evaluation over the game. White is above the middle line. Click to jump to a position.');
  let last = evals[0] ?? 0;
  const ys = evals.map((e) => {
    if (e !== null) last = e;
    return y(last);
  });
  svg.append(
    el('rect', { x: 0, y: 0, width: W, height: H, class: 'g-black' }),
    el('polygon', { points: `0,${H} ${ys.map((v, i) => `${x(i).toFixed(1)},${v.toFixed(1)}`).join(' ')} ${W},${H}`, class: 'g-white' }),
    el('line', { x1: 0, y1: H / 2, x2: W, y2: H / 2, class: 'g-mid' }),
  );
  // Hover targets with M-style labels
  for (let i = 0; i < evals.length; i++) {
    const r = el('rect', { x: x(i) - W / n / 2, y: 0, width: W / n, height: H, fill: 'transparent' });
    const t = el('title', {});
    const p = i > 0 ? plies[i - 1] : null;
    t.textContent = `${p ? plyLabel(p) : 'Start'}: ${evals[i] === null ? 'not analyzed yet' : evalLabel(evals[i]!)}${p?.review ? ` (${p.review.classification})` : ''}`;
    r.append(t);
    svg.append(r);
  }
  // Dots for notable classes, both sides
  const DOTS: Classification[] = ['Brilliant', 'Great', 'Inaccuracy', 'Mistake', 'Miss', 'Blunder'];
  plies.forEach((p, i) => {
    const c = p.review?.classification;
    if (!c || !DOTS.includes(c)) return;
    svg.append(el('circle', { cx: x(i + 1), cy: ys[i + 1], r: 3.4, fill: CLASS_COLOR[c], class: 'g-dot' }));
  });
  // Current position marker
  if (s.step > 0 || plies.length) {
    svg.append(el('line', { x1: x(s.step), y1: 0, x2: x(s.step), y2: H, class: 'g-cursor' }));
    svg.append(el('circle', { cx: x(s.step), cy: ys[s.step] ?? H / 2, r: 4.2, class: 'g-marker' }));
  }
  svg.addEventListener('click', (e) => {
    const box = svg.getBoundingClientRect();
    s.goTo(Math.round(((e.clientX - box.left) / box.width) * n));
  });
  return svg;
}

// ---------------------------------------------------------------- coach line (under the board)

function moveText(p: PlyRecord): string {
  return plyLabel(p);
}

export function renderCoachLine(el: HTMLElement, s: ReviewScreen): void {
  el.replaceChildren();
  el.hidden = false;
  const m = s.mode;

  if (m.kind === 'retry') {
    const p = s.plies[m.index];
    el.append(h('p', { class: 'rs-coach-head' }, `Retry: find a better move than ${p.san}.`));
    if (m.busy) el.append(h('p', { class: 'muted small' }, 'Checking your move…'));
    else if (!m.verdict) el.append(h('p', { class: 'muted small' }, `It's ${p.color === 'w' ? 'White' : 'Black'} to move. Play a move on the board.`));
    else {
      const v = m.verdict;
      const good = !isBad(v.cls);
      el.append(h('p', { class: `rs-coach-head ${good ? 'good' : 'bad'}` }, classIcon(v.cls, 20),
        ` ${v.san} is ${CLASS_INFO[v.cls].phrase}${good ? '!' : '.'}`,
        !good && v.bestSan ? ` Best was ${v.bestSan}.` : '',
        v.drop >= 0.5 ? h('span', { class: 'muted small' }, ` (−${v.drop.toFixed(1)}% winning chance)`) : null));
    }
    el.append(h('div', { class: 'controls' },
      m.verdict ? h('button', { type: 'button', class: 'btn small primary', onclick: () => s.retryAgain() }, 'Try again') : null,
      h('button', { type: 'button', class: 'btn small', onclick: () => void s.showBestLine(m.index) }, 'Show best'),
      h('button', { type: 'button', class: 'btn small', onclick: () => s.exitRetry() }, 'Back to the game'),
    ));
    return;
  }

  if (m.kind === 'line') {
    const sans = lineToSan(m.startFen, m.moves);
    el.append(
      h('p', { class: 'rs-coach-head' }, m.label),
      h('p', { class: 'line' }, formatLine(m.startFen, sans.slice(0, Math.max(m.k, 1))), m.k < sans.length ? h('span', { class: 'muted' }, ` … ${sans.slice(m.k).join(' ')}`) : null),
      h('div', { class: 'controls' },
        h('button', { type: 'button', class: 'btn small', onclick: () => s.lineStep(-1), disabled: m.k === 0, 'aria-label': 'Back one move' }, '◀'),
        h('button', { type: 'button', class: 'btn small', onclick: () => s.lineStep(1), disabled: m.k >= m.moves.length, 'aria-label': 'Forward one move' }, '▶'),
        h('button', { type: 'button', class: 'btn small primary', onclick: () => s.exitLine() }, 'Back to the game'),
      ),
    );
    return;
  }

  const i = s.index;
  if (i === null) {
    el.append(h('p', { class: 'muted small' }, 'Start position. Step through with ▶ or the → key, or jump to a key moment.'));
    return;
  }
  const p = s.plies[i];
  const r = p.review;
  if (!r) {
    el.append(h('p', { class: 'muted small' }, `${moveText(p)}: still being analyzed…`));
    return;
  }
  const cls = r.classification;
  const who = p.color === s.user ? '' : ` (${p.color === 'w' ? 'White' : 'Black'})`;
  const bad = isBad(cls);
  const notBest = r.bestSan && r.bestUci !== p.uci && !['Book', 'Best', 'Brilliant', 'Great'].includes(cls);
  el.append(h('p', { class: `rs-coach-head ${bad ? 'bad' : 'good'}` },
    classIcon(cls, 20),
    ` ${moveText(p)}${who} is ${CLASS_INFO[cls].phrase}${cls === 'Brilliant' ? '!' : '.'}`,
    notBest ? ` Best was ${r.bestSan}.` : '',
    // Eval change: what the best move would have kept → what the move played left.
    h('span', { class: 'rs-eval' }, ` ${evalLabel(r.evalBefore)} → ${evalLabel(r.evalAfter)}`)));

  const e = r.explanation;
  const lines: string[] = [];
  if (cls === 'Book' && s.model.meta.opening) lines.push(`Opening theory: ${s.model.meta.opening.name}.`);
  else if (bad && e?.details.length) lines.push(...e.details.slice(0, 3));
  else {
    const idea = e?.headline && !/^(Best|Good) move\.$/.test(e.headline) ? e.headline : describeIdea(p.fenBefore, p.uci, s.user);
    if (idea) lines.push(idea);
  }
  if (cls === 'Brilliant') lines.push('It gives up material, and the engine confirms the sacrifice holds.');
  if (cls === 'Great') lines.push('This was the only move that kept the position together.');
  if (lines.length) el.append(h('ul', { class: 'details' }, ...lines.map((l) => h('li', {}, l))));
  if (bad && e?.tip) el.append(h('p', { class: 'lesson' }, h('span', { class: 'lesson-label' }, 'Tip'), e.tip));

  if (s.canRetry(i) || s.canShowBetter(i)) {
    el.append(h('div', { class: 'controls' },
      s.canRetry(i) ? h('button', { type: 'button', class: 'btn small primary', onclick: () => s.retry(i) }, 'Retry') : null,
      h('button', { type: 'button', class: 'btn small', onclick: () => void s.showBestLine(i) }, 'Show best'),
      s.canShowBetter(i) ? h('button', { type: 'button', class: 'btn small', onclick: () => s.toggleBetter(), 'aria-pressed': s.showBetter ? 'true' : 'false' }, s.showBetter ? 'Show the game position' : 'Show the arrow') : null,
    ));
  }
}

/** The estimated rating range, with the counted moves and depth behind it. */
function ratingBlock(est: RatingEstimate | null): HTMLElement {
  const el = h('div', { class: 'rs-est' });
  if (!est) {
    el.append(h('span', { class: 'muted' }, 'Game rating: …'));
    return el;
  }
  const left = Object.values(est.excluded).reduce((a, b) => a + b, 0);
  const why = Object.entries(est.excluded).filter(([, n]) => n).map(([k, n]) => `${n} ${EXCLUDE_NAMES[k as ExcludeReason]}`).join(', ');
  el.title = [
    "Estimated from how much winning chance each counted move gave away (Lichess rating scale). Not a real rating.",
    left ? `Left out: ${why}.` : '',
    est.shrunk ? 'Pulled toward the rating in the game header, more so in short games.' : '',
    est.capped ? `Capped at ${ESTIMATE_CONFIG.capMargin} above the header rating (fewer than ${ESTIMATE_CONFIG.capUntilMoves} counted moves).` : '',
    est.clamped ? `Limited to the app's range, ${ESTIMATE_CONFIG.floor}–${ESTIMATE_CONFIG.ceiling}.` : '',
  ].filter(Boolean).join(' ');
  const depth = est.depth === null ? 'depth unknown' : `depth ${est.depth}`;
  const meta = `${est.counted} move${est.counted === 1 ? '' : 's'} counted · ${depth}`;
  if (est.status === 'few') {
    el.append(h('span', {}, 'Not enough moves to estimate'), h('span', { class: 'muted small rs-est-meta' }, ` ${meta}`));
    return el;
  }
  const top = est.high >= ESTIMATE_CONFIG.ceiling ? `${est.high}+` : String(est.high);
  el.append(
    h('span', {}, `Game rating: about ${est.low} to ${top}`),
    h('span', { class: 'muted small rs-est-meta' }, ` ${meta}`),
  );
  if (est.lowConfidence) el.append(h('span', { class: 'rs-lowconf', title: `Analysis below depth ${ESTIMATE_CONFIG.minDepth} misses tactics, so mistakes look smaller than they are. Use the deeper analysis to firm it up.` }, 'low confidence'));
  return el;
}

const EXCLUDE_NAMES: Record<ExcludeReason, string> = {
  book: 'book',
  forced: 'forced',
  allEqual: 'all-moves-equal',
  recapture: 'recapture',
  decided: 'after the game was decided',
};

// ---------------------------------------------------------------- navigation, move list, key moments, lines

function nav(s: ReviewScreen): HTMLElement {
  const n = s.plies.length;
  const b = (label: string, aria: string, on: () => void, disabled: boolean) =>
    h('button', { type: 'button', class: 'btn small', onclick: on, disabled, 'aria-label': aria, title: aria }, label);
  const { order } = s.keyMoments();
  const cur = s.index ?? -1;
  return h('div', { class: 'controls rs-nav' },
    b('⏮', 'First position', () => s.goTo(0), s.step === 0),
    b('◀', 'Previous move (←)', () => s.prev(), s.step === 0),
    b('▶', 'Next move (→)', () => s.next(), s.step >= n),
    b('⏭', 'Last position', () => s.goTo(n), s.step >= n),
    b('⇤ Key', 'Previous key moment', () => s.jumpKey(-1), !order.some((i) => i < cur)),
    b('Key ⇥', 'Next key moment', () => s.jumpKey(1), !order.some((i) => i > cur)),
  );
}

/** Your blunder: practice from just before it ("Try this position again"); otherwise from the position before the move. */
function practiceButton(s: ReviewScreen, index: number, o: ScreenViewOptions): HTMLElement | null {
  if (!o.playFrom) return null;
  const p = s.plies[index];
  const retry = p.by === 'user' && p.review?.classification === 'Blunder';
  return h('button', { type: 'button', class: 'btn small', onclick: () => o.playFrom!(index, retry), title: 'Play this position against the coach' },
    retry ? 'Try this position again' : 'Play from here');
}

/** Practice buttons for the position on the board. */
function practiceRow(s: ReviewScreen, o: ScreenViewOptions): HTMLElement | null {
  if (!o.playFrom || s.mode.kind !== 'game') return null;
  const step = s.step;
  const fen = step === 0 ? s.model.startFen : s.plies[step - 1].fenAfter;
  const over = new Chess(fen).isGameOver();
  const last = step > 0 ? s.plies[step - 1] : null;
  const blunder = !!last && last.by === 'user' && last.review?.classification === 'Blunder';
  return h('div', { class: 'controls rs-practice' },
    h('button', { type: 'button', class: 'btn small', onclick: () => o.playFrom!(step, false), disabled: over, title: over ? 'The game is over in this position' : 'Play this position against the coach' }, 'Play from here'),
    blunder ? h('button', { type: 'button', class: 'btn small', onclick: () => o.playFrom!(step - 1, true), title: 'Play the position before your blunder again' }, 'Try this position again') : null,
  );
}

function moveList(s: ReviewScreen): HTMLElement {
  const box = h('div', { class: 'rs-moves moves', role: 'list' });
  let row: HTMLElement | null = null;
  s.plies.forEach((p, i) => {
    if (p.color === 'w' || !row) {
      row = h('div', { class: 'move-row' }, h('span', { class: 'move-no' }, `${p.fenBefore.split(' ')[5]}.`));
      box.append(row);
      if (p.color === 'b') row.append(h('span', { class: 'move-cell empty' }, '…'));
    }
    const c = p.review?.classification;
    row.append(h('button', {
      type: 'button',
      role: 'listitem',
      class: `move-cell${i + 1 === s.step ? ' current' : ''}${c ? ` cls-${classSlug(c)}` : ''}`,
      'aria-current': i + 1 === s.step ? 'true' : false,
      title: c ?? 'Not analyzed yet',
      onclick: () => s.goTo(i + 1),
    }, c ? classIcon(c, 14) : h('span', { class: 'cls-icon pending' }), p.san));
  });
  queueMicrotask(() => {
    const cur = box.querySelector<HTMLElement>('.current');
    if (cur && (cur.offsetTop < box.scrollTop || cur.offsetTop + cur.offsetHeight > box.scrollTop + box.clientHeight)) box.scrollTop = cur.offsetTop - box.clientHeight / 2;
  });
  return box;
}

function keyMoments(s: ReviewScreen, o: ScreenViewOptions): HTMLElement {
  const { you, opponent } = s.keyMoments();
  const item = (k: { index: number; cls: Classification; delta: number }, mine: boolean) => {
    const p = s.plies[k.index];
    return h('li', { class: 'rs-km' },
      h('button', { type: 'button', class: 'link', onclick: () => s.showMoment(k.index) }, classIcon(k.cls, 14), ` ${plyLabel(p)}`),
      h('span', { class: 'muted small' }, ` ${k.cls}${k.delta < -0.5 ? `, −${Math.round(-k.delta)}%` : ''}`),
      mine && (o.momentActions || o.playFrom)
        ? h('span', { class: 'rs-km-actions' }, ...[practiceButton(s, k.index, o), ...(o.momentActions?.(k.index) ?? [])].filter((x): x is HTMLElement => !!x))
        : null,
    );
  };
  return h('div', { class: 'rs-key' },
    h('h3', {}, 'Key moments'),
    h('div', { class: 'rs-key-cols' },
      h('div', {}, h('p', { class: 'small' }, h('strong', {}, 'You')), you.length ? h('ul', {}, ...you.map((k) => item(k, true))) : h('p', { class: 'muted small' }, 'No big swings.')),
      h('div', {}, h('p', { class: 'small' }, h('strong', {}, 'Opponent')), opponent.length ? h('ul', {}, ...opponent.map((k) => item(k, false))) : h('p', { class: 'muted small' }, 'No big swings.')),
    ));
}

function linesPanel(s: ReviewScreen, resolved: (fen: string) => import('../engine/uci').Analysis | undefined, request: (fen: string) => void): HTMLElement {
  const details = h('details', { class: 'rs-lines', open: s.linesOpen }, h('summary', {}, 'Engine lines'));
  details.addEventListener('toggle', () => {
    s.linesOpen = (details as HTMLDetailsElement).open;
    if (s.linesOpen) request(s.currentFen());
  });
  if (s.linesOpen) {
    const fen = s.currentFen();
    const a = resolved(fen);
    if (!a) {
      request(fen);
      details.append(h('p', { class: 'muted small' }, 'Thinking…'));
    } else if (!a.lines.length) details.append(h('p', { class: 'muted small' }, 'No moves in this position.'));
    else {
      const turnSign = fen.split(' ')[1] === 'w' ? 1 : -1;
      details.append(h('ol', { class: 'rs-line-list' }, ...a.lines.slice(0, 3).map((l, i) => {
        const san = lineToSan(fen, l.pv, 6);
        return h('li', {}, h('button', { type: 'button', class: 'rs-line', onclick: () => s.previewLine(fen, l.pv.slice(0, 10), `Engine line ${i + 1}`), title: 'Preview this line on the board' },
          h('span', { class: 'rs-line-eval' }, evalLabel(l.cp * turnSign)), ' ', formatLine(fen, san)));
      })));
      details.append(h('p', { class: 'muted small' }, `Depth ${a.depth}. Click a line to step through it on the board.`));
    }
  }
  return details;
}

/** Renders the review panel (summary, nav, move list, key moments, lines) and the coach line under the board. */
export function renderReviewScreen(
  panel: HTMLElement,
  coachLine: HTMLElement,
  s: ReviewScreen,
  resolved: (fen: string) => import('../engine/uci').Analysis | undefined,
  requestAnalysis: (fen: string) => void,
  o: ScreenViewOptions = {},
): void {
  panel.replaceChildren(...(o.before ?? []), summaryCard(s), graph(s), nav(s), ...[practiceRow(s, o)].filter((x): x is HTMLElement => !!x), moveList(s), keyMoments(s, o), linesPanel(s, resolved, requestAnalysis), ...(o.extras ?? []));
  renderCoachLine(coachLine, s);
}
