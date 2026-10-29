/**
 * Patterns across analyzed games. Every number here is counted from cached analyses;
 * anything with fewer than REVIEW_CONFIG.minSample instances is flagged as too small to call.
 */
import type { Phase } from '../coach/facts';
import { BAD_CLASSES } from '../coach/classes';
import { REVIEW_CONFIG } from '../config/review';
import type { Color } from '../types';
import type { ChessComGame } from './chesscom';
import type { GameAnalysis } from './types';

export type UserResult = 'win' | 'draw' | 'loss';

export interface PatternEntry {
  game: ChessComGame;
  analysis: GameAnalysis;
}

/** A clickable example: a game and a ply index. */
export interface Ref {
  url: string;
  index: number;
  label: string;
}

export interface Record3 {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Score in % (win = 1, draw = ½). */
  score: number | null;
  accuracy: number | null;
}

export interface OpeningRow {
  name: string;
  games: number;
  score: number;
  /** Your average centipawn loss in these games. */
  acpl: number | null;
}

export interface MistakeType {
  kind: string;
  label: string;
  count: number;
  examples: Ref[];
}

export interface Weakness {
  title: string;
  /** The supporting numbers, in plain English. */
  detail: string;
  /** Instances behind the claim (what the minimum-sample rule is applied to). */
  count: number;
  /** Size of the population it's measured in. */
  sample: number;
  /** What was counted, e.g. "4 of 18 errors" or "6 errors in 41 middlegame moves". */
  evidence: string;
  tooSmall: boolean;
  examples: Ref[];
}

export interface Patterns {
  games: number;
  byColor: Record<Color, Record3>;
  byTimeClass: Record<string, Record3>;
  openings: Record<Color, OpeningRow[]>;
  phases: { phase: Phase; moves: number; acpl: number | null }[];
  /** Your inaccuracies, mistakes and blunders in these games. */
  errors: number;
  mistakeTypes: MistakeType[];
  timeTrouble: { under: { moves: number; blunders: number }; over: { moves: number; blunders: number } } | null;
  weaknesses: Weakness[];
}

export const MISTAKE_LABELS: Record<string, string> = {
  hangs: 'left a piece hanging',
  'allows-mate': 'allowed a mate',
  'allows-fork': 'allowed a fork',
  'allows-capture': 'allowed a capture',
  'missed-mate': 'missed a mate',
  'missed-capture': 'missed a free capture',
  'missed-fork': 'missed a fork',
  castling: 'gave up castling',
  material: 'lost material a few moves later',
};

const DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

