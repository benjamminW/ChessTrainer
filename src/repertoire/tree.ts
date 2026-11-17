/**
 * An opening repertoire: the moves you play and the replies you prepare for, stored by position
 * (FEN without the move counters) so transpositions share one entry. You keep one move per
 * position where it's your turn; the opponent can have any number of replies.
 */
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { parseUci, uciOf } from '../game/session';
import type { Color } from '../types';
import { posKey } from '../review/openings';
import type { Card } from './srs';

export interface RepMove {
  uci: string;
  san: string;
}

export interface Repertoire {
  id: string;
  name: string;
  /** The side you play. */
  color: Color;
  createdAt: string;
  /** Moves from each position, by position key. Opponent replies keep the order they were added in. */
  moves: Record<string, RepMove[]>;
  /** Spaced-repetition state of your moves, by the position key before the move. */
  cards: Record<string, Card>;
}

export const START_KEY = posKey(DEFAULT_POSITION);

/** A chess.js board for a position key. */
export function boardAt(key: string): Chess {
  return new Chess(`${key} 0 1`);
}

export const turnOf = (key: string) => key.split(' ')[1] as Color;

export function newRepertoire(name: string, color: Color, now = new Date()): Repertoire {
  return { id: `r${now.getTime().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, name: name.trim() || (color === 'w' ? 'White repertoire' : 'Black repertoire'), color, createdAt: now.toISOString(), moves: {}, cards: {} };
}

export type AddResult =
  | { ok: true; key: string; added: boolean }
  | { ok: false; reason: 'illegal' }
  | { ok: false; reason: 'conflict'; existing: RepMove };

/**
 * Adds one move from a position. Where it's your turn and you already have a different move,
 * it's refused (one move per position, so training knows what to expect).
 */
export function addMove(rep: Repertoire, key: string, uci: string): AddResult {
  const chess = boardAt(key);
  let m;
  try {
    m = chess.move(parseUci(uci));
  } catch {
    return { ok: false, reason: 'illegal' };
  }
  const move = { uci: uciOf(m), san: m.san };
  const after = posKey(chess.fen());
  const list = (rep.moves[key] ??= []);
  if (list.some((x) => x.uci === move.uci)) return { ok: true, key: after, added: false };
  if (turnOf(key) === rep.color && list.length) return { ok: false, reason: 'conflict', existing: list[0] };
  list.push(move);
  return { ok: true, key: after, added: true };
}

export interface AddLineResult {
  added: number;
  /** Lines cut short because you already had a different move somewhere along them. */
  conflicts: number;
}

/** Adds a line of UCI moves from the start; stops at an illegal move or a conflict. */
export function addLine(rep: Repertoire, ucis: string[], from = START_KEY): AddLineResult {
  let key = from;
  let added = 0;
  for (const uci of ucis) {
    const r = addMove(rep, key, uci);
    if (!r.ok) return { added, conflicts: r.reason === 'conflict' ? 1 : 0 };
    if (r.added) added++;
    key = r.key;
  }
  return { added, conflicts: 0 };
}

/** The position after a move. */
export function childKey(key: string, uci: string): string {
  const chess = boardAt(key);
  chess.move(parseUci(uci));
  return posKey(chess.fen());
}

/** Positions reachable from the start through the repertoire's moves. */
export function reachable(rep: Repertoire): Set<string> {
  const seen = new Set<string>([START_KEY]);
  const queue = [START_KEY];
  while (queue.length) {
    const key = queue.shift()!;
    for (const m of rep.moves[key] ?? []) {
      const next = childKey(key, m.uci);
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** Removes a move and everything that can no longer be reached without it (with their cards). */
export function removeMove(rep: Repertoire, key: string, uci: string): number {
  const list = rep.moves[key];
  if (!list) return 0;
  rep.moves[key] = list.filter((m) => m.uci !== uci);
  if (!rep.moves[key].length) delete rep.moves[key];
  return prune(rep);
}

/** Drops unreachable positions and cards that no longer belong to one of your moves. Returns moves removed. */
export function prune(rep: Repertoire): number {
  const live = reachable(rep);
  let removed = 0;
  for (const key of Object.keys(rep.moves)) {
    if (!live.has(key)) {
      removed += rep.moves[key].length;
      delete rep.moves[key];
    }
  }
  for (const key of Object.keys(rep.cards)) {
    if (!rep.moves[key]?.length || turnOf(key) !== rep.color) delete rep.cards[key];
  }
  return removed;
}

/** Positions where it's your turn and you have a move: one flashcard each. */
export function cardKeys(rep: Repertoire): string[] {
  const live = reachable(rep);
  return [...live].filter((k) => turnOf(k) === rep.color && rep.moves[k]?.length);
}

export function moveCount(rep: Repertoire): number {
  let n = 0;
  for (const k of reachable(rep)) n += rep.moves[k]?.length ?? 0;
  return n;
}

/** A line from the start to a leaf: its moves and the position before each. */
export interface Line {
  ucis: string[];
  keys: string[];
}

/** Every line through the repertoire, in the order moves were added (capped for huge trees). */
export function allLines(rep: Repertoire, cap = 5000): Line[] {
  const out: Line[] = [];
  const walk = (key: string, ucis: string[], keys: string[], onPath: Set<string>) => {
    if (out.length >= cap) return;
    const moves = (rep.moves[key] ?? []).filter((m) => !onPath.has(childKey(key, m.uci)));
    if (!moves.length) {
      if (ucis.length) out.push({ ucis, keys });
      return;
    }
    for (const m of moves) {
      const next = childKey(key, m.uci);
      onPath.add(next);
      walk(next, [...ucis, m.uci], [...keys, key], onPath);
      onPath.delete(next);
    }
  };
  walk(START_KEY, [], [], new Set([START_KEY]));
  return out;
}

/** Your-move positions along a line (the cards it trains). */
export function lineCards(rep: Repertoire, line: Line): string[] {
  return line.keys.filter((k) => turnOf(k) === rep.color);
}

/** SAN of a line from the start, with move numbers ("1. e4 e5 2. Nf3"). */
export function lineText(ucis: string[], from = DEFAULT_POSITION): string {
  const chess = new Chess(from);
  const parts: string[] = [];
  for (const uci of ucis) {
    const n = chess.moveNumber();
    const white = chess.turn() === 'w';
    let m;
    try {
      m = chess.move(parseUci(uci));
    } catch {
      break;
    }
    if (white) parts.push(`${n}. ${m.san}`);
    else parts.push(parts.length ? m.san : `${n}... ${m.san}`);
  }
  return parts.join(' ');
}

// ------------------------------------------------------------ PGN

export interface PgnImport {
  added: number;
  conflicts: number;
  /** Moves that couldn't be read or played. */
  errors: string[];
  games: number;
}

/**
 * Adds every move of a PGN, variations included, to the repertoire. Several games can be pasted
 * at once; comments, NAGs and annotations are ignored. Games set up from another position are skipped.
 */
export function importPgn(rep: Repertoire, pgn: string): PgnImport {
  const res: PgnImport = { added: 0, conflicts: 0, errors: [], games: 0 };
  const text = pgn.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
  // Split into games at header blocks; a game without headers is one game.
  const games: { headers: string; body: string }[] = [];
  let cur = { headers: '', body: '' };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      if (cur.body.trim()) {
        games.push(cur);
        cur = { headers: '', body: '' };
      }
      cur.headers += line + '\n';
    } else cur.body += ' ' + line;
  }
  if (cur.body.trim()) games.push(cur);

  for (const g of games) {
    if (/\[SetUp\s+"1"\]/i.test(g.headers) || /\[FEN\s+"/i.test(g.headers)) {
      const fen = /\[FEN\s+"([^"]+)"\]/i.exec(g.headers)?.[1];
      if (fen && posKey(fen) !== START_KEY) {
        res.errors.push('Skipped a game that starts from a set-up position.');
        continue;
      }
    }
    res.games++;
    const tokens = g.body.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').split(/\s+/).filter(Boolean);
    /** Current position; null after a move that couldn't be added (the rest of that line is skipped). */
    let key: string | null = START_KEY;
    /** Position before the last move: where a variation starts. */
    let prev: string | null = null;
    const stack: { key: string | null; prev: string | null }[] = [];
    /** Above 0: inside a variation that can't be placed (counts the brackets still open). */
    let skip = 0;
    for (const tok of tokens) {
      if (skip) {
        if (tok === '(') skip++;
        else if (tok === ')' && --skip === 0) ({ key, prev } = stack.pop()!);
        continue;
      }
      if (tok === '(') {
        stack.push({ key, prev });
        if (prev === null) skip = 1;
        else {
          key = prev;
          prev = null;
        }
        continue;
      }
      if (tok === ')') {
        const top = stack.pop();
        if (top) ({ key, prev } = top);
        continue;
      }
      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok) || /^\$\d+$/.test(tok) || /^\d+\.+$/.test(tok)) continue;
      const san = tok.replace(/^\d+\.+/, '').replace(/[!?]+/g, '');
      if (!san) continue;
      if (key === null) {
        prev = null; // a skipped move: later variations here can't be placed either
        continue;
      }
      let m;
      try {
        m = boardAt(key).move(san);
      } catch {
        if (res.errors.length < 5) res.errors.push(`Couldn't play "${tok}".`);
        prev = key;
        key = null;
        continue;
      }
      const r = addMove(rep, key, uciOf(m));
      if (!r.ok) {
        // The rest of this line hangs off a move you don't play; its variations are still read.
        if (r.reason === 'conflict') res.conflicts++;
        prev = key;
        key = null;
        continue;
      }
      if (r.added) res.added++;
      prev = key;
      key = r.key;
    }
  }
  return res;
}

