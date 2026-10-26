/**
 * Position-specific tactics and strategy tips for one side, derived with chess.js
 * (no engine needed, so they're instant). Shown in the Tips card.
 */
import { Chess, type Square } from 'chess.js';
import type { Color } from '../types';
import {
  NAME, VALUE, backRankWeak, castlingRights, fileStatus, findPins, forkTargets, gamePhase, hangingPieces,
  isHanging, matingMoves, other, pawnStructure, piecesOf, threatFen, type Phase,
} from './facts';

export interface Tip {
  kind: 'tactic' | 'strategy';
  title: string;
  text: string;
  /** Squares to circle on the board when the tip is selected. */
  squares: string[];
}

const MAX_TACTICS = 4;
const MAX_STRATEGY = 3;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function list(items: string[]): string {
  return items.length <= 1 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

/** Tactical motifs in the position, from `me`'s point of view. */
export function tacticalTips(fen: string, me: Color): Tip[] {
  const chess = new Chess(fen);
  const opp = other(me);
  const myTurn = chess.turn() === me;
  const tips: Tip[] = [];
  const add = (title: string, text: string, squares: string[]) =>
    tips.push({ kind: 'tactic', title, text, squares });

  if (myTurn && matingMoves(fen).length > 0) {
    const king = piecesOf(chess, opp).find((p) => p.type === 'k')!;
    add('Checkmate in one', 'One of your moves is checkmate right now. Go through every check.', [king.square]);
  }

  // Opponent's threat: what would they play if it were their move?
  if (myTurn) {
    const tf = threatFen(fen);
    const mate = tf ? matingMoves(tf)[0] : undefined;
    if (mate) add('Mate threat', `Your opponent threatens ${mate.san}, which is checkmate. Stop it before anything else.`, [mate.from, mate.to]);
  }

  for (const p of hangingPieces(chess, me).sort((a, b) => VALUE[b.type] - VALUE[a.type]).slice(0, 2)) {
    const defended = chess.attackers(p.square, me).length > 0;
    add(
      'Piece in danger',
      defended
        ? `Your ${NAME[p.type]} on ${p.square} is attacked by a cheaper piece. Defending it isn't enough; move it or counterattack.`
        : `Your ${NAME[p.type]} on ${p.square} is attacked and undefended.`,
      [p.square],
    );
  }

  if (myTurn) {
    const loose = hangingPieces(chess, opp).sort((a, b) => VALUE[b.type] - VALUE[a.type])[0];
    if (loose) add('Loose piece', `The ${NAME[loose.type]} on ${loose.square} isn't safely defended. Can you win it?`, [loose.square]);
  }

  for (const pin of findPins(chess, me).slice(0, 1)) {
    const abs = pin.target.type === 'k';
    add(
      'Pin',
      `Your ${NAME[pin.pinner.type]} pins the ${NAME[pin.pinned.type]} on ${pin.pinned.square} to the ${NAME[pin.target.type]}. ` +
        (abs ? "It can't legally move, so pile up on it." : `If it moves, the ${NAME[pin.target.type]} is exposed.`),
      [pin.pinner.square, pin.pinned.square, pin.target.square],
    );
  }
  for (const pin of findPins(chess, opp).slice(0, 1)) {
    add(
      'You are pinned',
      `Your ${NAME[pin.pinned.type]} on ${pin.pinned.square} is pinned to your ${NAME[pin.target.type]} by the ${NAME[pin.pinner.type]} on ${pin.pinner.square}. ` +
        'Break the pin or make sure it can’t be attacked again.',
      [pin.pinner.square, pin.pinned.square, pin.target.square],
    );
  }

  if (myTurn) {
    // A fork where the forking piece is safe on its square.
    const fork = chess.moves({ verbose: true }).find((m) => {
      const after = new Chess(m.after);
      return forkTargets(after, m.to).length >= 2 && !isHanging(after, m.to);
    });
    if (fork) {
      add('Fork chance', `Your ${NAME[fork.piece]} can attack two pieces at once. Find the square.`, [fork.from]);
    }
  }

  const myBack = backRankWeak(chess, me);
  if (myBack) {
    add('Back-rank weakness', 'Your king has no escape square. A rook or queen check on the back rank could be mate. A pawn move like h3 (luft) fixes it.', [myBack]);
  }
  const theirBack = backRankWeak(chess, opp);
  if (theirBack && piecesOf(chess, me).some((p) => p.type === 'r' || p.type === 'q')) {
    add('Weak back rank', "The enemy king is boxed in on its back rank. Look for a rook or queen check there.", [theirBack]);
  }

  return tips.slice(0, MAX_TACTICS);
}

const START: Record<Color, Record<string, Square[]>> = {
  w: { n: ['b1', 'g1'], b: ['c1', 'f1'], q: ['d1'], k: ['e1'] },
  b: { n: ['b8', 'g8'], b: ['c8', 'f8'], q: ['d8'], k: ['e8'] },
};

const GENERAL: Record<Phase, Tip> = {
  opening: {
    kind: 'strategy',
    title: 'Opening principles',
    text: "Control the center, develop knights and bishops, castle early, and don't move the same piece twice without a reason.",
    squares: [],
  },
  middlegame: {
    kind: 'strategy',
    title: 'Checks, captures, threats',
    text: 'Before every move, list the checks, captures and threats, for both sides. Most games are decided by a missed one.',
    squares: [],
  },
  endgame: {
    kind: 'strategy',
    title: 'Endgame principles',
    text: 'Activate your king, create a passed pawn, and when you are ahead, trade pieces rather than pawns.',
    squares: [],
  },
};

/** Positional / planning advice for `me`, chosen by game phase. Always returns at least one tip. */
export function strategicTips(fen: string, me: Color): Tip[] {
  const chess = new Chess(fen);
  const opp = other(me);
  const phase = gamePhase(chess);
  const fullmove = Number(fen.split(' ')[5]);
  const mine = piecesOf(chess, me);
  const tips: Tip[] = [];
  const add = (title: string, text: string, squares: string[]) =>
    tips.push({ kind: 'strategy', title, text, squares });
  const at = (sq: Square, type: string) => {
    const p = chess.get(sq);
    return p?.color === me && p.type === type;
  };

  const king = mine.find((p) => p.type === 'k')!;
  const queensOn = piecesOf(chess, 'w').concat(piecesOf(chess, 'b')).some((p) => p.type === 'q');
  const rights = castlingRights(fen, me);

  if (phase === 'opening') {
    const home = [...START[me].n.filter((s) => at(s, 'n')), ...START[me].b.filter((s) => at(s, 'b'))];
    if (fullmove >= 4 && home.length >= 2) {
      const names = home.map((s) => `${NAME[chess.get(s)!.type]} on ${s}`);
      add('Develop your pieces', `Your ${list(names)} ${plural(home.length, 'is', 'are')} still at home. Develop knights and bishops before attacking.`, home);
    }
    const queen = mine.find((p) => p.type === 'q');
    if (queen && fullmove <= 8 && !START[me].q.includes(queen.square) && home.length >= 2) {
      add('Queen out early', 'Your queen is out before your minor pieces. Your opponent can gain time by chasing it.', [queen.square]);
    }
    const center: Square[] = ['d4', 'e4', 'd5', 'e5'];
    if (fullmove <= 8 && !center.some((s) => at(s, 'p'))) {
      add('Control the center', 'You have no pawn on d4, e4, d5 or e5. Central pawns give your pieces room and take squares from your opponent.', center);
    }
  }

  if (phase !== 'endgame' && START[me].k.includes(king.square) && queensOn && fullmove >= 6) {
    add(
      rights.k || rights.q ? 'Castle soon' : 'King in the center',
      rights.k || rights.q
        ? 'Your king is still in the center. Castling tucks it away and connects your rooks.'
        : "Your king can no longer castle and is still in the center. Keep the center closed and get it to safety by hand.",
      [king.square],
    );
  }

  if (phase === 'endgame' && (me === 'w' ? Number(king.square[1]) <= 2 : Number(king.square[1]) >= 7)) {
    add('Activate your king', 'In the endgame the king is a strong piece. March it toward the center or the pawns.', [king.square]);
  }

  const structure = pawnStructure(chess, me);
  const passed = structure.filter((p) => p.passed).sort((a, b) =>
    me === 'w' ? Number(b.square[1]) - Number(a.square[1]) : Number(a.square[1]) - Number(b.square[1]));
  if (passed[0]) {
    const sq = passed[0].square;
    add(
      'Passed pawn',
      `Your ${sq[0]}-pawn is passed. ` +
        (phase === 'endgame' ? 'Push it, supported by your king and rooks. Rooks belong behind passed pawns.' : 'Keep it safe; it gets stronger as pieces come off the board.'),
      [sq],
    );
  }
  const theirPassed = pawnStructure(chess, opp).filter((p) => p.passed)[0];
  if (theirPassed) {
    add('Stop the passed pawn', `The pawn on ${theirPassed.square} is passed. Blockade the square in front of it, ideally with a knight.`, [theirPassed.square]);
  }

  const rooks = mine.filter((p) => p.type === 'r');
  if (phase !== 'opening' && rooks.length) {
    const { open, halfOpen } = fileStatus(chess, me);
    const onFile = (f: string) => rooks.some((r) => r.square[0] === f);
    const f = open.find((x) => !onFile(x)) ?? halfOpen.find((x) => !onFile(x));
    if (f && !rooks.some((r) => open.includes(r.square[0]))) {
      add(
        open.includes(f) ? 'Open file' : 'Half-open file',
        open.includes(f)
          ? `The ${f}-file has no pawns. Rooks are strongest on open files.`
          : `The ${f}-file is half-open for you. A rook there puts pressure on the pawn at the end of it.`,
        rooks.map((r) => r.square),
      );
    }
  }

  const rim = mine.find((p) => p.type === 'n' && (p.square[0] === 'a' || p.square[0] === 'h'));
  if (rim) add('Knight on the rim', `Your knight on ${rim.square} controls few squares. Knights are strongest near the center.`, [rim.square]);

  const bishops = (c: Color) => piecesOf(chess, c).filter((p) => p.type === 'b').length;
  if (phase !== 'endgame' && bishops(me) === 2 && bishops(opp) < 2) {
    add('Bishop pair', 'You have both bishops and your opponent doesn’t. Opening the position helps them.', mine.filter((p) => p.type === 'b').map((p) => p.square));
  }

  const isolated = structure.find((p) => p.isolated && !p.passed);
  if (isolated) add('Isolated pawn', `Your pawn on ${isolated.square} has no neighbours to defend it. Keep pieces near it, or trade it off.`, [isolated.square]);
  const doubled = structure.filter((p) => p.doubled);
  if (doubled.length) add('Doubled pawns', `Your ${doubled[0].square[0]}-file pawns are doubled and can't protect each other.`, doubled.map((p) => p.square));
  const target = pawnStructure(chess, opp).find((p) => p.isolated && !p.passed);
  if (target) add('Target', `The pawn on ${target.square} is isolated. Attack it with pieces; pawns can't defend it.`, [target.square]);

  return (tips.length ? tips : [GENERAL[phase]]).slice(0, MAX_STRATEGY);
}

/** A general principle for the phase, for when there's nothing specific to say. */
export function generalTip(fen: string): Tip {
  return GENERAL[gamePhase(new Chess(fen))];
}
