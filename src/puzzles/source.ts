/**
 * Where the next puzzle comes from. Each mode is a PuzzleSource, so a new mode
 * (e.g. a timed rush) only needs a new source plus its own UI.
 */
import { fromRecord } from './parse';
import { bandsToTry, pickPuzzle } from './select';
import { reviewQueue, type PuzzleStats } from './store';
import type { Puzzle, PuzzleIndex, PuzzleRecord } from './types';

export interface PuzzleSource {
  /** Whether results change the player's rating. */
  readonly rated: boolean;
  next(): Promise<Puzzle | null>;
}

/** Fetches public/puzzles/<band>.json on demand and caches it. */
export class PuzzleLibrary {
  private index: Promise<PuzzleIndex> | null = null;
  private bandCache = new Map<number, Promise<Puzzle[]>>();

  constructor(private baseUrl: string) {}

  getIndex(): Promise<PuzzleIndex> {
    this.index ??= fetch(`${this.baseUrl}puzzles/index.json`).then((r) => {
      if (!r.ok) throw new Error(`could not load the puzzle index (HTTP ${r.status})`);
      return r.json();
    });
    return this.index;
  }

  band(band: number): Promise<Puzzle[]> {
    let p = this.bandCache.get(band);
    if (!p) {
      p = fetch(`${this.baseUrl}puzzles/${band}.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`could not load puzzles for ${band} (HTTP ${r.status})`);
          return r.json() as Promise<PuzzleRecord[]>;
        })
        .then((records) => records.map(fromRecord));
      p.catch(() => this.bandCache.delete(band));
      this.bandCache.set(band, p);
    }
    return p;
  }
}

/** Puzzles near your rating (or a chosen band), optionally of one theme. Rated. */
export class RatedSource implements PuzzleSource {
  readonly rated = true;
  constructor(private lib: PuzzleLibrary, private stats: () => PuzzleStats, private random = Math.random) {}

  async next(): Promise<Puzzle | null> {
    const s = this.stats();
    const index = await this.lib.getIndex();
    const { band, theme } = s.prefs;
    const target = band === 'auto' ? s.rating : band + 50;
    const bands = index.bands.filter((b) => theme === 'all' || (b.themes[theme] ?? 0) > 0).map((b) => b.band);
    // A manual band only widens if it has nothing left.
    const order = bandsToTry(target, bands.length ? bands : index.bands.map((b) => b.band));
    const recent = new Set(s.recent);
    const solved = new Set(s.solved);
    for (const exclude of [new Set([...recent, ...solved]), recent]) {
      for (const b of order) {
        const pick = pickPuzzle(await this.lib.band(b), { target, exclude, theme, random: this.random });
        if (pick) return pick;
      }
    }
    return null;
  }
}

/** Puzzles you failed, oldest-due first. Unrated. */
export class ReviewSource implements PuzzleSource {
  readonly rated = false;
  constructor(private stats: () => PuzzleStats) {}

  async next(): Promise<Puzzle | null> {
    const item = reviewQueue(this.stats())[0];
    return item ? fromRecord(item.puzzle) : null;
  }
}
