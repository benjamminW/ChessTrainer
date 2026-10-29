/**
 * IndexedDB storage for Review mode (localStorage is too small for analyses):
 *   analyses — per-game analysis, keyed by game URL
 *   archives — monthly game lists for finished months (they never change)
 * All data stays in this browser.
 */
import type { ChessComGame } from './chesscom';
import type { GameAnalysis } from './types';

const DB = 'chess-coach-review';
const VERSION = 1;

export interface KeyValueStore<T> {
  get(key: string): Promise<T | undefined>;
  put(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ['analyses', 'archives']) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idbStore<T>(name: string): KeyValueStore<T> {
  const run = <R>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<R>): Promise<R> =>
    openDb().then(
      (db) =>
        new Promise<R>((resolve, reject) => {
          const req = fn(db.transaction(name, mode).objectStore(name));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        }),
    );
  return {
    get: (k) => run('readonly', (s) => s.get(k) as IDBRequest<T | undefined>),
    put: (k, v) => run('readwrite', (s) => s.put(v, k)).then(() => {}),
    delete: (k) => run('readwrite', (s) => s.delete(k)).then(() => {}),
    keys: () => run('readonly', (s) => s.getAllKeys()).then((ks) => ks.map(String)),
    clear: () => run('readwrite', (s) => s.clear()).then(() => {}),
  };
}

/** In-memory stand-in, for tests and browsers without IndexedDB (e.g. some private windows). */
export function memoryStore<T>(): KeyValueStore<T> {
  const m = new Map<string, T>();
  return {
    get: async (k) => m.get(k),
    put: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k),
    keys: async () => [...m.keys()],
    clear: async () => m.clear(),
  };
}

export interface ReviewStores {
  analyses: KeyValueStore<GameAnalysis>;
  archives: KeyValueStore<ChessComGame[]>;
}

export function openStores(): ReviewStores {
  if (typeof indexedDB === 'undefined') return { analyses: memoryStore(), archives: memoryStore() };
  return { analyses: idbStore('analyses'), archives: idbStore('archives') };
}

/**
 * Whether a cached analysis can be used as-is: same data format and at least as deep as asked.
 * A cached Deep result also serves Quick; asking for Deep re-analyzes a Quick one.
 */
export function cacheUsable(cached: GameAnalysis | undefined, depth: number, version: number): cached is GameAnalysis {
  return !!cached && cached.version === version && cached.depth >= depth;
}
