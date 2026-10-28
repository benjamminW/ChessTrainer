import { formatLine } from '../coach/format';
import { winPercent, type KeyMoment } from '../coach/gameReview';
import type { Classification, Color, PlyRecord } from '../types';
import { classSlug, h, moveLabel } from './panel';

export const BAD_CLASSES: Classification[] = ['Inaccuracy', 'Mistake', 'Blunder'];

export interface WalkthroughView {
  plies: PlyRecord[];
  /** Index of the ply being explained. */
  step: number;
  userColor: Color;
  /** Key moments from the game review, for the Turning point / Missed chance tags. */
  moments: KeyMoment[];
  /** Board is showing the position before the move with the better-move arrows. */
  previewOn: boolean;
  onTogglePreview: () => void;
  onGo: (step: number) => void;
  onNextMistake: () => void;
  onTry: () => void;
  onExit: () => void;
}

const pct = (x: number) => `${Math.round(x)}%`;

/** The user's winning chances before and after a ply (from the stored White-POV evals). */
function chances(p: PlyRecord, user: Color): [number, number] | null {
  const r = p.review;
  if (!r) return null;
  const s = user === 'w' ? 1 : -1;
  return [winPercent(r.evalBefore * s), winPercent(r.evalAfter * s)];
}

export function nextMistake(plies: PlyRecord[], from: number, user: Color): number | null {
  for (let i = from + 1; i < plies.length; i++) {
    const p = plies[i];
    if (p.color === user && p.review && BAD_CLASSES.includes(p.review.classification)) return i;
  }
  return null;
}

/** A strip with one cell per move, colored by rating, to see and jump around the whole game. */
function timeline(v: WalkthroughView): HTMLElement {
  return h(
    'div',
    { class: 'timeline', role: 'list', 'aria-label': 'Moves in this game' },
    ...v.plies.map((p, i) => {
      const cls = p.review?.classification;
      const bad = cls && BAD_CLASSES.includes(cls);
      return h('button', {
        type: 'button',
        role: 'listitem',
        class: `tl ${p.color === v.userColor ? 'tl-you' : 'tl-coach'}${bad ? ` cls-${classSlug(cls)}` : ''}${i === v.step ? ' current' : ''}`,
        title: `${moveLabel(p)}${cls ? ` (${cls})` : ''}`,
        'aria-label': `${moveLabel(p)}${cls ? `, ${cls}` : ''}`,
        onclick: () => v.onGo(i),
      });
    }),
  );
}

export function renderWalkthrough(el: HTMLElement, v: WalkthroughView): void {
  el.replaceChildren();
  const p = v.plies[v.step];
  const total = v.plies.length;
  const r = p.review;
  const mine = p.color === v.userColor;
  const bad = !!r && BAD_CLASSES.includes(r.classification);
  const moment = v.moments.find((m) => m.index === v.step);
  const more = nextMistake(v.plies, v.step, v.userColor);

  el.append(
    h(
      'div',
      { class: 'review-head' },
      h('h2', {}, 'Move-by-move review'),
      h('button', { type: 'button', class: 'btn small', onclick: v.onExit }, 'Exit'),
    ),
    h('div', { class: 'walk-progress', 'aria-hidden': 'true' }, h('span', { style: `width:${((v.step + 1) / total) * 100}%` })),
    h('p', { class: 'muted small' }, `Move ${v.step + 1} of ${total}. ${mine ? 'Your move.' : "The coach's move."}`),
    timeline(v),
  );

  const head = h(
    'div',
    { class: 'explain-head walk-move' },
    h('span', { class: 'explain-move' }, moveLabel(p)),
    h('span', { class: 'who' }, mine ? 'You' : 'Coach'),
  );
  if (r) head.append(h('span', { class: `badge cls-${classSlug(r.classification)}` }, r.classification));
  if (moment?.turningPoint) head.append(h('span', { class: 'tag tag-turn' }, 'Turning point'));
  if (moment?.missedChance) head.append(h('span', { class: 'tag tag-missed' }, 'Missed chance'));
  el.append(head);

  if (!r) {
    el.append(h('p', { class: 'muted' }, 'The coach is still analyzing this move…'));
  } else {
    const e = r.explanation;
    const c = chances(p, v.userColor);
    if (mine && bad) {
      el.append(h('p', { class: 'walk-lead' }, `You played ${p.san}. Here's what you could have done better.`));
      if (c) el.append(h('p', { class: 'walk-chances' }, `Your winning chances: ${pct(c[0])} → ${pct(c[1])}`));
      if (r.bestSan) {
        el.append(h('p', { class: 'walk-better' }, h('span', { class: 'line-label' }, 'Better'), `${r.bestSan}`));
      }
      if (e.details.length) el.append(h('ul', { class: 'details' }, ...e.details.map((d) => h('li', {}, d))));
      if (e.betterLineSan?.length) {
        el.append(h('p', { class: 'line' }, h('span', { class: 'line-label' }, 'Best line'), formatLine(p.fenBefore, e.betterLineSan)));
      }
      if (e.tip) el.append(h('p', { class: 'lesson' }, h('span', { class: 'lesson-label' }, 'Tip'), e.tip));
      el.append(
        h(
          'div',
          { class: 'moment-actions' },
          h('button', { type: 'button', class: 'btn small', onclick: v.onTogglePreview, 'aria-pressed': v.previewOn ? 'true' : 'false' },
            v.previewOn ? 'Show the position after your move' : 'Show the better move'),
          h('button', { type: 'button', class: 'btn small', onclick: v.onTry }, 'Try it yourself'),
        ),
      );
    } else if (mine) {
      el.append(h('p', { class: 'walk-lead' }, r.classification === 'Best' ? `${p.san}: the best move. Nice.` : `${p.san}: a good move.`));
      // details[0] is the move's idea; details[1], if any, is "the engine slightly preferred …".
      if (e.details[0]) el.append(h('p', {}, e.details[0]));
      if (e.details[1]) el.append(h('p', { class: 'muted small' }, e.details[1]));
      if (c) el.append(h('p', { class: 'walk-chances' }, `Your winning chances: ${pct(c[1])}`));
    } else {
      el.append(h('p', { class: 'walk-lead' }, `The coach played ${p.san}. ${e.headline}`));
      if (bad) {
        el.append(h('p', {}, `That was a ${r.classification.toLowerCase()} by the coach. Watch for a chance to punish it on your next move.`));
        if (e.details.length) el.append(h('ul', { class: 'details' }, ...e.details.map((d) => h('li', {}, d))));
      }
      if (c) el.append(h('p', { class: 'walk-chances' }, `Your winning chances: ${pct(c[1])}`));
    }
    if (e.pvSan.length && !(mine && bad && v.previewOn)) {
      el.append(h('p', { class: 'line' }, h('span', { class: 'line-label' }, 'Engine line'), formatLine(p.fenAfter, e.pvSan)));
    }
  }

  const last = v.step === total - 1;
  el.append(
    h(
      'div',
      { class: 'walk-nav' },
      h('button', { type: 'button', class: 'btn', disabled: v.step === 0, onclick: () => v.onGo(v.step - 1) }, '◀ Previous'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => (last ? v.onExit() : v.onGo(v.step + 1)) }, last ? 'Finish' : 'Next ▶'),
      h('button', { type: 'button', class: 'btn', disabled: more === null, onclick: v.onNextMistake, title: 'Skip to your next inaccuracy, mistake or blunder' },
        more === null ? 'No more mistakes' : 'Next mistake ⏭'),
    ),
  );
  if (last) el.append(h('p', { class: 'muted small' }, "That's the end of the game. Finish to see the summary."));
}
