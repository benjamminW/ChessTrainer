import type { Lesson } from '../../types';

export default {
  id: "catalan",
  section: "openings",
  order: 6,
  title: "The Catalan",
  summary: "A Queen's Gambit with the bishop on g2 pressing on the long diagonal. (White)",
  openings: [
    "Catalan Opening"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/6P1/PP2PPBP/RNBQK1NR b KQkq - 1 4",
      line: "d2d4 g8f6 c2c4 e7e6 g2g3 d7d5 f1g2",
      text: "The Catalan: d4 and c4 as in the Queen's Gambit, plus a bishop on g2. It presses on d5 and, behind it, on Black's queenside.",
      arrows: [
        {
          from: "g2",
          to: "d5"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bqkb1r/pppn1ppp/4pn2/8/2QP4/6P1/PP2PPBP/RNB1K1NR b KQkq - 0 6",
      line: "d2d4 g8f6 c2c4 e7e6 g2g3 d7d5 f1g2 d5c4 d1a4 b8d7 a4c4",
      text: "If Black takes on c4, White wins the pawn back with Qa4+ and Qxc4. Then the queen and the g2 bishop both aim at Black's queenside, and the c8 bishop is hard to develop.",
      arrows: [
        {
          from: "g2",
          to: "b7",
          color: "red"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bq1rk1/pp1nbppp/2p1pn2/3p4/2PP4/1P3NP1/P1Q1PPBP/RNB2RK1 b - - 0 8",
      line: "d2d4 g8f6 c2c4 e7e6 g2g3 d7d5 f1g2 f8e7 g1f3 e8g8 e1g1 b8d7 d1c2 c7c6 b2b3",
      text: "In the Closed Catalan Black keeps the pawn on d5. White plays Qc2, b3 and Bb2 and waits for the right moment for e4, which opens the bishop's diagonal fully.",
      arrows: [
        {
          from: "c1",
          to: "b2"
        },
        {
          from: "e2",
          to: "e4"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the Catalan from move 1 against ...dxc4, ...Be7 and ...Bb4+.",
      side: "w",
      lines: [
        "d2d4 g8f6 c2c4 e7e6 g2g3 d7d5 f1g2 d5c4 d1a4 b8d7 a4c4",
        "d2d4 g8f6 c2c4 e7e6 g2g3 d7d5 f1g2 f8e7 g1f3 e8g8 e1g1 b8d7 d1c2 c7c6 b2b3",
        "d2d4 g8f6 c2c4 e7e6 g2g3 f8b4 c1d2 b4e7 f1g2 d7d5 g1f3 e8g8 e1g1"
      ],
      notes: {
        "d2d4 g8f6 c2c4 e7e6 g2g3": "g3 prepares Bg2 for the long diagonal.",
        "d2d4 g8f6 c2c4 e7e6 g2g3 d7d5 f1g2 d5c4 d1a4": "Qa4+ and Qxc4 win the pawn back straight away."
      }
    }
  ]
} satisfies Lesson;
