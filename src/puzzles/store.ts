/** Puzzle progress in localStorage: rating, history, solved/recent IDs, the review queue and filters. */
import { read, write } from '../game/persistence';
import { toRecord } from './parse';
import { RATING_CONFIG, ratingChange } from './rating';
import type { Outcome, Puzzle, PuzzleRecord } from './types';

const KEY = 'chess-coach:puzzles:v1';

export const STORE_CONFIG = {
  /** How many recently seen puzzle IDs are never served again soon. */
  recentLimit: 200,
  historyLimit: 500,
  /** A failed puzzle comes back for review after this many more rated puzzles... */
  reviewDelay: 10,
  /** ...and, if failed again in review, after this many. */
  reviewRetryDelay: 20,
};

export interface HistoryEntry {
  id: string;
  result: Outcome;
  /** Rating change (0 for assisted or review attempts). */
  change: number;
  /** Your rating after this attempt. */
  rating: number;
  puzzleRating: number;
  /** ISO date-time. */
  date: string;
  review?: boolean;
}

export interface ReviewItem {
  puzzle: PuzzleRecord;
  /** Due once `ratedPlayed` reaches this. */
  dueAt: number;
  attempts: number;
}

export interface PuzzlePrefs {
  /** 'auto' = near your rating, or a band start like 1400. */
  band: 'auto' | number;
  /** 'all' or a Lichess theme tag. */
  theme: string;
  /** Which source serves the next puzzle (a timed rush could be added here). */
  source: 'rated' | 'review';
}

export interface PuzzleStats {
  rating: number;
  /** Rated attempts so far (drives the provisional K-factor and review timing). */
  ratedPlayed: number;
  history: HistoryEntry[];
  solved: string[];
  recent: string[];
  review: ReviewItem[];
  prefs: PuzzlePrefs;
}

export function newStats(): PuzzleStats {
  return {
    rating: RATING_CONFIG.start,
    ratedPlayed: 0,
    history: [],
    solved: [],
    recent: [],
    review: [],
    prefs: { band: 'auto', theme: 'all', source: 'rated' },
  };
}

export function loadStats(): PuzzleStats {
  const s = read<Partial<PuzzleStats>>(KEY);
  const base = newStats();
  return s ? { ...base, ...s, prefs: { ...base.prefs, ...s.prefs } } : base;
}

export function saveStats(s: PuzzleStats): void {
  write(KEY, s);
}

const pushCapped = (list: string[], id: string, cap: number) => {
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  list.push(id);
  if (list.length > cap) list.splice(0, list.length - cap);
};

/** Marks a puzzle as seen (served), so it isn't repeated soon. */
export function markSeen(s: PuzzleStats, id: string): void {
  pushCapped(s.recent, id, STORE_CONFIG.recentLimit);
}

/**
 * Records the result of an attempt and returns the rating change.
 * Review attempts are unrated: you've already seen the solution.
 */
export function recordResult(s: PuzzleStats, p: Puzzle, outcome: Outcome, fromReview: boolean, now = new Date()): number {
  const change = fromReview ? 0 : ratingChange(s.rating, p.rating, outcome, s.ratedPlayed);
  if (!fromReview) {
    s.rating += change;
    s.ratedPlayed++;
  }
  s.history.push({
    id: p.id, result: outcome, change, rating: s.rating, puzzleRating: p.rating, date: now.toISOString(),
    ...(fromReview ? { review: true } : {}),
  });
  if (s.history.length > STORE_CONFIG.historyLimit) s.history.splice(0, s.history.length - STORE_CONFIG.historyLimit);
  markSeen(s, p.id);

  const queued = s.review.findIndex((r) => r.puzzle[0] === p.id);
  if (outcome === 'failed') {
    if (!s.solved.includes(p.id) && queued < 0) {
      s.review.push({ puzzle: toRecord(p), dueAt: s.ratedPlayed + STORE_CONFIG.reviewDelay, attempts: 0 });
    } else if (queued >= 0) {
      s.review[queued].attempts++;
      s.review[queued].dueAt = s.ratedPlayed + STORE_CONFIG.reviewRetryDelay;
    }
  } else {
    if (!s.solved.includes(p.id)) s.solved.push(p.id);
    // Solving it (even with a hint) in review clears it from the queue.
    if (queued >= 0 && fromReview) s.review.splice(queued, 1);
  }
  return change;
}

/** Review items in the order they should come back: due ones first, earliest due first. */
export function reviewQueue(s: PuzzleStats): ReviewItem[] {
  return [...s.review].sort((a, b) => a.dueAt - b.dueAt);
}

export function dueCount(s: PuzzleStats): number {
  return s.review.filter((r) => r.dueAt <= s.ratedPlayed).length;
}

/** Most recent rated change, for the "recent change" display. */
export function lastChange(s: PuzzleStats): number | null {
  for (let i = s.history.length - 1; i >= 0; i--) if (!s.history[i].review) return s.history[i].change;
  return null;
}
