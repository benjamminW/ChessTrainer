/**
 * Spaced repetition for repertoire moves (a small SM-2 variant). Each of your moves is a card:
 * playing it right from memory pushes the next review further out (1 day, 3 days, then the
 * interval times the card's ease); a miss brings it back today and makes it come back sooner.
 */
import { REPS_CONFIG } from '../config/repertoire';

export interface Card {
  /** When it's next due (ISO time). */
  due: string;
  /** Days until the next review after the last success (0 = learning). */
  interval: number;
  ease: number;
  /** Successes in a row. */
  reps: number;
  lapses: number;
  /** Last reviewed (ISO time). */
  last?: string;
}

const DAY = 86_400_000;

/** A move you were just shown: due again in a few minutes, to check you remember it. */
export function introduce(now = new Date()): Card {
  return { due: new Date(now.getTime() + REPS_CONFIG.relearnMinutes * 60_000).toISOString(), interval: 0, ease: REPS_CONFIG.startEase, reps: 0, lapses: 0, last: now.toISOString() };
}

/** The card after a review: right (from memory, first try) or wrong. */
export function grade(card: Card | undefined, ok: boolean, now = new Date()): Card {
  const c: Card = card ? { ...card } : introduce(now);
  c.last = now.toISOString();
  if (!ok) {
    c.lapses++;
    c.reps = 0;
    c.interval = 0;
    c.ease = Math.max(REPS_CONFIG.minEase, c.ease - 0.2);
    c.due = new Date(now.getTime() + REPS_CONFIG.relearnMinutes * 60_000).toISOString();
    return c;
  }
  c.reps++;
  c.interval = c.reps === 1 ? 1 : c.reps === 2 ? 3 : Math.max(c.interval + 1, Math.round(c.interval * c.ease));
  c.interval = Math.min(c.interval, REPS_CONFIG.maxIntervalDays);
  c.ease = Math.min(REPS_CONFIG.maxEase, c.ease + 0.05);
  // Due at the start of the day, so reviews don't depend on the hour you trained.
  const due = new Date(now.getTime() + c.interval * DAY);
  due.setHours(4, 0, 0, 0);
  c.due = due.toISOString();
  return c;
}

export function isDue(card: Card | undefined, now = new Date()): boolean {
  return !!card && Date.parse(card.due) <= now.getTime();
}

/** Learned: answered right at least once since the last miss. */
export function isLearned(card: Card | undefined): boolean {
  return !!card && card.reps > 0;
}

/** "in 3 days", "tomorrow", "now". */
export function dueText(card: Card, now = new Date()): string {
  const ms = Date.parse(card.due) - now.getTime();
  if (ms <= 0) return 'now';
  if (ms < 3_600_000) return `in ${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < DAY) return `in ${Math.round(ms / 3_600_000)} h`;
  const days = Math.round(ms / DAY);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}
