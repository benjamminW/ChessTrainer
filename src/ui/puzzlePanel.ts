import { lineToSan } from '../coach/facts';
import { formatEval, formatLine } from '../coach/format';
import type { Analysis } from '../engine/uci';
import type { PuzzleMode } from '../puzzles/controller';
import { RATING_CONFIG } from '../puzzles/rating';
import { dueCount, lastChange } from '../puzzles/store';
import { FILTER_THEMES, describeThemes, themeName } from '../puzzles/themes';
import { classSlug, h } from './panel';

const colorName = (c: string) => (c === 'w' ? 'White' : 'Black');
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

function ratingHeader(m: PuzzleMode): HTMLElement {
  const s = m.stats;
  const change = lastChange(s);
  const provisional = s.ratedPlayed < RATING_CONFIG.provisionalPuzzles;
  const recent = s.history.slice(-10);
  return h(
    'div',
    { class: 'pz-rating' },
    h(
      'div',
      { class: 'pz-rating-main' },
      h('span', { class: 'pz-rating-label' }, 'Your puzzle rating'),
      h('span', { class: 'pz-rating-value' }, String(s.rating), provisional ? h('span', { class: 'pz-prov', title: `Settles after ${RATING_CONFIG.provisionalPuzzles} rated puzzles` }, '?') : null),
      change !== null ? h('span', { class: `pz-change ${change > 0 ? 'up' : change < 0 ? 'down' : ''}` }, signed(change)) : null,
    ),
    h(
      'div',
      { class: 'pz-recent', 'aria-label': 'Last results' },
      ...recent.map((r) =>
        h('span', { class: `pz-dot ${r.result}`, title: `${r.result}${r.review ? ' (review)' : ''}: puzzle ${r.puzzleRating}, ${signed(r.change)}` }),
      ),
      h('span', { class: 'muted small' }, `${s.ratedPlayed} rated`),
    ),
  );
}

function filters(m: PuzzleMode): HTMLElement {
  const p = m.stats.prefs;
  const due = dueCount(m.stats);
  const queued = m.stats.review.length;
  const tab = (id: 'rated' | 'review' | 'mine', label: string) =>
    h('button', {
      type: 'button',
      class: `btn small${p.source === id ? ' primary' : ''}`,
      'aria-pressed': p.source === id ? 'true' : 'false',
      onclick: () => p.source !== id && m.setPrefs({ source: id }),
    }, label);

  const band = h('select', { 'aria-label': 'Puzzle rating', disabled: p.source !== 'rated' }) as HTMLSelectElement;
  band.append(new Option(`Near my rating (${m.stats.rating})`, 'auto'));
  for (const b of m.index?.bands ?? []) band.append(new Option(`${b.band}–${b.band + 99}`, String(b.band)));
  band.value = String(p.band);
  band.onchange = () => m.setPrefs({ band: band.value === 'auto' ? 'auto' : Number(band.value) });

  const theme = h('select', { 'aria-label': 'Puzzle theme', disabled: p.source !== 'rated' }) as HTMLSelectElement;
  theme.append(new Option('All themes', 'all'));
  for (const t of FILTER_THEMES) theme.append(new Option(themeName(t)[0].toUpperCase() + themeName(t).slice(1), t));
  theme.value = p.theme;
  theme.onchange = () => m.setPrefs({ theme: theme.value });

  return h(
    'div',
    { class: 'pz-filters' },
    h('div', { class: 'pz-tabs' },
      tab('rated', 'Rated puzzles'),
      tab('review', `Review mistakes${queued ? ` (${due ? `${due} due` : queued})` : ''}`),
      tab('mine', `My mistakes${m.stats.custom.length ? ` (${m.stats.custom.length})` : ''}`)),
    h('div', { class: 'appearance' }, h('label', {}, 'Rating', band), h('label', {}, 'Theme', theme)),
  );
}

