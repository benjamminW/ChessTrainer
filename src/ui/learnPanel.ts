import type { LearnMode } from '../learn/controller';
import { isComplete, lessonProgress, lessonShare } from '../learn/progress';
import { SECTIONS, lessonById, lessonsIn } from '../learn/registry';
import type { DrillStep, PracticeStep, TryStep } from '../learn/types';
import { h } from './panel';

const STEP_NAMES = { explain: 'Explain', try: 'Try', practice: 'Practice', drill: 'Drill' } as const;

const btn = (label: string, onclick: () => void, o: { primary?: boolean; disabled?: boolean; title?: string } = {}) =>
  h('button', { type: 'button', class: `btn${o.primary ? ' primary' : ''}`, onclick, disabled: !!o.disabled, title: o.title ?? '' }, label);

function bar(share: number): HTMLElement {
  return h('div', { class: 'lr-bar', role: 'progressbar', 'aria-valuenow': String(Math.round(share * 100)), 'aria-valuemin': '0', 'aria-valuemax': '100' },
    h('span', { style: `width:${Math.round(share * 100)}%` }));
}

function list(m: LearnMode): HTMLElement[] {
  const out: HTMLElement[] = [];
  const last = m.progress.lastOpened ? lessonById(m.progress.lastOpened) : null;
  if (last) {
    out.push(h('p', { class: 'small lr-resume' }, 'Last opened: ',
      h('button', { type: 'button', class: 'link', onclick: () => m.open(last.id) }, last.title)));
  }
  for (const s of SECTIONS) {
    const lessons = lessonsIn(s.id);
    const done = lessons.filter((l) => isComplete(m.progress, l)).length;
    const section = h('section', { class: 'lr-section' },
      h('div', { class: 'lr-section-head' }, h('h3', {}, s.title), h('span', { class: 'muted small' }, lessons.length ? `${done} of ${lessons.length} done` : 'Coming soon')),
      lessons.length ? bar(done / lessons.length) : h('span', {}),
      h('p', { class: 'muted small' }, s.blurb));
    if (lessons.length) {
      section.append(h('ul', { class: 'lr-lessons' }, ...lessons.map((l) => {
        const share = lessonShare(m.progress, l);
        const complete = isComplete(m.progress, l);
        return h('li', {},
          h('button', { type: 'button', class: `lr-lesson${complete ? ' done' : ''}`, onclick: () => m.open(l.id) },
            h('span', { class: 'lr-check', 'aria-hidden': 'true' }, complete ? '✓' : share > 0 ? '◐' : '○'),
            h('span', { class: 'lr-lesson-text' }, h('strong', {}, l.title), h('span', { class: 'muted small' }, l.summary)),
            h('span', { class: 'muted small lr-steps' }, `${l.steps.length} steps`)));
      })));
    }
    out.push(section);
  }
  return out;
}

function dots(m: LearnMode): HTMLElement {
  const l = m.lesson!;
  const lp = lessonProgress(m.progress, l.id);
  return h('div', { class: 'lr-dots', role: 'tablist', 'aria-label': 'Steps' },
    ...l.steps.map((s, i) => h('button', {
      type: 'button',
      class: `lr-dot${i === m.index ? ' current' : ''}${lp.steps[i]?.done ? ' done' : ''}`,
      title: `Step ${i + 1}: ${STEP_NAMES[s.type]}`,
      'aria-label': `Step ${i + 1}`,
      onclick: () => m.goToStep(i),
    })));
}

function judgeNote(judge: 'tablebase' | 'engine', note?: string | null): HTMLElement {
  return h('p', { class: `muted small lr-judge${note ? ' warn' : ''}` },
    note ?? (judge === 'tablebase' ? 'Checked with the Lichess tablebase (exact).' : 'Checked with the engine (an estimate).'));
}

