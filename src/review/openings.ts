/**
 * Opening names and "where you left theory", from the Lichess chess-openings dataset (CC0),
 * bundled as public/openings.json by scripts/build-openings.mjs.
 */
import { Chess, type Color } from 'chess.js';
import { lineToSan } from '../coach/facts';
import { parseUci } from '../game/session';

export type OpeningLine = [eco: string, name: string, uci: string];

export interface OpeningBook {
  /** Named positions (end of a dataset line). */
  named: Map<string, { eco: string; name: string }>;
  /** Every position on any book line, with the book moves played from it. */
  next: Map<string, Set<string>>;
}

/** Position key without move counters, so transpositions match. */
export function posKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function buildBook(lines: OpeningLine[]): OpeningBook {
  const named = new Map<string, { eco: string; name: string }>();
  const next = new Map<string, Set<string>>();
  for (const [eco, name, ucis] of lines) {
    const chess = new Chess();
    for (const uci of ucis.split(' ').filter(Boolean)) {
      const key = posKey(chess.fen());
      if (!next.has(key)) next.set(key, new Set());
      next.get(key)!.add(uci);
      chess.move(parseUci(uci));
    }
    const end = posKey(chess.fen());
    if (!next.has(end)) next.set(end, new Set());
    named.set(end, { eco, name });
  }
  return { named, next };
}

export interface OpeningInfo {
  eco: string;
  name: string;
  /** Index of the first move that left known theory (null if the game never left it). */
  leftAt: number | null;
  /** Who played that move. */
  leftBy: Color | null;
  /** Book moves (SAN) that were available instead. */
  bookMoves: string[];
}

/** Opening name (deepest named position reached) and where the game left the book. */
export function identifyOpening(book: OpeningBook, moves: { uci: string; color: Color; fenBefore: string; fenAfter: string }[]): OpeningInfo | null {
  let named: { eco: string; name: string } | null = null;
  let leftAt: number | null = null;
  for (let i = 0; i < moves.length; i++) {
    const before = posKey(moves[i].fenBefore);
    const after = posKey(moves[i].fenAfter);
    if (!book.next.get(before)?.has(moves[i].uci) && !book.next.has(after)) {
      leftAt = i;
      break;
    }
    named = book.named.get(after) ?? named;
  }
  if (!named) return null;
  const left = leftAt === null ? null : moves[leftAt];
  return {
    ...named,
    leftAt,
    leftBy: left?.color ?? null,
    bookMoves: left ? [...(book.next.get(posKey(left.fenBefore)) ?? [])].slice(0, 3).map((u) => lineToSan(left.fenBefore, [u])[0]).filter(Boolean) : [],
  };
}

/** How many moves from the start are still book moves (Book applies to these plies only). */
export function bookPrefix(book: OpeningBook, moves: { uci: string; fenBefore: string; fenAfter: string }[]): number {
  let n = 0;
  for (const m of moves) {
    if (!book.next.get(posKey(m.fenBefore))?.has(m.uci) && !book.next.has(posKey(m.fenAfter))) break;
    n++;
  }
  return n;
}

let linesPromise: Promise<OpeningLine[]> | null = null;
let bookPromise: Promise<OpeningBook> | null = null;

/** The raw dataset rows, loaded once (Learn's opening drills use the names and ECO codes). */
export function loadOpeningLines(baseUrl: string): Promise<OpeningLine[]> {
  linesPromise ??= fetch(`${baseUrl}openings.json`).then((r) => {
    if (!r.ok) throw new Error(`could not load openings (HTTP ${r.status})`);
    return r.json() as Promise<OpeningLine[]>;
  });
  linesPromise.catch(() => (linesPromise = null));
  return linesPromise;
}

/** Loads and indexes the dataset once (only when Review mode needs it). */
export function loadBook(baseUrl: string): Promise<OpeningBook> {
  bookPromise ??= loadOpeningLines(baseUrl).then(buildBook);
  bookPromise.catch(() => (bookPromise = null));
  return bookPromise;
}
