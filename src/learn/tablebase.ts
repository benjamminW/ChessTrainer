/**
 * Lichess tablebase client (https://tablebase.lichess.ovh, positions with 7 pieces or fewer).
 *
 * GET /standard?fen=<FEN> returns JSON: the position's `category` for the side to move
 * ("win", "draw", "loss", "cursed-win", "blessed-loss", "maybe-win", "maybe-loss", "unknown"),
 * `dtz`/`dtm`, and `moves` — every legal move with the category *for the opponent* after it.
 * It sends `Access-Control-Allow-Origin: *`. Lichess asks for one request at a time and a full
 * minute's pause after a 429, which this client does. Answers are cached in IndexedDB.
 */
import type { KeyValueStore } from '../review/cache';

export type TbCategory = 'win' | 'loss' | 'draw' | 'cursed-win' | 'blessed-loss' | 'maybe-win' | 'maybe-loss' | 'unknown';
export type Outcome = 'win' | 'draw' | 'loss';

export interface TbMove {
  uci: string;
  san: string;
  /** This move gives checkmate. */
  checkmate: boolean;
  /** For the side to move after this move (the opponent). */
  category: TbCategory;
  dtz: number | null;
  dtm: number | null;
}

export interface TbResult {
  /** For the side to move. */
  category: TbCategory;
  dtz: number | null;
  dtm: number | null;
  checkmate: boolean;
  stalemate: boolean;
  moves: TbMove[];
}

export const TABLEBASE_URL = 'https://tablebase.lichess.ovh/standard';
export const MAX_PIECES = 7;

export class TablebaseUnavailable extends Error {}

/**
 * What a category means in practice. Cursed wins and blessed losses are draws under the
 * 50-move rule; "maybe" results are rounded to the likely side. Unknown → null.
 */
export function outcomeOf(c: TbCategory): Outcome | null {
  if (c === 'win' || c === 'maybe-win') return 'win';
  if (c === 'loss' || c === 'maybe-loss') return 'loss';
  if (c === 'draw' || c === 'cursed-win' || c === 'blessed-loss') return 'draw';
  return null;
}

const flip = (o: Outcome | null): Outcome | null => (o === 'win' ? 'loss' : o === 'loss' ? 'win' : o);

/** The result for the player who makes this move. */
export function moverOutcome(m: TbMove): Outcome | null {
  return flip(outcomeOf(m.category));
}

const RANK: Record<Outcome, number> = { win: 2, draw: 1, loss: 0 };
/** Moves to the end of the game (a mating move counts as 0). */
const dist = (m: TbMove) => (m.checkmate ? 0 : Math.abs(m.dtm ?? m.dtz ?? 0));

/**
 * The best move for the side to move: a win if there is one (the fastest), else a draw, else the
 * loss that lasts longest. This is how the tablebase opponent plays in Practice.
 */
export function bestTbMove(r: TbResult): TbMove | null {
  const scored = r.moves.filter((m) => moverOutcome(m) !== null);
  if (!scored.length) return r.moves[0] ?? null;
  return scored.reduce((best, m) => {
    const a = RANK[moverOutcome(m)!];
    const b = RANK[moverOutcome(best)!];
    if (a !== b) return a > b ? m : best;
    if (moverOutcome(m) === 'win') return dist(m) < dist(best) ? m : best;
    if (moverOutcome(m) === 'loss') return dist(m) > dist(best) ? m : best;
    return best;
  });
}

/** Cache key: the FEN without the full-move number (it doesn't change the result). */
const keyOf = (fen: string) => fen.split(' ').slice(0, 5).join(' ');

export interface TablebaseOptions {
  fetch?: typeof fetch;
  store?: KeyValueStore<TbResult>;
  /** Pause after a 429 (Lichess asks for a full minute). */
  backoffMs?: number;
  now?: () => number;
}

export class TablebaseClient {
  private chain: Promise<unknown> = Promise.resolve();
  private blockedUntil = 0;
  private fetchFn: typeof fetch;

  constructor(private o: TablebaseOptions = {}) {
    this.fetchFn = o.fetch ?? ((...a) => fetch(...a));
  }

  /** The tablebase answer for a position, from the cache or the API. Throws TablebaseUnavailable on failure. */
  async probe(fen: string): Promise<TbResult> {
    const key = keyOf(fen);
    const cached = await this.o.store?.get(key).catch(() => undefined);
    if (cached) return cached;
    // One request at a time, as Lichess asks.
    const run = this.chain.then(() => this.fetchOne(fen, key));
    this.chain = run.catch(() => {});
    return run;
  }

  private async fetchOne(fen: string, key: string): Promise<TbResult> {
    const now = this.o.now?.() ?? Date.now();
    if (now < this.blockedUntil) throw new TablebaseUnavailable('The tablebase asked us to slow down; trying again in a minute.');
    let res: Response;
    try {
      res = await this.fetchFn(`${TABLEBASE_URL}?fen=${encodeURIComponent(fen)}`);
    } catch (e) {
      throw new TablebaseUnavailable(`The tablebase can't be reached (${e instanceof Error ? e.message : String(e)}).`);
    }
    if (res.status === 429) {
      this.blockedUntil = now + (this.o.backoffMs ?? 60_000);
      throw new TablebaseUnavailable('The tablebase asked us to slow down; trying again in a minute.');
    }
    if (!res.ok) throw new TablebaseUnavailable(`The tablebase answered HTTP ${res.status}.`);
    const raw = (await res.json()) as Record<string, unknown>;
    const result = parseResult(raw);
    await this.o.store?.put(key, result).catch(() => {});
    return result;
  }
}

function parseResult(raw: Record<string, unknown>): TbResult {
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  const moves = Array.isArray(raw.moves) ? raw.moves : [];
  return {
    category: (raw.category as TbCategory) ?? 'unknown',
    dtz: num(raw.dtz),
    dtm: num(raw.dtm),
    checkmate: raw.checkmate === true,
    stalemate: raw.stalemate === true,
    moves: moves.map((m: Record<string, unknown>) => ({
      uci: String(m.uci),
      san: String(m.san),
      category: (m.category as TbCategory) ?? 'unknown',
      checkmate: m.checkmate === true,
      dtz: num(m.dtz),
      dtm: num(m.dtm),
    })),
  };
}

/** Plain-English result for the side to move ("White wins", "Draw", …). */
export function outcomeText(o: Outcome | null, sideToMove: 'w' | 'b'): string {
  if (o === null) return 'Unknown';
  if (o === 'draw') return 'Draw';
  const winner = (o === 'win') === (sideToMove === 'w') ? 'White' : 'Black';
  return `${winner} wins`;
}
