/**
 * Every lesson module under ./lessons/<section>/ is picked up here, so adding a lesson is just
 * adding a file (a default export of a Lesson). Sorted by section, then `order`.
 * (Vite expands this glob when it builds the module; a running dev server picks up new files itself.)
 */
import type { Lesson, Section } from './types';

const modules = import.meta.glob<Lesson>('./lessons/*/*.ts', { eager: true, import: 'default' });

export const SECTIONS: { id: Section; title: string; blurb: string }[] = [
  { id: 'openings', title: 'Openings', blurb: 'Plans and move orders for popular openings, with a drill.' },
  { id: 'middlegame', title: 'Middlegame', blurb: 'Concepts with engine-checked exercises.' },
  { id: 'endgames', title: 'Endgames', blurb: 'Essential technique, checked against the tablebase.' },
];

export const LESSONS: Lesson[] = Object.values(modules).sort(
  (a, b) => SECTIONS.findIndex((s) => s.id === a.section) - SECTIONS.findIndex((s) => s.id === b.section) || a.order - b.order,
);

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function lessonsIn(section: Section): Lesson[] {
  return LESSONS.filter((l) => l.section === section);
}
