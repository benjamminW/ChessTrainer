/** Review → Learn: lessons for the phase your game's grades say was weakest (counted moves only). */
import type { PhaseStats } from '../coach/gameReview';
import type { Phase } from '../coach/facts';
import { LEARN_CONFIG } from '../config/learn';
import { isComplete, type LearnProgress } from './progress';
import { LESSONS } from './registry';
import type { Lesson, Section } from './types';

const SECTION_OF: Record<Phase, Section> = { opening: 'openings', middlegame: 'middlegame', endgame: 'endgames' };

export interface LessonSuggestion {
  phase: Phase;
  grade: string;
  counted: number;
  avgDrop: number;
  lessons: Lesson[];
}

/**
 * The weakest phase graded Inaccurate or Poor on enough counted moves, with up to
 * LEARN_CONFIG.suggestMax lessons from its section (unfinished ones first). Null when nothing qualifies.
 */
export function suggestLessons(phases: PhaseStats[], progress: LearnProgress, lessons: Lesson[] = LESSONS): LessonSuggestion | null {
  const weak = phases
    .filter((p) => (p.grade === 'Inaccurate' || p.grade === 'Poor') && p.counted >= LEARN_CONFIG.suggestMinMoves && p.avgDrop !== null)
    .filter((p) => lessons.some((l) => l.section === SECTION_OF[p.phase]))
    .sort((a, b) => b.avgDrop! - a.avgDrop!);
  const p = weak[0];
  if (!p) return null;
  const pool = lessons.filter((l) => l.section === SECTION_OF[p.phase]);
  const picked = [...pool.filter((l) => !isComplete(progress, l)), ...pool.filter((l) => isComplete(progress, l))].slice(0, LEARN_CONFIG.suggestMax);
  return { phase: p.phase, grade: p.grade!, counted: p.counted, avgDrop: p.avgDrop!, lessons: picked };
}
