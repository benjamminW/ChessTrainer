import { MATE_CP } from '../config/coach';

/** Served from public/engine/ (copied there by scripts/copy-engine.mjs). */
export const ENGINE_FILE = 'engine/stockfish-19-lite-single.js';

export interface PvLine {
  multipv: number;
  depth: number;
  /** Score in centipawns from the side to move's POV; mates mapped to ±(MATE_CP − N). */
  cp: number;
  /** Mate in N from side to move's POV (negative = getting mated), or null. */
  mate: number | null;
  pv: string[];
}

export interface Analysis {
  fen: string;
  depth: number;
  /** Sorted best first. */
  lines: PvLine[];
  bestmove: string | null;
}

export interface SearchOptions {
  depth: number;
  multiPv: number;
  /** Restrict the search to these UCI moves. */
  searchMoves?: string[];
  /**
   * Who asked ('play', 'review', …). `cancelAll(owner)` only cancels that owner's searches,
   * so starting a new game doesn't kill a Review-mode analysis sharing the same engine.
   */
  owner?: string;
}

export interface EngineOption {
  name: string;
  type: string;
  default?: string;
  min?: number;
  max?: number;
}

export class SearchCancelled extends Error {
  constructor() {
    super('search cancelled');
  }
}

interface Job {
  fen: string;
  opts: SearchOptions;
  resolve: (a: Analysis) => void;
  reject: (e: Error) => void;
  lines: Map<number, PvLine>;
  cancelled: boolean;
}

export function mateToCp(mate: number): number {
  return mate > 0 ? MATE_CP - mate : -MATE_CP - mate;
}

/** Parses one `info ... pv ...` line. Returns null for lines without a scored PV. */
export function parseInfo(line: string): PvLine | null {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null;
  const tok = line.split(' ');
  let depth = 0;
  let multipv = 1;
  let cp: number | null = null;
  let mate: number | null = null;
  let pv: string[] = [];
  for (let i = 1; i < tok.length; i++) {
    switch (tok[i]) {
      case 'depth': depth = +tok[++i]; break;
      case 'multipv': multipv = +tok[++i]; break;
      case 'score':
        if (tok[i + 1] === 'cp') cp = +tok[i + 2];
        else if (tok[i + 1] === 'mate') mate = +tok[i + 2];
        i += 2;
        break;
      case 'pv': pv = tok.slice(i + 1); i = tok.length; break;
    }
  }
  if (cp === null && mate === null) return null;
  return { depth, multipv, cp: mate !== null ? mateToCp(mate) : cp!, mate, pv };
}

/**
 * Stockfish running in a Web Worker, driven over UCI. Searches are queued and run
 * one at a time; `cancelAll(owner?)` drops queued searches and stops the running one
 * (all of them, or only those of one owner).
 */
export class Engine {
  private worker: Worker;
  private ready: Promise<EngineOption[]>;
  private queue: Job[] = [];
  private current: Job | null = null;
  private waiters: ((line: string) => boolean)[] = [];
  readonly options: EngineOption[] = [];
  name = '';

  constructor(baseUrl: string) {
    this.worker = new Worker(baseUrl + ENGINE_FILE);
    this.worker.onmessage = (e: MessageEvent) => this.onLine(String(e.data));
    const failed = new Promise<never>((_, reject) => {
      this.worker.onerror = (e) => {
        e.preventDefault();
        reject(new Error(`could not start Stockfish (${e.message || ENGINE_FILE + ' failed to load'})`));
      };
    });
    this.ready = Promise.race([
      failed,
      (async () => {
        this.send('uci');
        await this.waitFor((l) => l === 'uciok');
        await this.isReady();
        return this.options;
      })(),
    ]);
  }

  /** Resolves with the engine's advertised options once it's up. */
  init(): Promise<EngineOption[]> {
    return this.ready;
  }

  analyze(fen: string, opts: SearchOptions): Promise<Analysis> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, opts, resolve, reject, lines: new Map(), cancelled: false });
      void this.pump();
    });
  }

  cancelAll(owner?: string): void {
    const mine = (j: Job) => owner === undefined || j.opts.owner === owner;
    for (const j of this.queue) if (mine(j)) j.reject(new SearchCancelled());
    this.queue = this.queue.filter((j) => !mine(j));
    if (this.current && !this.current.cancelled && mine(this.current)) {
      this.current.cancelled = true;
      this.send('stop');
    }
  }

  terminate(): void {
    this.cancelAll();
    this.worker.terminate();
  }

  private send(cmd: string): void {
    this.worker.postMessage(cmd);
  }

  private waitFor(pred: (line: string) => boolean): Promise<string> {
    return new Promise((resolve) => {
      this.waiters.push((line) => {
        if (!pred(line)) return false;
        resolve(line);
        return true;
      });
    });
  }

  private async isReady(): Promise<void> {
    this.send('isready');
    await this.waitFor((l) => l === 'readyok');
  }

  private onLine(line: string): void {
    if (line.startsWith('id name ')) this.name = line.slice(8);
    else if (line.startsWith('option name ')) this.options.push(parseOption(line));

    const job = this.current;
    if (job) {
      const info = parseInfo(line);
      if (info) {
        const prev = job.lines.get(info.multipv);
        if (!prev || info.depth >= prev.depth) job.lines.set(info.multipv, info);
      }
    }
    this.waiters = this.waiters.filter((w) => !w(line));
  }

  private async pump(): Promise<void> {
    if (this.current) return;
    await this.ready;
    if (this.current) return;
    const job = this.queue.shift();
    if (!job) return;
    this.current = job;
    try {
      const { depth, multiPv, searchMoves } = job.opts;
      this.send(`setoption name MultiPV value ${multiPv}`);
      await this.isReady();
      this.send(`position fen ${job.fen}`);
      const done = this.waitFor((l) => l.startsWith('bestmove'));
      this.send(`go depth ${depth}` + (searchMoves?.length ? ` searchmoves ${searchMoves.join(' ')}` : ''));
      const bm = (await done).split(' ')[1];
      if (job.cancelled) {
        job.reject(new SearchCancelled());
      } else {
        // Keep only lines from the deepest completed iteration, so all lines are comparable.
        const all = [...job.lines.values()];
        const maxDepth = Math.max(0, ...all.map((l) => l.depth));
        const lines = all
          .filter((l) => l.depth >= maxDepth - 1 && l.pv.length > 0)
          .sort((a, b) => b.cp - a.cp);
        job.resolve({
          fen: job.fen,
          depth: maxDepth,
          lines,
          bestmove: bm && bm !== '(none)' ? bm : null,
        });
      }
    } catch (e) {
      job.reject(e as Error);
    } finally {
      this.current = null;
      void this.pump();
    }
  }
}

function parseOption(line: string): EngineOption {
  const m = line.match(/^option name (.+?) type (\S+)(.*)$/);
  if (!m) return { name: line, type: 'unknown' };
  const rest = m[3];
  const num = (k: string) => {
    const r = rest.match(new RegExp(` ${k} (-?\\d+)`));
    return r ? +r[1] : undefined;
  };
  const def = rest.match(/ default (\S*)/);
  return { name: m[1], type: m[2], default: def?.[1], min: num('min'), max: num('max') };
}