/** The whole repertoire as one PGN game with variations (each position's moves written once). */
export function exportPgn(rep: Repertoire): string {
  const written = new Set<string>();
  const headers = [`[Event "${rep.name.replace(/"/g, "'")}"]`, `[Site "Chess Coach repertoire"]`, `[White "${rep.color === 'w' ? 'Me' : '?'}"]`, `[Black "${rep.color === 'b' ? 'Me' : '?'}"]`, '[Result "*"]'];
  const num = (chess: Chess, force: boolean) => (chess.turn() === 'w' ? `${chess.moveNumber()}. ` : force ? `${chess.moveNumber()}... ` : '');

  /** Moves from a position: the first is the main line, the rest become variations. */
  const write = (fen: string, force: boolean): string => {
    const key = posKey(fen);
    const moves = rep.moves[key];
    if (!moves?.length || written.has(key)) return '';
    written.add(key);
    const parts: string[] = [];
    const chess = new Chess(fen);
    const main = moves[0];
    const mainAfter = new Chess(fen);
    mainAfter.move(parseUci(main.uci));
    parts.push(num(chess, force) + main.san);
    for (const alt of moves.slice(1)) {
      const after = new Chess(fen);
      after.move(parseUci(alt.uci));
      const rest = write(after.fen(), false);
      parts.push(`(${num(chess, true)}${alt.san}${rest ? ' ' + rest : ''})`);
    }
    const rest = write(mainAfter.fen(), moves.length > 1);
    if (rest) parts.push(rest);
    return parts.join(' ');
  };
  const body = write(DEFAULT_POSITION, false);
  return `${headers.join('\n')}\n\n${body ? body + ' ' : ''}*\n`;
}
