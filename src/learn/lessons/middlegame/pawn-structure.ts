import type { Lesson } from '../../types';

export default {
  id: "pawn-structure",
  section: "middlegame",
  order: 2,
  title: "Pawn structure and weak squares",
  summary: "Isolated pawns, holes, and the minority attack.",
  steps: [
    {
      type: "explain",
      fen: "rnbqk2r/pp2bppp/4p3/3n4/3P4/2N2N2/PP3PPP/R1BQKB1R w KQkq - 0 8",
      line: "e2e4 c7c6 d2d4 d7d5 e4d5 c6d5 c2c4 g8f6 b1c3 e7e6 g1f3 f8e7 c4d5 f6d5",
      text: "White has an isolated queen's pawn on d4: no pawns on the c- or e-files can ever protect it. It gives White open lines and the e5 square, but in an endgame it is a weakness. The square in front of it, d5, is a perfect home for a Black piece, because no pawn can chase it away.",
      squares: [
        {
          sq: "d4",
          color: "red"
        },
        {
          sq: "d5",
          color: "green"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bqkb1r/pp1p1ppp/2n2n2/4p3/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6",
      line: "e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5",
      text: "...e5 gains space and kicks the knight, but leaves a hole on d5: no Black pawn can ever attack that square again. A white knight that lands on d5 can't be driven away by pawns.",
      arrows: [
        {
          from: "c3",
          to: "d5"
        }
      ],
      squares: [
        {
          sq: "d5",
          color: "green"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bqrnk1/pp2bppp/2p2n2/3p2B1/3P4/2NBPN2/PPQ2PPP/1R3RK1 w - - 9 12",
      text: "The Carlsbad structure. White has fewer pawns on the queenside (a and b against a, b and c) and uses them as a battering ram: b4-b5 to create a weak pawn on c6 or d5. This is the minority attack.",
      arrows: [
        {
          from: "b2",
          to: "b4"
        },
        {
          from: "b4",
          to: "b5"
        }
      ],
      squares: [
        {
          sq: "c6",
          color: "red"
        }
      ]
    },
    {
      type: "try",
      fen: "rnbqk2r/pp2bppp/4pn2/3P4/3P4/2N2N2/PP3PPP/R1BQKB1R b KQkq - 0 7",
      prompt: "Black to move. Take back on d5 and leave White with an isolated pawn. Which recapture keeps d5 as a strong square?",
      hint: "A piece on d5 blockades the isolated pawn. Taking back with the pawn would give a symmetrical structure instead.",
      solution: "f6d5",
      success: "...Nxd5 blockades the d4-pawn from its ideal square. (...exd5 is also playable, but gives a symmetrical structure.)"
    },
    {
      type: "try",
      fen: "r1bqkb1r/5p1p/p1np1p2/1p2p3/4P3/N1N5/PPP2PPP/R2QKB1R w KQkq - 0 10",
      prompt: "White to move. Use the hole Black has left.",
      hint: "Which square can no Black pawn ever attack?",
      solution: "c3d5",
      success: "Nd5 plants the knight on the hole, where only pieces can challenge it."
    },
    {
      type: "try",
      fen: "r1bqrnk1/pp2bppp/2p2n2/3p2B1/3P4/2NBPN2/PPQ2PPP/1R3RK1 w - - 9 12",
      prompt: "White to move in the Carlsbad structure. Start the minority attack.",
      hint: "Push the pawn that will lead the attack on c6.",
      solution: "b2b4",
      success: "b4, followed by b5, attacks Black's queenside pawns."
    }
  ]
} satisfies Lesson;
