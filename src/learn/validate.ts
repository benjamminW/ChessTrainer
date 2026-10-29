/**
 * Schema checks for lessons: shape, ids, legal positions and moves. Runs in the unit tests
 * and at the start of scripts/verify-lessons.mjs (which then checks the chess with an engine).
 */
import { Chess, validateFen } from 'chess.js';
import { playableFen } from '../game/position';
import type { Lesson, LessonStep } from './types';

const SECTIONS = ['openings', 'middlegame', 'endgames'];
const COLORS = ['green', 'red', 'blue', 'yellow'];
const SQUARE = /^[a-h][1-8]$/;

/** Problems with one lesson, as readable strings (empty = valid). */
export function lessonProblems(l: Lesson): string[] {
  const out: string[] = [];
  const at = (i: number) => `${l.id} step ${i + 1}`;
  if (!/^[a-z0-9-]+$/.test(l.id ?? '')) out.push(`bad id "${l.id}" (lowercase letters, digits and dashes)`);
  if (!SECTIONS.includes(l.section)) out.push(`${l.id}: unknown section "${l.section}"`);
  if (!l.title?.trim()) out.push(`${l.id}: missing title`);
  if (!l.summary?.trim()) out.push(`${l.id}: missing summary`);
  if (typeof l.order !== 'number') out.push(`${l.id}: missing order`);
  if (!Array.isArray(l.steps) || !l.steps.length) out.push(`${l.id}: no steps`);
  (l.steps ?? []).forEach((s, i) => out.push(...stepProblems(s).map((p) => `${at(i)}: ${p}`)));
  return out;
}

function stepProblems(s: LessonStep): string[] {
  const out: string[] = [];
  const fenOk = validateFen(s.fen ?? '');
  if (!fenOk.ok) return [`invalid FEN (${fenOk.error})`];
  if (s.type === 'explain') {
    if (!s.text?.trim()) out.push('missing text');
    if (s.line) {
      const c = new Chess();
      try {
        for (const u of s.line.split(' ')) c.move(u);
        if (c.fen().split(' ').slice(0, 4).join(' ') !== s.fen.split(' ').slice(0, 4).join(' ')) out.push(`line "${s.line}" doesn't reach the FEN (it reaches ${c.fen()})`);
      } catch {
        out.push(`line "${s.line}" has an illegal move`);
      }
    }
    for (const a of s.arrows ?? []) {
      if (!SQUARE.test(a.from) || !SQUARE.test(a.to)) out.push(`bad arrow ${a.from}-${a.to}`);
      if (a.color && !COLORS.includes(a.color)) out.push(`bad arrow color ${a.color}`);
    }
    for (const q of s.squares ?? []) {
      if (!SQUARE.test(q.sq)) out.push(`bad square ${q.sq}`);
      if (q.color && !COLORS.includes(q.color)) out.push(`bad square color ${q.color}`);
    }
  } else if (s.type === 'try') {
    const p = playableFen(s.fen);
    if (!p.ok) return [`position not playable (${p.error})`];
    if (!s.prompt?.trim() || !s.hint?.trim() || !s.success?.trim()) out.push('prompt, hint and success are required');
    const legal = new Chess(s.fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''));
    if (!legal.includes(s.solution)) out.push(`solution ${s.solution} is not legal`);
  } else if (s.type === 'practice') {
    const p = playableFen(s.fen);
    if (!p.ok) return [`position not playable (${p.error})`];
    if (!s.prompt?.trim()) out.push('missing prompt');
    if (s.userColor !== 'w' && s.userColor !== 'b') out.push('userColor must be w or b');
    if (s.goal !== 'win' && s.goal !== 'draw') out.push('goal must be win or draw');
  } else if (s.type === 'drill') {
    if (!s.prompt?.trim()) out.push('missing prompt');
    if (s.side !== 'w' && s.side !== 'b') out.push('side must be w or b');
    if (!s.lines?.length) out.push('no lines');
    for (const line of s.lines ?? []) {
      const c = new Chess();
      try {
        for (const u of line.split(' ')) c.move(u);
      } catch {
        out.push(`line "${line}" has an illegal move`);
      }
    }
    for (const key of Object.keys(s.notes ?? {})) {
      if (!(s.lines ?? []).some((l) => (l + ' ').startsWith(key + ' '))) out.push(`note "${key}" isn't on any line`);
    }
  } else {
    out.push(`unknown step type "${(s as { type: string }).type}"`);
  }
  return out;
}

/** Problems across all lessons (each lesson's, plus duplicate ids). */
export function allProblems(lessons: Lesson[]): string[] {
  const out = lessons.flatMap(lessonProblems);
  const seen = new Set<string>();
  for (const l of lessons) {
    if (seen.has(l.id)) out.push(`duplicate lesson id "${l.id}"`);
    seen.add(l.id);
  }
  return out;
}

/** Pieces on the board (for choosing the tablebase: 7 or fewer). */
export function pieceCount(fen: string): number {
  return fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;
}
