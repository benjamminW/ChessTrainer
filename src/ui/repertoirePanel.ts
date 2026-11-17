import { formatEval } from '../coach/format';
import { lessonSources, type RepertoireMode } from '../repertoire/controller';
import { dueText } from '../repertoire/srs';
import { lineText, turnOf, type Repertoire } from '../repertoire/tree';
import type { Color } from '../types';
import { h } from './panel';

const side = (c: Color) => (c === 'w' ? 'White' : 'Black');

const btn = (label: string, onclick: () => void, o: { primary?: boolean; small?: boolean; disabled?: boolean; title?: string; cls?: string } = {}) =>
  h('button', { type: 'button', class: `btn${o.primary ? ' primary' : ''}${o.small ? ' small' : ''}${o.cls ? ' ' + o.cls : ''}`, onclick, disabled: !!o.disabled, title: o.title ?? '' }, label);

const back = (m: RepertoireMode) =>
  h('p', { class: 'small' }, h('button', { type: 'button', class: 'link', onclick: () => m.backToList() }, '← All repertoires'));

/** When the next review is due, for "All caught up". */
function nextDue(m: RepertoireMode, rep: Repertoire): string | null {
  const cards = Object.values(rep.cards);
  if (!cards.length) return null;
  const first = cards.reduce((a, b) => (Date.parse(a.due) < Date.parse(b.due) ? a : b));
  return dueText(first, m.now());
}

function trainButtons(m: RepertoireMode, rep: Repertoire): HTMLElement {
  const c = m.counts(rep);
  return h('div', { class: 'controls rp-train' },
    btn(c.due ? `Train (${c.due} due)` : 'Train', () => m.train(rep.id, 'due'), { primary: c.due > 0, disabled: !c.due, title: c.due ? '' : 'Nothing is due right now' }),
    btn(c.fresh ? `Learn new (${c.fresh})` : 'Learn new', () => m.train(rep.id, 'learn'), { primary: !c.due && c.fresh > 0, disabled: !c.fresh }),
    btn('Practice all', () => m.train(rep.id, 'all'), { disabled: !c.cards, title: 'Random lines, whether due or not' }));
}

function createForm(m: RepertoireMode): HTMLElement {
  const name = h('input', { type: 'text', 'data-keep': 'new-name', class: 'rp-input', placeholder: 'Name (e.g. London System)', 'aria-label': 'Repertoire name', maxlength: '60' }) as HTMLInputElement;
  const color = h('select', { 'data-keep': 'new-color', class: 'rp-input', 'aria-label': 'Side' }, h('option', { value: 'w' }, 'I play White'), h('option', { value: 'b' }, 'I play Black')) as HTMLSelectElement;
  const from = h('select', { 'data-keep': 'new-from', class: 'rp-input', 'aria-label': 'Start from' }) as HTMLSelectElement;
  const fill = () => {
    const c = color.value as Color;
    from.replaceChildren(h('option', { value: '' }, 'Start empty'),
      ...lessonSources().filter((s) => s.side === c).map((s) => h('option', { value: s.id }, `Start with: ${s.title}`)));
  };
  color.addEventListener('change', fill);
  fill();
  return h('form', { class: 'rp-create', onsubmit: (e: Event) => {
    e.preventDefault();
    m.create(name.value, color.value as Color, from.value || undefined);
  } },
  h('h3', {}, 'New repertoire'),
  h('div', { class: 'rp-create-row' }, name, color),
  from,
  h('div', { class: 'controls' }, h('button', { type: 'submit', class: 'btn primary' }, 'Create')));
}

