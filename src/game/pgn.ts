import { Chess, DEFAULT_POSITION } from 'chess.js';
import { formatEval } from '../coach/format';
import type { GameState, MoveReview } from '../types';
import { parseUci, resultOf } from './session';

function reviewComment(r: MoveReview): string {
  let c = `${r.classification} (${formatEval(r.evalAfter)})`;
  if (r.classification !== 'Best' && r.bestSan) c += `. Best was ${r.bestSan} (${formatEval(r.evalBefore)})`;
  return c;
}

/** PGN of the game, with each move's coach classification as a comment. */
export function exportPgn(state: GameState): string {
  const chess = new Chess(state.startFen);
  const result = (() => {
    const c = new Chess(state.startFen);
    for (const p of state.plies) c.move(parseUci(p.uci));
    return resultOf(c, state.resigned);
  })();

  const date = state.startedAt.slice(0, 10).replace(/-/g, '.');
  const bot = `Chess Coach (${state.elo})`;
  chess.setHeader('Event', 'Chess Coach game');
  chess.setHeader('Site', typeof location !== 'undefined' ? location.origin : '?');
  chess.setHeader('Date', date);
  chess.setHeader('White', state.userColor === 'w' ? 'You' : bot);
  chess.setHeader('Black', state.userColor === 'b' ? 'You' : bot);
  chess.setHeader('Result', result?.score ?? '*');
  if (state.startFen !== DEFAULT_POSITION) {
    chess.setHeader('SetUp', '1');
    chess.setHeader('FEN', state.startFen);
  }
  if (result) chess.setHeader('Termination', result.reason);
  chess.setHeader('Takebacks', String(state.takebacks));

  for (const p of state.plies) {
    chess.move(parseUci(p.uci));
    if (p.review) chess.setComment(reviewComment(p.review));
  }
  let pgn = chess.pgn({ maxWidth: 80 });
  // chess.js only writes the result token from the Result header when the game is over by rule.
  if (result && !pgn.trimEnd().endsWith(result.score)) pgn = pgn.trimEnd() + ' ' + result.score;
  return pgn + '\n';
}
