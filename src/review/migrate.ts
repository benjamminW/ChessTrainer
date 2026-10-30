/**
 * Upgrades cached Review-mode analyses without re-running the engine:
 *   1 → 2: centipawn classes become win-probability classes. Version 1 stored the best and
 *          second-best gap, so Great can be recomputed; Brilliant needs an engine search and is
 *          only added by re-analyzing ("Analyze deeper").
 *   2 → 3: the stored game accuracy is recomputed with Lichess's weighted method (gameAccuracy).
 */
import { gameAccuracy } from '../coach/gameReview';
import { boardFacts, classifyMove, winDrop } from '../coach/moveClass';
import { winPercent } from '../coach/ratingMoves';
import { bookPrefix, type OpeningBook } from './openings';
import type { ImportedGame } from './pgn';
import type { GameAnalysis } from './types';

export const ANALYSIS_VERSION = 3;

export function migrateAnalysis(a: GameAnalysis, game: ImportedGame, book: OpeningBook | null): GameAnalysis {
  if (a.version >= ANALYSIS_VERSION) return a;
  const classed = a.version >= 2 ? a : migrateClasses(a, game, book);
  return { ...classed, accuracy: storedAccuracy(classed, game), version: ANALYSIS_VERSION };
}

/** Game accuracy for both sides from the stored evals (null when the analysis is incomplete). */
export function storedAccuracy(a: GameAnalysis, game: ImportedGame): GameAnalysis['accuracy'] {
  if (!a.moves.length || a.moves.length !== game.moves.length) return a.accuracy;
  const win = [winPercent(a.moves[0].evalBefore), ...a.moves.map((m) => winPercent(m.evalAfter))];
  return gameAccuracy(win, game.moves[0].color);
}

function migrateClasses(a: GameAnalysis, game: ImportedGame, book: OpeningBook | null): GameAnalysis {
  const inBook = book ? bookPrefix(book, game.moves) : 0;
  const moves = a.moves.map((m, i) => {
    const ply = game.moves[i];
    if (!ply) return m;
    const s = ply.color === 'w' ? 1 : -1;
    const bestCp = m.evalBefore * s;
    const playedCp = m.evalAfter * s;
    const isEngineBest = m.bestUci === ply.uci;
    const prev = game.moves[i - 1] ?? null;
    const classification = classifyMove({
      bestCp,
      playedCp,
      secondCp: m.gap === null ? null : bestCp - m.gap,
      isEngineBest,
      inBook: i < inBook,
      ...boardFacts(ply, prev),
    });
    return { ...m, classification, winDrop: isEngineBest ? 0 : winDrop(bestCp, playedCp) };
  });
  return { ...a, moves, version: 2 };
}