function tryBlock(m: LearnMode, s: TryStep): HTMLElement[] {
  const st = m.tryState!;
  const out: HTMLElement[] = [h('p', { class: 'lr-prompt' }, s.prompt)];
  if (st.hint >= 1 && st.phase !== 'correct') out.push(h('p', { class: 'hint small' }, `Hint: ${s.hint}`));
  if (st.hint >= 2 && st.phase !== 'correct') out.push(h('p', { class: 'small' }, 'The green arrow shows the move.'));
  if (st.phase === 'checking') out.push(h('p', { class: 'muted' }, `Checking ${st.played?.san}…`));
  if (st.feedback) {
    const f = st.feedback;
    out.push(h('p', { class: `status ${f.ok ? 'good' : 'bad'}` }, `${f.ok ? '✓' : '✗'} ${f.text}`));
    if (f.details.length) out.push(h('ul', { class: 'details' }, ...f.details.map((d) => h('li', {}, d))));
    if (!f.ok) out.push(h('p', { class: 'small' }, 'The green arrow shows a move that works.'));
    out.push(judgeNote(f.judge, f.note));
  }
  out.push(h('div', { class: 'controls' },
    st.phase === 'wrong' ? btn('Retry', () => m.retry(), { primary: true }) : null,
    st.phase !== 'correct' ? btn(st.hint === 0 ? 'Hint' : st.hint === 1 ? 'Show the move' : 'Hint', () => m.hint(), { disabled: st.hint >= 2 || st.phase === 'checking', title: 'H' }) : null,
  ));
  return out;
}

function practiceBlock(m: LearnMode, s: PracticeStep): HTMLElement[] {
  const p = m.practice!;
  const you = s.userColor === 'w' ? 'White' : 'Black';
  const goal = s.goal === 'win' ? 'Goal: checkmate.' : `Goal: hold the draw (${s.maxMoves ?? 20} of your moves, or a drawn ending).`;
  const out: HTMLElement[] = [h('p', { class: 'lr-prompt' }, s.prompt), h('p', { class: 'small' }, `You play ${you}. ${goal}`)];
  if (p.start) out.push(h('p', { class: 'muted small' }, `Starting position: ${p.start === 'win' ? 'a win' : p.start === 'draw' ? 'a draw' : 'a loss'} for you with best play.`));
  if (p.message) out.push(h('p', { class: 'small' }, p.message));
  if (p.flag) {
    const f = p.flag;
    const words = { win: 'a win', draw: 'a draw', loss: 'a loss' };
    out.push(h('div', { class: 'lr-flag' },
      h('p', { class: 'status bad' }, `${f.san} turns ${words[f.from]} into ${words[f.to]}.`),
      f.explanation ? h('p', { class: 'small' }, f.explanation.headline) : h('p', { class: 'muted small' }, 'Working out why…'),
      ...(f.explanation?.details ?? []).slice(0, 2).map((d) => h('p', { class: 'small' }, d)),
      h('div', { class: 'controls' }, btn('Take it back', () => m.undoFlagged(), { primary: true }), btn('Play on anyway', () => m.continueFlagged()))));
  }
  if (p.phase === 'thinking') out.push(h('p', { class: 'muted small' }, 'Thinking…'));
  if (p.end) out.push(h('p', { class: `status ${p.phase === 'done' ? 'good' : 'bad'}` }, `${p.phase === 'done' ? '✓' : '✗'} ${p.end}`));
  out.push(judgeNote(p.judge, p.note));
  out.push(h('div', { class: 'controls' },
    p.phase === 'playing' ? btn('Hint', () => m.hint(), { title: 'Shows the best move (H)' }) : null,
    btn('Restart', () => m.retry(), { primary: p.phase === 'failed' }),
  ));
  return out;
}