export function userResult(g: ChessComGame, user: Color): UserResult {
  const me = user === 'w' ? g.white : g.black;
  if (me.result === 'win') return 'win';
  return DRAWS.has(me.result) ? 'draw' : 'loss';
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function record(entries: PatternEntry[]): Record3 {
  const r = { games: entries.length, wins: 0, draws: 0, losses: 0 };
  const key = { win: 'wins', draw: 'draws', loss: 'losses' } as const;
  for (const e of entries) r[key[userResult(e.game, e.analysis.userColor)]]++;
  const acc = entries.map((e) => e.analysis.accuracy[e.analysis.userColor]).filter((x): x is number => x !== null);
  return { ...r, score: r.games ? ((r.wins + r.draws / 2) / r.games) * 100 : null, accuracy: mean(acc) };
}

function myMoves(e: PatternEntry) {
  const first: Color = 'w';
  return e.analysis.moves
    .map((m, index) => ({ m, index, color: (index % 2 === 0 ? first : first === 'w' ? 'b' : 'w') as Color }))
    .filter((x) => x.color === e.analysis.userColor);
}

const refLabel = (e: PatternEntry, index: number) => {
  const opp = e.analysis.userColor === 'w' ? e.game.black.username : e.game.white.username;
  const n = Math.floor(index / 2) + 1;
  return `vs ${opp}, move ${n}${index % 2 ? '…' : '.'}`;
};

export function computePatterns(entries: PatternEntry[], minSample = REVIEW_CONFIG.minSample): Patterns {
  const byColor = { w: record(entries.filter((e) => e.analysis.userColor === 'w')), b: record(entries.filter((e) => e.analysis.userColor === 'b')) };
  const classes = [...new Set(entries.map((e) => e.game.time_class))];
  const byTimeClass = Object.fromEntries(classes.map((c) => [c, record(entries.filter((e) => e.game.time_class === c))]));

  // Openings (grouped by the family name before ':')
  const openings = { w: [] as OpeningRow[], b: [] as OpeningRow[] };
  for (const color of ['w', 'b'] as Color[]) {
    const groups = new Map<string, PatternEntry[]>();
    for (const e of entries) {
      if (e.analysis.userColor !== color || !e.analysis.opening) continue;
      const fam = e.analysis.opening.name.split(':')[0];
      groups.set(fam, [...(groups.get(fam) ?? []), e]);
    }
    openings[color] = [...groups]
      .map(([name, es]) => ({
        name,
        games: es.length,
        score: record(es).score ?? 0,
        acpl: mean(es.flatMap((e) => myMoves(e).map((x) => x.m.cpLoss))),
      }))
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
      .slice(0, 5);
  }

  // Phases
  const phaseLoss = new Map<Phase, number[]>();
  const kindRefs = new Map<string, Ref[]>();
  let errors = 0;
  const tt = { under: { moves: 0, blunders: 0 }, over: { moves: 0, blunders: 0 } };
  let anyClock = false;
  for (const e of entries) {
    for (const { m, index } of myMoves(e)) {
      phaseLoss.set(m.phase, [...(phaseLoss.get(m.phase) ?? []), m.cpLoss]);
      if (BAD_CLASSES.includes(m.classification)) {
        errors++;
        for (const k of m.explanation?.kinds ?? []) kindRefs.set(k, [...(kindRefs.get(k) ?? []), { url: e.game.url, index, label: refLabel(e, index) }]);
      }
      if (m.clockBefore !== null) {
        anyClock = true;
        const bucket = m.clockBefore < REVIEW_CONFIG.timeTroubleSec ? tt.under : tt.over;
        bucket.moves++;
        if (m.classification === 'Blunder') bucket.blunders++;
      }
    }
  }
  const phases = (['opening', 'middlegame', 'endgame'] as Phase[]).map((p) => ({ phase: p, moves: phaseLoss.get(p)?.length ?? 0, acpl: mean(phaseLoss.get(p) ?? []) }));
  const mistakeTypes = [...kindRefs]
    .map(([kind, refs]) => ({ kind, label: MISTAKE_LABELS[kind] ?? kind, count: refs.length, examples: refs.slice(-2) }))
    .sort((a, b) => b.count - a.count);

  const patterns: Patterns = {
    games: entries.length,
    byColor,
    byTimeClass,
    openings,
    phases,
    errors,
    mistakeTypes,
    timeTrouble: anyClock ? tt : null,
    weaknesses: [],
  };
  patterns.weaknesses = weaknesses(patterns, entries, minSample);
  return patterns;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Candidate weaknesses, each tied to counted data; the top 3 that clear the sample size come first. */
function weaknesses(p: Patterns, entries: PatternEntry[], minSample: number): Weakness[] {
  const out: Weakness[] = [];

  for (const t of p.mistakeTypes) {
    out.push({
      title: `You ${t.label}`,
      detail: `${t.count} of your ${p.errors} inaccuracies, mistakes and blunders (${pct(t.count, p.errors)}%) ${t.label}.`,
      count: t.count,
      sample: p.errors,
      evidence: `${t.count} of ${p.errors} errors`,
      tooSmall: t.count < minSample,
      examples: t.examples,
    });
  }

  const allMoves = p.phases.reduce((s, x) => s + x.moves, 0);
  const allAcpl = allMoves ? p.phases.reduce((s, x) => s + (x.acpl ?? 0) * x.moves, 0) / allMoves : null;
  const worst = p.phases.filter((x) => x.acpl !== null && x.moves > 0).sort((a, b) => b.acpl! - a.acpl!)[0];
  if (worst && allAcpl && worst.acpl! >= allAcpl * 1.25) {
    // Evidence = your errors in that phase; the worst ones are the examples.
    const errs: { ref: Ref; loss: number }[] = [];
    for (const e of entries) {
      for (const { m, index } of myMoves(e)) {
        if (m.phase === worst.phase && BAD_CLASSES.includes(m.classification)) errs.push({ ref: { url: e.game.url, index, label: refLabel(e, index) }, loss: m.cpLoss });
      }
    }
    out.push({
      title: `Your ${worst.phase} costs you the most`,
      detail: `You lose ${Math.round(worst.acpl!)} centipawns per move in the ${worst.phase}, versus ${Math.round(allAcpl)} on average.`,
      count: errs.length,
      sample: worst.moves,
      evidence: `${errs.length} error${errs.length === 1 ? '' : 's'} in ${worst.moves} ${worst.phase} moves`,
      tooSmall: errs.length < minSample,
      examples: errs.sort((a, b) => b.loss - a.loss).slice(0, 2).map((x) => x.ref),
    });
  }

  if (p.timeTrouble) {
    const { under, over } = p.timeTrouble;
    const ru = under.moves ? under.blunders / under.moves : 0;
    const ro = over.moves ? over.blunders / over.moves : 0;
    if (under.blunders > 0 && ru > ro * 1.5) {
      const refs: Ref[] = [];
      for (const e of entries) for (const { m, index } of myMoves(e)) if (m.clockBefore !== null && m.clockBefore < REVIEW_CONFIG.timeTroubleSec && m.classification === 'Blunder') refs.push({ url: e.game.url, index, label: refLabel(e, index) });
      out.push({
        title: 'You blunder in time trouble',
        detail: `With under ${REVIEW_CONFIG.timeTroubleSec} s left you blundered ${under.blunders} of ${under.moves} moves (${pct(under.blunders, under.moves)}%), versus ${over.blunders} of ${over.moves} (${pct(over.blunders, over.moves)}%) with more time.`,
        count: under.blunders,
        sample: under.moves,
        evidence: `${under.blunders} blunder${under.blunders === 1 ? '' : 's'} in ${under.moves} moves under ${REVIEW_CONFIG.timeTroubleSec} s`,
        tooSmall: under.blunders < minSample,
        examples: refs.slice(-2),
      });
    }
  }

  for (const color of ['w', 'b'] as Color[]) {
    const bad = p.openings[color].filter((o) => o.score < 40).sort((a, b) => a.score - b.score)[0];
    if (!bad) continue;
    const es = entries.filter((e) => e.analysis.userColor === color && e.analysis.opening?.name.split(':')[0] === bad.name);
    out.push({
      title: `The ${bad.name} as ${color === 'w' ? 'White' : 'Black'}`,
      detail: `You score ${Math.round(bad.score)}% in it (${bad.games} games${bad.acpl !== null ? `, ${Math.round(bad.acpl)} centipawns lost per move` : ''}).`,
      count: bad.games,
      sample: bad.games,
      evidence: `${bad.games} game${bad.games === 1 ? '' : 's'}`,
      tooSmall: bad.games < minSample,
      examples: es.slice(0, 2).map((e) => ({ url: e.game.url, index: 0, label: refLabel(e, 0) })),
    });
  }

  // Strongest evidence first; anything too small to call goes last.
  return out.sort((a, b) => Number(a.tooSmall) - Number(b.tooSmall) || b.count - a.count);
}
