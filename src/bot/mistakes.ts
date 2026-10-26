import { Chess } from 'chess.js';
import { VALUE, hangingPieces, isHanging, other } from '../coach/facts';
import { uciOf } from '../game/session';

export type MistakeKind = 'hangs-piece' | 'bad-capture' | 'ignores-threat';

export interface MistakeCandidate {
  uci: string;
  kind: MistakeKind;
}

/**
 * Legal moves that look like the mistakes beginners actually make:
 *  - hangs-piece: moves a piece (knight or better) to a square where it can be won;
 *  - bad-capture: grabs a defended pawn/piece with a more valuable piece;
 *  - ignores-threat: one of our pieces is hanging and this move does nothing about it.
 * The caller verifies with a shallow engine search that each actually loses material.
 */
export function findPlausibleMistakes(fen: string): MistakeCandidate[] {
  const chess = new Chess(fen);
  const me = chess.turn();
  const threatened = hangingPieces(chess, me, 3);
  const out: MistakeCandidate[] = [];

  for (const m of chess.moves({ verbose: true })) {
    const after = new Chess(m.after);
    if (after.isCheckmate()) continue; // never "accidentally" deliver mate as a mistake
    const uci = uciOf(m);

    if (m.piece !== 'k' && VALUE[m.piece] >= 3 && isHanging(after, m.to)) {
      out.push({ uci, kind: m.captured ? 'bad-capture' : 'hangs-piece' });
      continue;
    }
    if (m.captured && VALUE[m.captured] < VALUE[m.piece] && after.attackers(m.to, other(me)).length > 0 && m.piece !== 'k') {
      out.push({ uci, kind: 'bad-capture' });
      continue;
    }
    if (
      threatened.length > 0 &&
      !threatened.some((t) => t.square === m.from) &&
      threatened.every((t) => isHanging(after, t.square)) &&
      !after.isCheck()
    ) {
      out.push({ uci, kind: 'ignores-threat' });
    }
  }
  return out;
}