function puzzleMeta(m: PuzzleMode): HTMLElement | null {
  const p = m.puzzle;
  if (!p) return null;
  const custom = m.customInfo();
  if (custom) {
    return h(
      'div',
      { class: 'pz-meta' },
      h('p', {}, h('span', { class: 'line-label' }, 'From'), h('a', { href: custom.from.url, target: '_blank', rel: 'noopener' }, custom.from.label)),
      h('p', { class: 'small muted' }, `Unrated. Solved ${custom.solved}×, failed ${custom.failed}×.`),
    );
  }
  return h(
    'div',
    { class: 'pz-meta' },
    h('p', {}, h('span', { class: 'line-label' }, 'Puzzle rating'), String(p.rating)),
    h('div', { class: 'pz-themes' }, ...describeThemes(p.themes).map((t) => h('span', { class: 'pz-theme' }, t))),
    h('p', { class: 'small' }, h('a', { href: `https://lichess.org/training/${p.id}`, target: '_blank', rel: 'noopener' }, `Puzzle ${p.id} on Lichess`)),
  );
}

function statusBlock(m: PuzzleMode): HTMLElement[] {
  const line = m.line;
  const solver = line ? colorName(line.solver) : '';
  const unrated = m.unrated;
  const out: HTMLElement[] = [];
  const st = (text: string, cls = '') => out.push(h('p', { class: `status ${cls}` }, text));

  switch (m.phase) {
    case 'loading':
      st('Loading puzzle…');
      break;
    case 'setup':
      st(`Watch your opponent's move, then find the best reply for ${solver}.`);
      break;
    case 'solving':
      st(line && line.step > 1 ? 'Correct! Now find the next move.' : `Find the best move for ${solver}.`);
      if (m.assisted && !m.outcome) out.push(h('p', { class: 'muted small' }, "Hint used: solving it now won't change your rating."));
      if (m.customInfo() && !m.outcome) out.push(h('p', { class: 'muted small' }, `From your game: ${m.customInfo()!.from.label}. Unrated.`));
      else if (unrated && !m.outcome) out.push(h('p', { class: 'muted small' }, 'Review puzzle: unrated.'));
      break;
    case 'reply':
      st('Correct!', 'good');
      break;
    case 'wrong': {
      const w = m.wrong!;
      st(`Not quite. ${w.correctSan} was the move.`, 'bad');
      const head = h('div', { class: 'explain-head' }, h('span', { class: 'explain-move' }, `You played ${w.san}`));
      if (w.classification) head.append(h('span', { class: `badge cls-${classSlug(w.classification)}` }, w.classification));
      out.push(head);
      if (!w.explanation) out.push(h('p', { class: 'muted' }, 'The coach is working out why…'));
      else {
        const details = w.explanation.details.filter((d) => !d.startsWith(`${w.correctSan}:`));
        if (details.length) out.push(h('ul', { class: 'details' }, ...details.map((d) => h('li', {}, d))));
        if (w.explanation.tip) out.push(h('p', { class: 'lesson' }, h('span', { class: 'lesson-label' }, 'Tip'), w.explanation.tip));
      }
      out.push(h('p', { class: 'muted small' }, `The green arrow shows ${w.correctSan}. Try again from here, or see the whole solution.`));
      break;
    }
    case 'solution':
      st('Here is the solution…');
      break;
    case 'done': {
      const o = m.outcome;
      if (o === 'solved') st('Solved!', 'good');
      else if (o === 'assisted') st('Solved with a hint.', 'good');
      else st('Puzzle failed.', 'bad');
      if (unrated) out.push(h('p', { class: 'muted small' }, m.customInfo() ? 'Unrated (from your game).' : 'Unrated (review puzzle).'));
      else out.push(h('p', { class: 'pz-result' }, `Rating ${signed(m.change)} → ${m.stats.rating}`));
      break;
    }
    case 'empty':
      st(m.stats.prefs.source === 'review'
        ? 'No mistakes to review. Puzzles you fail show up here.'
        : m.stats.prefs.source === 'mine'
          ? 'No puzzles from your games yet. In Review mode, open a game and press "Save as puzzle" on a key moment.'
          : 'No more puzzles match these filters. Try another theme or rating.');
      break;
    case 'error':
      st(`Couldn't load puzzles: ${m.error}`, 'bad');
      break;
  }
  return out;
}