function list(m: RepertoireMode): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (!m.reps.length) {
    out.push(h('p', { class: 'muted small' },
      'Build the openings you play, move by move, then train them with spaced repetition. The app plays the replies you prepared for and you play your moves from memory. Moves you know come back less and less often; a move you miss comes back the same day.'));
  }
  for (const rep of m.reps) {
    const c = m.counts(rep);
    const caught = !c.due && !c.fresh && c.cards ? nextDue(m, rep) : null;
    out.push(h('section', { class: 'rp-item' },
      h('div', { class: 'rp-item-head' },
        h('button', { type: 'button', class: 'link rp-name', onclick: () => m.openEdit(rep.id) }, rep.name),
        c.due ? h('span', { class: 'rp-due' }, `${c.due} due`) : null),
      h('p', { class: 'muted small' }, `${side(rep.color)} · ${c.moves} move${c.moves === 1 ? '' : 's'} · ${c.learned} of ${c.cards} of your moves learned${caught ? ` · next review ${caught}` : ''}`),
      c.cards ? h('div', { class: 'lr-bar' }, h('span', { style: `width:${Math.round((c.learned / c.cards) * 100)}%` })) : null,
      c.cards ? trainButtons(m, rep) : h('div', { class: 'controls' }, btn('Add moves', () => m.openEdit(rep.id), { primary: true })),
    ));
  }
  out.push(createForm(m));
  return out;
}

/** The moves from the start to the position being edited, each clickable. */
function pathView(m: RepertoireMode): HTMLElement {
  const hist = m.editChess.history();
  const items: Node[] = [h('button', { type: 'button', class: `rp-step${hist.length ? '' : ' current'}`, onclick: () => m.goTo(0) }, 'Start')];
  hist.forEach((san, i) => {
    if (i % 2 === 0) items.push(h('span', { class: 'muted rp-num' }, `${i / 2 + 1}.`));
    items.push(h('button', { type: 'button', class: `rp-step${i === hist.length - 1 ? ' current' : ''}`, onclick: () => m.goTo(i + 1) }, san));
  });
  return h('div', { class: 'rp-path', 'aria-label': 'Moves to this position' }, ...items);
}

