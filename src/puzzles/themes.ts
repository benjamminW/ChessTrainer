import data from './themeNames.json';

/** Theme tags offered in the filter, in display order (shared with scripts/build-puzzles.mjs). */
export const FILTER_THEMES: string[] = data.filters;

const NAMES: Record<string, string> = data.names;

/** Plain-English name for a Lichess theme tag, e.g. 'backRankMate' → 'back rank mate'. */
export function themeName(tag: string): string {
  return NAMES[tag] ?? tag.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
}

/** Tags that only describe length or game phase, shown after the tactical ones. */
const SECONDARY = new Set(['short', 'long', 'veryLong', 'oneMove', 'opening', 'middlegame', 'endgame', 'advantage', 'crushing', 'equality', 'master', 'masterVsMaster', 'superGM']);

/** Theme names for display, tactical motifs first. */
export function describeThemes(tags: string[]): string[] {
  const primary = tags.filter((t) => !SECONDARY.has(t));
  const secondary = tags.filter((t) => SECONDARY.has(t));
  return [...primary, ...secondary].map(themeName);
}
