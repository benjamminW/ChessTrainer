/** Learn progress in localStorage: per-lesson step results, completion and the last lesson opened. */
import { read, write } from '../game/persistence';
import type { Lesson } from './types';

const KEY = 'chess-coach:learn:v1';

export interface StepResult {
  /** Explain: read. Try: solved. Practice: goal reached. */
  done: boolean;
  /** Moves tried (Try) or games played (Practice). */
  attempts: number;
  /** Solved on the first attempt without hints (Try). */
  clean?: boolean;
}

export interface LessonProgress {
  steps: Record<number, StepResult>;
  /** Step to reopen at. */
  lastStep: number;
  completedAt?: string;
}

export interface LearnProgress {
  lessons: Record<string, LessonProgress>;
  lastOpened: string | null;
}

export function loadProgress(): LearnProgress {
  const p = read<LearnProgress>(KEY);
  return p && typeof p.lessons === 'object' ? p : { lessons: {}, lastOpened: null };
}

export function saveProgress(p: LearnProgress): void {
  write(KEY, p);
}

export function lessonProgress(p: LearnProgress, id: string): LessonProgress {
  return (p.lessons[id] ??= { steps: {}, lastStep: 0 });
}

/** Records a step's result; completes the lesson once every step is done. */
export function recordStep(p: LearnProgress, lesson: Lesson, index: number, r: Partial<StepResult> & { done: boolean }, now = new Date()): void {
  const lp = lessonProgress(p, lesson.id);
  const prev = lp.steps[index] ?? { done: false, attempts: 0 };
  lp.steps[index] = { ...prev, ...r, done: prev.done || r.done, attempts: r.attempts ?? prev.attempts };
  if (!lp.completedAt && lesson.steps.every((_, i) => lp.steps[i]?.done)) lp.completedAt = now.toISOString();
}

/** Share of a lesson's steps done, 0–1. */
export function lessonShare(p: LearnProgress, lesson: Lesson): number {
  const lp = p.lessons[lesson.id];
  if (!lp) return 0;
  return lesson.steps.filter((_, i) => lp.steps[i]?.done).length / lesson.steps.length;
}

export function isComplete(p: LearnProgress, lesson: Lesson): boolean {
  return !!p.lessons[lesson.id]?.completedAt;
}