function edit(m: RepertoireMode): HTMLElement[] {
  const rep = m.rep!;
  const c = m.counts(rep);
  const key = m.editKey;
  const mine = turnOf(key) === rep.color;
  const moves = m.editMoves;
  const over = m.editChess.isGameOver();
  const name = h('input', { type: 'text', 'data-keep': `name-${rep.id}`, class: 'rp-input rp-title', value: rep.name, 'aria-label': 'Repertoire name', maxlength: '60' }) as HTMLInputElement;
  name.addEventListener('change', () => m.rename(name.value));
  const opening = m.openingName();

  const here: HTMLElement[] = [];
  if (over) here.push(h('p', { class: 'muted small' }, 'The game is over in this position.'));
  else if (mine) {
    here.push(h('p', { class: 'rp-turn' }, moves.length ? `Your move here: ${moves[0].san}` : 'Your move: play it on the board to add it.'));
    if (moves.length) here.push(h('p', { class: 'muted small' }, 'You keep one move per position. Delete it to choose another.'));
  } else {
    here.push(h('p', { class: 'rp-turn' }, `${side(turnOf(key))} to move: add the replies you want to prepare for.`));
  }
  if (moves.length) {
    here.push(h('ul', { class: 'rp-moves' }, ...moves.map((mv) => h('li', {},
      h('button', { type: 'button', class: `btn small rp-move ${mine ? 'mine' : 'theirs'}`, onclick: () => m.setPath([...m.path, mv.uci]), title: 'Go to this move' }, mv.san),
      h('button', { type: 'button', class: 'btn small icon rp-del', onclick: () => void m.deleteMove(mv.uci), title: `Delete ${mv.san}`, 'aria-label': `Delete ${mv.san}` }, '✕')))));
  }
  const book = (mine && moves.length) || over ? [] : m.bookMoves().filter((b) => !moves.some((x) => x.uci === b.uci));
  if (book.length) {
    here.push(h('p', { class: 'muted small rp-book-label' }, 'Book moves (click to add):'),
      h('div', { class: 'rp-book' }, ...book.map((b) => btn(b.san, () => m.editPlay(b.uci), { small: true }))));
  }

  const area = h('textarea', { 'data-keep': 'import', class: 'bm-paste', rows: '4', placeholder: 'Paste PGN. Variations in brackets are added too, e.g. 1. e4 e5 (1... c5 2. Nf3) 2. Nf3', 'aria-label': 'PGN to import' }) as HTMLTextAreaElement;
  const sources = lessonSources().filter((s) => s.side === rep.color);
  const lesson = h('select', { 'data-keep': 'lesson', class: 'rp-input', 'aria-label': 'Learn opening' }, ...sources.map((s) => h('option', { value: s.id }, s.title))) as HTMLSelectElement;
  const report = m.importReport;
  const exportArea = h('textarea', { class: 'bm-paste', rows: '4', readonly: true, 'aria-label': 'Repertoire as PGN' }) as HTMLTextAreaElement;
  const exportBox = h('details', { class: 'rp-more', 'data-keep': 'd-export' }, h('summary', {}, 'Export PGN'), exportArea,
    h('div', { class: 'controls' }, btn('Copy', () => {
      exportArea.select();
      void navigator.clipboard?.writeText(exportArea.value).catch(() => {});
    }, { small: true })));
  exportBox.addEventListener('toggle', () => {
    if (exportBox.open) exportArea.value = m.exportText();
  });

  return [
    back(m),
    name,
    h('p', { class: 'muted small' }, `You play ${side(rep.color)} · ${c.moves} moves · ${c.cards} of your moves to learn`),
    pathView(m),
    opening ? h('p', { class: 'small rp-opening' }, opening) : null,
    m.evalCp !== null ? h('p', { class: 'muted small' }, `Engine: ${formatEval(m.evalCp)}`) : null,
    h('div', { class: 'rp-here' }, ...here),
    m.message ? h('p', { class: `small ${m.message.bad ? 'status bad' : 'muted'}` }, m.message.text) : null,
    report ? h('p', { class: 'small' }, `Added ${report.added} move${report.added === 1 ? '' : 's'}.${report.conflicts ? ` ${report.conflicts} line${report.conflicts === 1 ? '' : 's'} stopped where you already play a different move.` : ''}${report.errors.length ? ' ' + report.errors.join(' ') : ''}`) : null,
    h('div', { class: 'controls rp-nav' },
      btn('⏮', () => m.goTo(0), { small: true, title: 'Start (Home)', disabled: !m.path.length }),
      btn('◀ Back', () => m.back(), { small: true, title: '←', disabled: !m.path.length }),
      btn('Next ▶', () => m.forward(), { small: true, title: '→ follows your first move here', disabled: !moves.length })),
    h('h3', {}, 'Train'),
    c.cards ? trainButtons(m, rep) : h('p', { class: 'muted small' }, 'Add some of your moves first.'),
    h('details', { class: 'rp-more', 'data-keep': 'd-import' }, h('summary', {}, 'Import PGN'), area,
      h('div', { class: 'controls' }, btn('Import', () => {
        const text = area.value;
        area.value = '';
        m.importText(text);
      }, { small: true }))),
    sources.length
      ? h('details', { class: 'rp-more', 'data-keep': 'd-lesson' }, h('summary', {}, 'Add lines from a Learn lesson'), lesson,
        h('div', { class: 'controls' }, btn('Add', () => m.addLesson(lesson.value), { small: true })))
      : null,
    exportBox,
    h('div', { class: 'controls rp-danger' }, btn('Delete repertoire', () => void m.remove(rep.id), { small: true })),
  ].filter((x): x is HTMLElement => !!x);
}

