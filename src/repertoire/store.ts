/** Repertoires in localStorage. */
import { read, write } from '../game/persistence';
import type { Repertoire } from './tree';

const KEY = 'chess-coach:reps:v1';

export interface RepStore {
  version: 1;
  reps: Repertoire[];
  /** Repertoire opened last. */
  lastId: string | null;
}

export function loadReps(): RepStore {
  const s = read<RepStore>(KEY);
  return s && s.version === 1 && Array.isArray(s.reps) ? s : { version: 1, reps: [], lastId: null };
}

export function saveReps(s: RepStore): void {
  write(KEY, s);
}
