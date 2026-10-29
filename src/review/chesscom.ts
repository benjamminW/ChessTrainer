/**
 * Client for the Chess.com Published-Data API (https://www.chess.com/news/view/published-data-api).
 * Public data only, no keys. Verified Oct 2026:
 *   GET /pub/player/{user}/games/archives → { archives: [monthly archive URLs, oldest first] }
 *   GET /pub/player/{user}/games/{YYYY}/{MM} → { games: [{ url, pgn, time_control, time_class, rules,
 *       end_time, rated, accuracies?, white: { username, rating, result }, black: {…} }] }
 *   Unknown user → 404. CORS: access-control-allow-origin: *.
 * Chess.com allows serial requests freely but may answer parallel ones with 429, so requests
 * here are strictly one at a time, with backoff on 429.
 */

const API = 'https://api.chess.com/pub/player/';

export interface ChessComPlayer {
  username: string;
  rating: number;
  /** 'win', 'checkmated', 'resigned', 'timeout', 'agreed', 'repetition', 'stalemate', … */
  result: string;
}

export interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  time_class: 'bullet' | 'blitz' | 'rapid' | 'daily' | string;
  rules: string;
  end_time: number;
  rated?: boolean;
  accuracies?: { white: number; black: number };
  white: ChessComPlayer;
  black: ChessComPlayer;
}

export class ChessComError extends Error {
  constructor(
    message: string,
    readonly kind: 'not-found' | 'rate-limited' | 'network' | 'http',
  ) {
    super(message);
  }
}

export interface ClientOptions {
  fetch?: typeof fetch;
  /** Waits between 429 retries (ms); the Retry-After header wins when present. */
  backoffMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class ChessComClient {
  private queue: Promise<unknown> = Promise.resolve();
  private fetchFn: typeof fetch;
  private backoff: number[];
  private sleep: (ms: number) => Promise<void>;

  constructor(o: ClientOptions = {}) {
    this.fetchFn = o.fetch ?? ((...a) => fetch(...a));
    this.backoff = o.backoffMs ?? [2000, 4000, 8000];
    this.sleep = o.sleep ?? defaultSleep;
  }

  /** Runs requests strictly one after another. */
  private serial<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => {});
    return next;
  }

  private getJson<T>(url: string, what: string): Promise<T> {
    return this.serial(async () => {
      for (let attempt = 0; ; attempt++) {
        let res: Response;
        try {
          res = await this.fetchFn(url);
        } catch {
          throw new ChessComError("Couldn't reach Chess.com. Check your internet connection and try again.", 'network');
        }
        if (res.status === 404) throw new ChessComError(`Chess.com has no ${what}.`, 'not-found');
        if (res.status === 429) {
          if (attempt >= this.backoff.length) {
            throw new ChessComError('Chess.com is rate-limiting requests right now. Wait a minute and try again.', 'rate-limited');
          }
          const retryAfter = Number(res.headers.get('retry-after'));
          await this.sleep(retryAfter > 0 ? retryAfter * 1000 : this.backoff[attempt]);
          continue;
        }
        if (!res.ok) throw new ChessComError(`Chess.com returned an error (HTTP ${res.status}).`, 'http');
        return (await res.json()) as T;
      }
    });
  }

  /** Monthly archive URLs, newest first. */
  async archives(username: string): Promise<string[]> {
    const u = encodeURIComponent(username.trim().toLowerCase());
    const data = await this.getJson<{ archives: string[] }>(`${API}${u}/games/archives`, `player called "${username}"`);
    return [...data.archives].reverse();
  }

  async month(archiveUrl: string): Promise<ChessComGame[]> {
    const data = await this.getJson<{ games: ChessComGame[] }>(archiveUrl, 'games for that month');
    return data.games ?? [];
  }
}

/** "2026/10" from an archive URL, for labels and cache keys. */
export function archiveMonth(url: string): string {
  return url.split('/games/')[1] ?? url;
}

/** Whether a monthly archive is finished (an earlier month than now), so it can be cached forever. */
export function isPastMonth(url: string, now = new Date()): boolean {
  const [y, m] = archiveMonth(url).split('/').map(Number);
  return y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m < now.getUTCMonth() + 1);
}