function train(m: RepertoireMode): HTMLElement[] {
  const rep = m.rep!;
  const run = m.run;
  const c = m.counts(rep);
  const out: HTMLElement[] = [back(m), h('h3', { class: 'rp-name-h' }, rep.name)];
  if (!run) {
    const when = nextDue(m, rep);
    out.push(h('p', {}, c.cards ? `Nothing to train here right now.${when && !c.due ? ` Next review ${when}.` : ''}` : 'This repertoire has none of your moves yet.'),
      c.cards ? trainButtons(m, rep) : btn('Add moves', () => m.openEdit(rep.id), { primary: true }));
    return out;
  }
  const kindLabel = run.pass === 'memory' ? 'From memory' : { due: 'Due reviews', learn: 'Learning new moves', all: 'Practice' }[run.kind];
  const opening = m.openingName(run.line.ucis);
  out.push(h('p', { class: 'muted small' }, `${kindLabel}${opening ? ` · ${opening}` : ''}`));

  const played = run.chess.history({ verbose: true }).map((x) => x.from + x.to + (x.promotion ?? ''));
  out.push(h('p', { class: 'rp-line' }, played.length ? lineText(played) : 'Start position'));

  const want = m.expected;
  let status: HTMLElement;
  if (run.phase === 'done') {
    const results = [...run.results.entries()].filter(([k]) => !run.shown.has(k));
    const right = results.filter(([, ok]) => ok).length;
    status = h('p', { class: 'status good' }, `✓ Line complete.${results.length ? ` ${right} of ${results.length} right from memory.` : ''}${run.shown.size ? ` ${run.shown.size} new move${run.shown.size === 1 ? '' : 's'} shown.` : ''}`);
  } else if (run.phase === 'thinking') status = h('p', { class: 'muted' }, 'Opponent is moving…');
  else if (run.phase === 'wrong' && run.wrong) status = h('p', { class: 'status bad' }, `✗ ${run.wrong.san} isn't your move here. Your repertoire plays ${run.wrong.expected.san}: play it to go on.`);
  else if (want && m.newHere) status = h('p', { class: 'rp-new' }, `New move: play ${want.san}. The arrow shows it.`);
  else if (want && run.hint) status = h('p', {}, `Play ${want.san} (shown by the arrow).`);
  else status = h('p', {}, run.pass === 'memory' ? 'From memory: your move.' : 'Your move.');
  out.push(h('div', { class: 'rp-status', 'aria-live': 'polite' }, status));

  const next = run.phase === 'done' ? m.nextAction : null;
  out.push(h('div', { class: 'controls' },
    run.phase === 'done'
      ? (next ? btn(next.label, () => next.go(), { primary: true, title: 'Enter' }) : btn('All done', () => m.backToList(), { primary: true }))
      : btn('Hint', () => m.hint(), { disabled: run.phase !== 'playing' || !want || m.showing, title: 'Shows your move (H). Counts as a miss.' }),
    btn('Restart line', () => m.restart(), { small: true }),
    btn('Edit here', () => m.editHere(), { small: true, title: 'Open this position in the builder' })));
  if (run.phase === 'done' && !next && !c.due) {
    const when = nextDue(m, rep);
    out.push(h('p', { class: 'muted small' }, `All caught up${when ? `. Next review ${when}` : ''}.`));
  }
  const t = m.tally;
  out.push(h('p', { class: 'muted small rp-tally' },
    `${t.right + t.wrong ? `This session: ${t.right} right, ${t.wrong} missed · ` : ''}Due now: ${c.due} · New: ${c.fresh} · Learned: ${c.learned} of ${c.cards}`));
  return out;
}

/**
 * The panel is rebuilt on every render (engine evals and opponent moves arrive in between), so
 * typed text, open sections and focus are carried over by their data-keep names.
 */
function keepState(el: HTMLElement): () => void {
  const values = new Map<string, string>();
  const open = new Map<string, boolean>();
  el.querySelectorAll<HTMLElement>('[data-keep]').forEach((x) => {
    const k = x.dataset.keep!;
    if (x instanceof HTMLDetailsElement) open.set(k, x.open);
    else values.set(k, (x as HTMLInputElement).value);
  });
  const active = document.activeElement instanceof HTMLElement && el.contains(document.activeElement) ? document.activeElement : null;
  const focus = active?.dataset.keep ?? null;
  const sel = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? [active.selectionStart, active.selectionEnd] : null;
  return () => {
    el.querySelectorAll<HTMLElement>('[data-keep]').forEach((x) => {
      const k = x.dataset.keep!;
      if (x instanceof HTMLDetailsElement) {
        if (open.has(k)) x.open = open.get(k)!;
      } else if (values.has(k)) {
        (x as HTMLInputElement).value = values.get(k)!;
        if (x instanceof HTMLSelectElement) x.dispatchEvent(new Event('change'));
      }
    });
    if (!focus) return;
    const f = el.querySelector<HTMLElement>(`[data-keep="${focus}"]`);
    f?.focus();
    if (sel && (f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement)) f.setSelectionRange(sel[0], sel[1]);
  };
}

export function renderRepertoirePanel(el: HTMLElement, m: RepertoireMode): void {
  const restore = keepState(el);
  const body = m.view === 'edit' && m.rep ? edit(m) : m.view === 'train' && m.rep ? train(m) : list(m);
  el.replaceChildren(h('h2', {}, 'Repertoire'), ...body);
  restore();
}