function drillBlock(m: LearnMode, s: DrillStep): HTMLElement[] {
  const d = m.drill!;
  const lp = lessonProgress(m.progress, m.lesson!.id);
  const label = (line: string) => {
    const n = d.names.get(line);
    return n ? `${n.name} (${n.eco})` : 'This line';
  };
  const out: HTMLElement[] = [h('p', { class: 'lr-prompt' }, s.prompt), h('p', { class: 'small' }, `You play ${s.side === 'w' ? 'White' : 'Black'}. The coach answers with one of the lesson's lines.`)];
  if (d.offbook) {
    const o = d.offbook;
    out.push(h('div', { class: 'lr-flag' },
      h('p', { class: 'status bad' }, `${o.san} leaves book. Book: ${o.book.map((b) => b.san).join(' or ')}.`),
      h('p', { class: 'small' }, o.idea),
      h('div', { class: 'controls' }, btn('Retry', () => m.retry(), { primary: true }))));
  } else if (d.phase === 'done') {
    out.push(h('p', { class: 'status good' }, `✓ You played ${label(d.target)} to the end of the book${d.misses ? ` (${d.misses} slip${d.misses === 1 ? '' : 's'} on the way)` : ''}.`),
      h('div', { class: 'controls' }, btn('Drill another line', () => m.retry(), { primary: true })));
  } else {
    out.push(h('p', { class: 'muted small' }, d.phase === 'thinking' ? 'The coach is replying…' : d.chess.history().length ? 'Your move.' : 'Your move: start the game.'));
    out.push(h('div', { class: 'controls' }, btn('Hint', () => m.hint(), { disabled: d.phase !== 'playing', title: 'Shows the book move (H)' })));
  }
  // Each line: how often you finished it and left book on it (the drill brings back the ones you miss most).
  out.push(h('table', { class: 'lr-lines' },
    h('tr', {}, h('th', {}, 'Line'), h('th', {}, 'Done'), h('th', {}, 'Missed')),
    ...s.lines.map((l) => {
      const st = lp.drill?.[l];
      return h('tr', { class: l === d.target ? 'current' : '' }, h('td', {}, label(l)), h('td', {}, String(st?.completed ?? 0)), h('td', {}, String(st?.misses ?? 0)));
    })));
  return out;
}

function lesson(m: LearnMode, openTheme?: (theme: string) => void): HTMLElement[] {
  const l = m.lesson!;
  const s = l.steps[m.index];
  const last = m.index === l.steps.length - 1;
  const body = h('div', { class: 'lr-step', 'aria-live': 'polite' });
  if (s.type === 'explain') body.append(h('p', {}, s.text));
  else if (s.type === 'try') body.append(...tryBlock(m, s));
  else if (s.type === 'drill') body.append(...drillBlock(m, s));
  else body.append(...practiceBlock(m, s));
  const complete = isComplete(m.progress, l);
  const next = m.nextLesson();
  return [
    h('p', { class: 'small' }, h('button', { type: 'button', class: 'link', onclick: () => m.backToList() }, '← All lessons')),
    h('h3', { class: 'lr-title' }, l.title),
    h('div', { class: 'lr-stepinfo' }, dots(m), h('span', { class: 'muted small' }, `Step ${m.index + 1} of ${l.steps.length} · ${STEP_NAMES[s.type]}`)),
    body,
    h('div', { class: 'controls lr-nav' },
      btn('◀ Back', () => m.prev(), { disabled: m.index === 0, title: '←' }),
      last ? (next ? btn(`Next lesson: ${next.title}`, () => m.open(next.id), { primary: complete }) : btn('All lessons', () => m.backToList(), { primary: complete }))
        : btn('Next ▶', () => m.next(), { primary: true, title: '→' })),
    complete ? h('p', { class: 'status good small' }, '✓ Lesson complete.') : h('span', {}),
    l.puzzleThemes?.length && openTheme
      ? h('p', { class: 'small lr-theme' }, h('button', { type: 'button', class: 'btn small', onclick: () => openTheme(l.puzzleThemes![0]) }, 'Practice this theme in Puzzles'))
      : h('span', {}),
  ];
}

export function renderLearnPanel(el: HTMLElement, m: LearnMode, openTheme?: (theme: string) => void): void {
  el.replaceChildren(h('h2', {}, 'Learn'), ...(m.view === 'lesson' && m.lesson ? lesson(m, openTheme) : list(m)));
}
