import { CLASSES, label as plyLabel } from '../coach/gameReview';
import { formatEval } from '../coach/format';
import { PRESETS, REVIEW_CONFIG } from '../config/review';
import type { ChessComGame } from '../review/chesscom';
import type { OpenGame, ReviewMode } from '../review/controller';
import { MISTAKE_LABELS, userResult, type Record3, type Ref } from '../review/patterns';
import type { Classification } from '../types';
import { classSlug, h } from './panel';
import { evalGraph } from './reviewCard';

const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x)}%`);
const cp = (x: number | null) => (x === null ? '–' : String(Math.round(x)));
const colorName = (c: string) => (c === 'w' ? 'White' : 'Black');
const date = (sec: number) => new Date(sec * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const SHORT: Record<Classification, string> = { Best: 'Best', Good: 'Good', Inaccuracy: 'Inacc.', Mistake: 'Mistake', Blunder: 'Blunder' };

function timeControl(g: ChessComGame): string {
  if (g.time_class === 'daily') return 'Daily';
  const [base, inc] = g.time_control.split('+').map(Number);
  const min = base >= 60 ? `${Math.round(base / 60)}` : `${base}s`;
  return `${g.time_class[0].toUpperCase()}${g.time_class.slice(1)} ${min}${inc ? `+${inc}` : ''}`;
}

function select<T extends string>(labelText: string, value: T, options: [T, string][], onChange: (v: T) => void): HTMLElement {
  const s = h('select', { 'aria-label': labelText }) as HTMLSelectElement;
  for (const [v, t] of options) s.append(new Option(t, v));
  s.value = value;
  s.onchange = () => onChange(s.value as T);
  return h('label', {}, labelText, s);
}

// ---------------------------------------------------------------- start and game list

function usernameForm(m: ReviewMode): HTMLElement {
  const input = h('input', { type: 'text', placeholder: 'Chess.com username', 'aria-label': 'Chess.com username', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  input.value = m.prefs.username;
  const form = h('form', { class: 'rv-user' }, input, h('button', { type: 'submit', class: 'btn primary' }, m.prefs.username ? 'Reload' : 'Load games'));
  form.onsubmit = (e) => {
    e.preventDefault();
    void m.loadUser(input.value);
  };
  return form;
}

function queueBox(m: ReviewMode): HTMLElement | null {
  const jobs = m.queue.jobs;
  if (!jobs.length) return null;
  const finished = jobs.filter((j) => j.status === 'done' || j.status === 'cached').length;
  const running = jobs.find((j) => j.status === 'running');
  const waiting = jobs.filter((j) => j.status === 'queued').length;
  const box = h('div', { class: 'rv-queue', 'aria-live': 'polite' });
  const total = jobs.filter((j) => j.status !== 'cancelled').length;
  box.append(h('p', { class: 'small' }, m.queue.active
    ? `Analyzing game ${finished + 1} of ${total}${m.queue.paused ? ' (paused)' : ''}${running ? `: ${running.label}` : ''}`
    : `Analysis finished: ${finished} game${finished === 1 ? '' : 's'}.`));
  if (running) {
    box.append(h('div', { class: 'walk-progress' }, h('span', { style: `width:${(running.done / running.total) * 100}%` })));
    box.append(h('p', { class: 'muted small' }, `Position ${running.done} of ${running.total}${waiting ? ` · ${waiting} more game${waiting === 1 ? '' : 's'} queued` : ''}`));
  }
  const errors = jobs.filter((j) => j.status === 'error');
  if (errors.length) box.append(h('p', { class: 'small bad' }, `${errors.length} game${errors.length === 1 ? '' : 's'} failed: ${errors[0].error}`));
  const row = h('div', { class: 'controls' });
  if (m.queue.active) {
    row.append(
      m.queue.paused
        ? h('button', { type: 'button', class: 'btn small primary', onclick: () => m.queue.resume() }, 'Resume')
        : h('button', { type: 'button', class: 'btn small', onclick: () => m.queue.pause() }, 'Pause'),
      h('button', { type: 'button', class: 'btn small', onclick: () => m.queue.cancel() }, 'Cancel'),
    );
  } else {
    row.append(h('button', { type: 'button', class: 'btn small', onclick: () => m.queue.clearFinished() }, 'Dismiss'));
  }
  box.append(row);
  return box;
}

function statusCell(m: ReviewMode, g: ChessComGame): HTMLElement {
  const job = m.queue.jobs.find((j) => j.url === g.url);
  if (job?.status === 'running') return h('span', { class: 'rv-status running' }, `${Math.round((job.done / job.total) * 100)}%`);
  if (job?.status === 'queued') return h('span', { class: 'rv-status' }, 'Queued');
  const a = m.analyses.get(g.url);
  if (a) {
    const acc = a.accuracy[m.userColorIn(g)];
    return h('span', { class: 'rv-status done', title: `Analyzed at depth ${a.depth}` }, `${pct(acc)} acc.`);
  }
  return h('span', { class: 'rv-status muted' }, 'Not analyzed');
}

function gamesView(m: ReviewMode): HTMLElement[] {
  const f = m.prefs.filters;
  const out: HTMLElement[] = [];
  out.push(
    h('div', { class: 'appearance rv-filters' },
      select('Time', f.timeClass, [['all', 'All'], ['bullet', 'Bullet'], ['blitz', 'Blitz'], ['rapid', 'Rapid'], ['daily', 'Daily']], (v) => m.setFilters({ timeClass: v })),
      select('Color', f.color, [['all', 'Both'], ['w', 'White'], ['b', 'Black']], (v) => m.setFilters({ color: v })),
      select('Result', f.result, [['all', 'All'], ['win', 'Wins'], ['draw', 'Draws'], ['loss', 'Losses']], (v) => m.setFilters({ result: v })),
    ),
  );
  const from = h('input', { type: 'date', 'aria-label': 'From date' }) as HTMLInputElement;
  from.value = f.from;
  from.onchange = () => m.setFilters({ from: from.value });
  const to = h('input', { type: 'date', 'aria-label': 'To date' }) as HTMLInputElement;
  to.value = f.to;
  to.onchange = () => m.setFilters({ to: to.value });
  out.push(h('div', { class: 'appearance rv-filters' }, h('label', {}, 'From', from), h('label', {}, 'To', to)));

  const n = h('input', { type: 'number', min: '1', max: '100', 'aria-label': 'Number of games', class: 'rv-n' }) as HTMLInputElement;
  n.value = String(m.prefs.batch);
  n.onchange = () => m.setPrefs({ batch: Math.max(1, Math.min(100, Number(n.value) || REVIEW_CONFIG.defaultBatch)) });
  out.push(
    h('div', { class: 'rv-analyze' },
      select('Depth', m.prefs.preset, Object.values(PRESETS).map((p) => [p.id, p.name] as [typeof p.id, string]), (v) => m.setPrefs({ preset: v })),
      h('div', { class: 'controls' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => m.analyzeLatest(), disabled: !m.games.length }, 'Analyze latest'),
        n,
        m.selected.size ? h('button', { type: 'button', class: 'btn', onclick: () => m.analyzeSelected() }, `Analyze selected (${m.selected.size})`) : null,
      ),
    ),
  );
  const q = queueBox(m);
  if (q) out.push(q);

  const list = m.filtered();
  if (m.loading && !m.games.length) out.push(h('p', { class: 'muted' }, 'Loading games from Chess.com…'));
  else if (!list.length && m.games.length) out.push(h('p', { class: 'muted' }, 'No loaded games match these filters.'));
  if (list.length) {
    const rows = list.map((g) => {
      const c = m.userColorIn(g);
      const me = c === 'w' ? g.white : g.black;
      const opp = c === 'w' ? g.black : g.white;
      const r = userResult(g, c);
      const cb = h('input', { type: 'checkbox', 'aria-label': `Select game vs ${opp.username}` }) as HTMLInputElement;
      cb.checked = m.selected.has(g.url);
      cb.onclick = (e) => {
        e.stopPropagation();
        m.toggleSelected(g.url);
      };
      return h('tr', { class: 'rv-row', tabindex: '0', onclick: () => m.openGame(g.url), onkeydown: (e: Event) => (e as KeyboardEvent).key === 'Enter' && m.openGame(g.url) },
        h('td', {}, cb),
        h('td', {}, h('span', { class: `rv-color ${c}`, title: colorName(c) }), h('span', { class: 'rv-opp' }, opp.username), h('span', { class: 'muted small' }, ` ${opp.rating}`)),
        h('td', { class: `rv-res ${r}` }, r === 'win' ? 'W' : r === 'loss' ? 'L' : 'D'),
        h('td', { class: 'small' }, timeControl(g)),
        h('td', { class: 'small muted' }, date(g.end_time)),
        h('td', { class: 'small' }, String(me.rating)),
        h('td', {}, statusCell(m, g)),
      );
    });
    out.push(
      h('div', { class: 'rv-table-wrap' },
        h('table', { class: 'rv-table' },
          h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Opponent'), h('th', {}, ''), h('th', {}, 'Time'), h('th', {}, 'Date'), h('th', {}, 'You'), h('th', {}, 'Status'))),
          h('tbody', {}, ...rows),
        ),
      ),
    );
  }
  out.push(
    h('p', { class: 'muted small' }, `${m.games.length} games loaded${m.loadedRange ? ` (${m.loadedRange})` : ''}. Variants such as Chess960 are skipped.`),
  );
  if (m.olderMonthsLeft > 0) out.push(h('button', { type: 'button', class: 'btn small', onclick: () => void m.loadOlder(), disabled: m.loading }, m.loading ? 'Loading…' : `Load older month (${m.olderMonthsLeft} left)`));
  return out;
}

// ---------------------------------------------------------------- single game

function refLink(m: ReviewMode, r: Ref): HTMLElement {
  return h('button', { type: 'button', class: 'link', onclick: () => m.openRef(r) }, r.label);
}

function resultLine(og: OpenGame): string {
  const r = userResult(og.game, og.userColor);
  const ending = og.imported.ending;
  const how = ending === 'checkmate' ? 'by checkmate' : ending === 'resignation' ? 'by resignation' : ending === 'timeout' ? 'on time' : ending === 'abandoned' ? 'by abandonment' : '';
  return r === 'win' ? `You won ${how}` : r === 'loss' ? `You lost ${how}` : 'Draw';
}

function stepInfo(m: ReviewMode, og: OpenGame): HTMLElement {
  const i = og.step - 1;
  const box = h('div', { class: 'rv-step' });
  const nav = h('div', { class: 'controls' },
    h('button', { type: 'button', class: 'btn small', onclick: () => m.goTo(0), disabled: og.step === 0, 'aria-label': 'Start' }, '⏮'),
    h('button', { type: 'button', class: 'btn small', onclick: () => m.goTo(og.step - 1), disabled: og.step === 0, 'aria-label': 'Previous move' }, '◀'),
    h('button', { type: 'button', class: 'btn small', onclick: () => m.goTo(og.step + 1), disabled: og.step >= og.imported.moves.length, 'aria-label': 'Next move' }, '▶'),
    h('button', { type: 'button', class: 'btn small', onclick: () => m.goTo(og.imported.moves.length), disabled: og.step >= og.imported.moves.length, 'aria-label': 'End' }, '⏭'),
  );
  box.append(nav);
  if (i < 0) {
    box.append(h('p', { class: 'muted small' }, 'Start position. Use ◀ ▶ or the arrow keys to step through, or click the graph.'));
    return box;
  }
  const mv = og.imported.moves[i];
  const a = og.analysis?.moves[i];
  const head = h('div', { class: 'explain-head' }, h('span', { class: 'explain-move' }, plyLabel({ ...mv, by: 'user' })), h('span', { class: 'who' }, mv.color === og.userColor ? 'You' : 'Opponent'));
  if (a) head.append(h('span', { class: `badge cls-${classSlug(a.classification)}` }, a.classification), h('span', { class: 'eval' }, formatEval(a.evalAfter)));
  if (a?.spent != null) head.append(h('span', { class: 'muted small' }, `${a.spent}s`));
  box.append(head);
  if (a && m.isUserMistake(i)) {
    box.append(h('p', { class: 'walk-better' }, `Better was ${a.bestSan} (${formatEval(a.evalBefore)}).`));
    const e = a.explanation;
    if (e?.details.length) box.append(h('ul', { class: 'details' }, ...e.details.map((d) => h('li', {}, d))));
    box.append(h('button', { type: 'button', class: 'btn small', onclick: () => m.toggleBetter(), 'aria-pressed': og.showBetter ? 'true' : 'false' }, og.showBetter ? 'Show the game position' : 'Show the better move'));
  }
  return box;
}

function accuracyTable(og: OpenGame): HTMLElement {
  const s = og.summary!;
  const opp = og.userColor === 'w' ? 'b' : 'w';
  const row = (name: string, side: 'w' | 'b') => {
    const st = s.review.stats[side];
    return h('tr', {},
      h('th', { scope: 'row' }, name),
      h('td', { class: 'acc' }, pct(st.accuracy)),
      ...CLASSES.map((c) => h('td', { class: st.counts[c] ? `cnt cls-${classSlug(c)}` : 'cnt zero' }, String(st.counts[c]))),
      h('td', {}, cp(st.acpl)),
    );
  };
  return h('table', { class: 'review-table' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Accuracy'), ...CLASSES.map((c) => h('th', { title: c }, SHORT[c])), h('th', { title: 'Average centipawn loss' }, 'ACPL'))),
    h('tbody', {}, row('You', og.userColor), row('Opponent', opp)),
  );
}

function gameView(m: ReviewMode): Element[] {
  const og = m.current!;
  const g = og.game;
  const me = og.userColor === 'w' ? g.white : g.black;
  const opp = og.userColor === 'w' ? g.black : g.white;
  const out: Element[] = [
    h('button', { type: 'button', class: 'link', onclick: () => m.back() }, '← All games'),
    h('h3', { class: 'rv-title' }, `You (${colorName(og.userColor)}, ${me.rating}) vs ${opp.username} (${opp.rating})`),
    h('p', { class: 'small' }, `${resultLine(og)} · ${timeControl(g)} · ${date(g.end_time)} · `, h('a', { href: g.url, target: '_blank', rel: 'noopener' }, 'View on Chess.com')),
  ];
  if (og.opening) {
    const o = og.opening;
    const left = o.leftAt === null ? 'The whole game stayed in known theory.'
      : `${o.leftBy === og.userColor ? 'You' : 'Your opponent'} left theory with ${plyLabel({ ...og.imported.moves[o.leftAt], by: 'user' })}${o.bookMoves.length ? `; book move${o.bookMoves.length > 1 ? 's' : ''}: ${o.bookMoves.join(', ')}` : ''}.`;
    out.push(h('p', { class: 'small' }, h('strong', {}, `${o.name} (${o.eco}). `), left));
  }

  const job = m.queue.jobs.find((j) => j.url === g.url && (j.status === 'queued' || j.status === 'running'));
  if (!og.summary) {
    out.push(
      job
        ? h('p', { class: 'muted' }, job.status === 'running' ? `Analyzing… position ${job.done} of ${job.total}` : 'Queued for analysis…')
        : h('div', {}, h('p', { class: 'muted' }, 'This game has not been analyzed yet.'), h('button', { type: 'button', class: 'btn primary', onclick: () => m.analyze([g]) }, 'Analyze this game')),
    );
    out.push(stepInfo(m, og));
    return out;
  }
  const s = og.summary;
  out.push(accuracyTable(og));
  out.push(h('p', { class: 'muted small' },
    'Accuracy uses the formula in the README (win-chance based, like Lichess), so it will not match Chess.com’s number.',
    g.accuracies ? ` Chess.com’s own figures for this game: you ${g.accuracies[og.userColor === 'w' ? 'white' : 'black']}, opponent ${g.accuracies[og.userColor === 'w' ? 'black' : 'white']}.` : ''));
  out.push(evalGraph({ review: s.review, cursor: og.step, onSeek: (n) => m.goTo(n), marks: s.swings }));
  out.push(stepInfo(m, og));

  out.push(h('h3', {}, 'Key moments'));
  if (!s.keyMoments.length) out.push(h('p', { class: 'muted' }, 'No inaccuracies, mistakes or blunders from you in this game.'));
  else if (s.keyMoments.length < REVIEW_CONFIG.keyMoments.min) out.push(h('p', { class: 'muted small' }, `Only ${s.keyMoments.length} move${s.keyMoments.length === 1 ? '' : 's'} of yours lost ground in this game.`));
  out.push(
    h('ol', { class: 'moments' },
      ...s.keyMoments.map((k) => {
        const canPuzzle = !!m.puzzleFor(k.index);
        const saved = m.isSaved(k.index);
        return h('li', { class: 'moment' },
          h('div', { class: 'moment-head' },
            h('span', { class: 'explain-move' }, plyLabel(k.ply)),
            h('span', { class: `badge cls-${classSlug(k.classification)}` }, k.classification),
            h('span', { class: 'muted small' }, `−${Math.round(k.winDrop)}% win chance`),
            k.missedChance ? h('span', { class: 'tag tag-missed' }, 'Missed chance') : null),
          k.bestSan ? h('p', { class: 'moment-better' }, `Better was ${k.bestSan} (${k.bestEval}).`) : null,
          h('p', { class: 'moment-reason' }, k.reason),
          k.tip ? h('p', { class: 'moment-tip' }, h('span', { class: 'lesson-label' }, 'Tip'), k.tip) : null,
          h('div', { class: 'moment-actions' },
            h('button', { type: 'button', class: 'btn small', onclick: () => m.showMoment(k.index) }, 'Show on board'),
            h('button', { type: 'button', class: 'btn small', onclick: () => m.playFrom(k.index) }, 'Play from here'),
            h('button', { type: 'button', class: 'btn small', onclick: () => m.saveAsPuzzle(k.index), disabled: !canPuzzle || saved, title: canPuzzle ? '' : 'Needs an opponent move before it' }, saved ? 'Saved as puzzle ✓' : 'Save as puzzle'),
          ),
        );
      }),
    ),
  );
  if (s.goodMoments.length) {
    out.push(h('h3', {}, 'Where you played well'));
    out.push(h('ul', { class: 'rv-good' }, ...s.goodMoments.map((gm) =>
      h('li', {}, h('button', { type: 'button', class: 'link', onclick: () => m.goTo(gm.index + 1) }, plyLabel({ ...og.imported.moves[gm.index], by: 'user' })),
        ` found the only good move (${(Math.min(gm.gap, 1000) / 100).toFixed(1)} pawns better than the next best). ${gm.idea}`))));
  }

  out.push(h('h3', {}, 'By phase'));
  out.push(h('div', { class: 'phases' }, ...s.review.phases.map((p) =>
    h('div', { class: 'phase' }, h('span', { class: 'phase-name' }, p.phase[0].toUpperCase() + p.phase.slice(1)),
      h('span', { class: 'phase-bar' }, h('span', { style: `width:${Math.round(p.accuracy ?? 0)}%` })),
      h('span', { class: 'phase-acc', title: `${p.moves} moves, ${Math.round(p.acpl ?? 0)} centipawns lost per move` }, `${cp(p.acpl)} cp`)))));
  out.push(h('p', { class: 'muted small' }, 'Bar = accuracy; number = your average centipawn loss per move in that phase.'));

  if (s.time) {
    const t = s.time;
    out.push(h('h3', {}, 'Clock'));
    const lines: (string | HTMLElement)[] = [];
    if (t.troubleFrom !== null) lines.push(`You were in time trouble (under ${REVIEW_CONFIG.timeTroubleSec} s) from ${plyLabel({ ...og.imported.moves[t.troubleFrom], by: 'user' })}: ${t.troubleMoves} moves, ${t.troubleErrors} mistake${t.troubleErrors === 1 ? '' : 's'} or blunder${t.troubleErrors === 1 ? '' : 's'}.`);
    else lines.push(`You were never under ${REVIEW_CONFIG.timeTroubleSec} s.`);
    out.push(h('p', { class: 'small' }, ...lines));
    if (t.longThinkErrors.length) {
      out.push(h('p', { class: 'small' }, 'Long thinks that still went wrong: ',
        ...t.longThinkErrors.flatMap((x, j) => [j ? ', ' : '', h('button', { type: 'button', class: 'link', onclick: () => m.showMoment(x.index) }, `${plyLabel({ ...og.imported.moves[x.index], by: 'user' })} (${Math.round(x.spent)} s)`)])));
    }
  }
  return out;
}

// ---------------------------------------------------------------- patterns

function recordRow(name: string, r: Record3): HTMLElement {
  return h('tr', {}, h('th', { scope: 'row' }, name), h('td', {}, String(r.games)), h('td', {}, `${r.wins}–${r.draws}–${r.losses}`), h('td', {}, pct(r.score)), h('td', {}, pct(r.accuracy)));
}

function patternsView(m: ReviewMode): HTMLElement[] {
  const { patterns: p, analyzed, total } = m.patterns();
  const out: HTMLElement[] = [h('p', { class: 'small' }, `Based on ${analyzed} analyzed game${analyzed === 1 ? '' : 's'} matching your filters (of ${total} loaded). Analyze more games for firmer numbers.`)];
  if (!analyzed) {
    out.push(h('p', { class: 'muted' }, 'No analyzed games match these filters yet. Go to Games and analyze some first.'));
    return out;
  }
  out.push(h('h3', {}, 'Top weaknesses'));
  if (!p.weaknesses.length) out.push(h('p', { class: 'muted' }, 'No clear pattern yet.'));
  out.push(h('ol', { class: 'moments' }, ...p.weaknesses.slice(0, 3).map((w) =>
    h('li', { class: `moment${w.tooSmall ? ' too-small' : ''}` },
      h('div', { class: 'moment-head' }, h('strong', {}, w.title), w.tooSmall ? h('span', { class: 'tag tag-missed' }, 'Too few to call') : null),
      h('p', {}, w.detail),
      h('p', { class: 'muted small' }, `Based on ${w.evidence}.${w.tooSmall ? ` Fewer than ${REVIEW_CONFIG.minSample} instances, so treat this as a hint, not a pattern.` : ''}`),
      w.examples.length ? h('p', { class: 'small' }, 'Examples: ', ...w.examples.flatMap((r, j) => [j ? ' · ' : '', refLink(m, r)])) : null,
    ))));

  const recTable = (rows: [string, Record3][]) => h('table', { class: 'review-table rv-rec' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Games'), h('th', {}, 'W–D–L'), h('th', {}, 'Score'), h('th', {}, 'Accuracy'))),
    h('tbody', {}, ...rows.filter(([, r]) => r.games).map(([n, r]) => recordRow(n, r))));
  out.push(h('h3', {}, 'Results'));
  out.push(recTable([['As White', p.byColor.w], ['As Black', p.byColor.b], ...Object.entries(p.byTimeClass).map(([k, r]) => [k[0].toUpperCase() + k.slice(1), r] as [string, Record3])]));

  out.push(h('h3', {}, 'Openings'));
  for (const c of ['w', 'b'] as const) {
    const rows = p.openings[c];
    if (!rows.length) continue;
    out.push(h('table', { class: 'review-table rv-rec' },
      h('thead', {}, h('tr', {}, h('th', {}, `As ${colorName(c)}`), h('th', {}, 'Games'), h('th', {}, 'Score'), h('th', { title: 'Your average centipawn loss' }, 'ACPL'))),
      h('tbody', {}, ...rows.map((o) => h('tr', {}, h('th', { scope: 'row' }, o.name), h('td', {}, String(o.games)), h('td', {}, pct(o.score)), h('td', {}, cp(o.acpl)))))));
  }

  out.push(h('h3', {}, 'Where you lose points'));
  out.push(h('div', { class: 'phases' }, ...p.phases.filter((x) => x.moves).map((x) =>
    h('div', { class: 'phase' }, h('span', { class: 'phase-name' }, x.phase[0].toUpperCase() + x.phase.slice(1)),
      h('span', { class: 'phase-bar loss' }, h('span', { style: `width:${Math.min(100, Math.round((x.acpl ?? 0) / 1.5))}%` })),
      h('span', { class: 'phase-acc', title: `${x.moves} moves` }, `${cp(x.acpl)} cp`)))));
  if (p.mistakeTypes.length) {
    out.push(h('p', { class: 'small' }, `Of your ${p.errors} inaccuracies, mistakes and blunders, the coach detected:`));
    out.push(h('ul', { class: 'details' }, ...p.mistakeTypes.map((t) => h('li', {}, `${MISTAKE_LABELS[t.kind] ? t.label[0].toUpperCase() + t.label.slice(1) : t.label}: ${t.count}`, t.count < REVIEW_CONFIG.minSample ? h('span', { class: 'muted small' }, ' (too few to call)') : null))));
  }
  if (p.timeTrouble) {
    const { under, over } = p.timeTrouble;
    out.push(h('h3', {}, 'Time trouble'));
    const bl = (n: number) => `${n} blunder${n === 1 ? '' : 's'}`;
    out.push(h('p', { class: 'small' }, `Under ${REVIEW_CONFIG.timeTroubleSec} s: ${bl(under.blunders)} in ${under.moves} moves (${under.moves ? Math.round((under.blunders / under.moves) * 100) : 0}%). With more time: ${bl(over.blunders)} in ${over.moves} (${over.moves ? Math.round((over.blunders / over.moves) * 100) : 0}%).`,
      under.moves < REVIEW_CONFIG.minSample ? ' Too few moves under time pressure to call.' : ''));
  }
  return out;
}

// ---------------------------------------------------------------- panel

export function renderReviewPanel(el: HTMLElement, m: ReviewMode): void {
  el.replaceChildren();
  el.append(h('h2', {}, 'Review your Chess.com games'), usernameForm(m));
  if (m.error) el.append(h('p', { class: 'status bad' }, m.error));
  if (!m.prefs.username) {
    el.append(h('p', { class: 'muted small' }, 'Enter a Chess.com username to load its public games. Nothing is sent anywhere except requests to Chess.com; games and analysis are stored only in this browser.'));
  } else {
    const tab = (id: 'games' | 'patterns', text: string) => h('button', {
      type: 'button',
      class: `btn small${m.view === id || (id === 'games' && m.view === 'game') ? ' primary' : ''}`,
      onclick: () => {
        m.view = id;
        m.setFilters({});
      },
    }, text);
    el.append(h('div', { class: 'pz-tabs rv-tabs' }, tab('games', 'Games'), tab('patterns', 'Patterns')));
    const body = h('div', { class: 'rv-body' });
    body.append(...(m.view === 'game' && m.current ? gameView(m) : m.view === 'patterns' ? patternsView(m) : gamesView(m)));
    el.append(body);
    el.append(
      h('div', { class: 'controls rv-privacy' },
        h('button', { type: 'button', class: 'btn small', onclick: () => void m.clearCache() }, 'Clear analysis cache'),
        h('button', { type: 'button', class: 'btn small', onclick: () => void m.forget() }, 'Forget this username and all cached analysis'),
      ),
    );
  }
  el.append(h('p', { class: 'pz-credit' }, 'Games from the ', h('a', { href: 'https://www.chess.com/news/view/published-data-api', target: '_blank', rel: 'noopener' }, 'Chess.com Published-Data API'), '. Openings from the Lichess chess-openings dataset (CC0).'));
}
