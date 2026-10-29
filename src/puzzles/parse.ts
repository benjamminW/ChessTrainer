import type { Puzzle, PuzzleRecord } from './types';

/** Columns of lichess_db_puzzle.csv (verified against the 2 Oct 2026 export). */
export const CSV_COLUMNS = [
  'PuzzleId', 'FEN', 'Moves', 'Rating', 'RatingDeviation', 'Popularity', 'NbPlays', 'Themes', 'GameUrl', 'OpeningTags', 'DailyDate',
] as const;

/** Parses one data row of the Lichess CSV. Fields never contain commas, so a plain split is safe. */
export function parseCsvRow(line: string, header: readonly string[] = CSV_COLUMNS): Puzzle {
  const f = line.split(',');
  const col = (name: string) => f[header.indexOf(name)] ?? '';
  return {
    id: col('PuzzleId'),
    fen: col('FEN'),
    moves: col('Moves').split(' ').filter(Boolean),
    rating: Number(col('Rating')),
    themes: col('Themes').split(' ').filter(Boolean),
  };
}

export function fromRecord([id, fen, moves, rating, themes]: PuzzleRecord): Puzzle {
  return { id, fen, moves: moves.split(' ').filter(Boolean), rating, themes: themes.split(' ').filter(Boolean) };
}

export function toRecord(p: Puzzle): PuzzleRecord {
  return [p.id, p.fen, p.moves.join(' '), p.rating, p.themes.join(' ')];
}