function actions(m: PuzzleMode): HTMLElement {
  const btn = (label: string, onclick: () => void, primary = false, disabled = false) =>
    h('button', { type: 'button', class: `btn${primary ? ' primary' : ''}`, onclick, disabled }, label);
  const row = h('div', { class: 'controls pz-actions' });
  if (m.phase === 'solving') {
    row.append(
      h('button', { type: 'button', class: 'btn hint-btn', title: 'Hint (H)', onclick: () => m.hint(), disabled: m.hintLevel >= 2 },
        m.hintLevel === 0 ? 'Hint' : m.hintLevel === 1 ? 'Show the move' : 'Hint'),
      btn('Give up', () => m.viewSolution()),
    );
  }
  if (m.phase === 'wrong') row.append(btn('Retry', () => m.retry(), true), btn('Show solution', () => m.viewSolution()));
  if (m.phase === 'done') row.append(btn('Next puzzle', () => void m.loadNext(), true), btn('Analyze', () => m.openAnalysis()), btn('Retry puzzle', () => m.restart()));
  if (m.phase === 'wrong') row.append(btn('Next puzzle', () => void m.loadNext()), btn('Analyze', () => m.openAnalysis()));
  if (m.phase === 'empty' || m.phase === 'error') row.append(btn('Try again', () => void m.loadNext(), true));
  return row;
}

function analysisBlock(m: PuzzleMode, resolved: (fen: string) => Analysis | undefined): HTMLElement[] {
  const a = m.analysisBoard!;
  const fen = a.chess.fen();
  const an = resolved(fen);
  const top = an?.lines[0];
  const sign = a.chess.turn() === 'w' ? 1 : -1;
  const played = a.chess.history();
  return [
    h('h3', {}, 'Analysis board'),
    h('p', { class: 'muted small' }, 'Move pieces for either side. The engine evaluates every position; the blue arrow is its best move.'),
    a.chess.isGameOver()
      ? h('p', { class: 'status' }, a.chess.isCheckmate() ? 'Checkmate.' : 'Game over (draw).')
      : h('p', { class: 'status' }, top ? `Evaluation: ${formatEval(top.cp * sign)}` : 'Engine thinking…'),
    top ? h('p', { class: 'line' }, h('span', { class: 'line-label' }, 'Best line'), formatLine(fen, lineToSan(fen, top.pv, 6))) : h('span', {}),
    played.length ? h('p', { class: 'line' }, h('span', { class: 'line-label' }, 'Your moves'), formatLine(a.startFen, played)) : h('span', {}),
    h(
      'div',
      { class: 'controls pz-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => m.analysisUndo(), disabled: !played.length }, 'Undo'),
      h('button', { type: 'button', class: 'btn', onclick: () => m.analysisReset() }, 'Reset'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => m.closeAnalysis() }, 'Back to puzzle'),
    ),
  ];
}

export function renderPuzzlePanel(el: HTMLElement, m: PuzzleMode, resolved: (fen: string) => Analysis | undefined): void {
  el.replaceChildren();
  el.append(h('h2', {}, 'Puzzles'), ratingHeader(m), filters(m));
  const body = h('div', { class: 'pz-body', 'aria-live': 'polite' });
  if (m.analysisBoard) body.append(...analysisBlock(m, resolved));
  else {
    body.append(...statusBlock(m), actions(m));
    if (m.phase === 'done' || m.phase === 'wrong' || m.phase === 'solution') {
      const meta = puzzleMeta(m);
      if (meta) body.append(meta);
    }
  }
  el.append(
    body,
    h('p', { class: 'pz-credit' },
      'Puzzles from the ',
      h('a', { href: 'https://database.lichess.org/#puzzles', target: '_blank', rel: 'noopener' }, 'Lichess puzzle database'),
      ' (CC0). Thank you, Lichess!'),
  );
}
