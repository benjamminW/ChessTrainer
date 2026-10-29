/**
 * Upgrades cached Review-mode analyses from version 1 (centipawn classes) to version 2
 * (win-probability classes) without re-running the engine. Version 1 stored the best and
 * second-best gap, so Great can be recomputed; Brilliant needs an engine search and is only
 * added by re-analyzing ("Analyze deeper").
 */
import { boardFacts, classifyMove, winDrop } from '../coach/moveClass';
import { bookPrefix, type OpeningBook } from './openings';
import type { ImportedGame } from './pgn';
import type { GameAnalysis } from './types';

export const ANALYSIS_VERSION = 2;

export function migrateAnalysis(a: GameAnalysis, game: ImportedGame, book: OpeningBook | null): GameAnalysis {
  if (a.version >= ANALYSIS_VERSION) return a;
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
  return { ...a, moves, version: ANALYSIS_VERSION };
}
