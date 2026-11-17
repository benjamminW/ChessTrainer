import type { Lesson } from '../../types';

export default {
  id: "grunfeld",
  section: "openings",
  order: 20,
  title: "The Grünfeld Defence",
  summary: "Let White take the centre, then attack it with pieces and ...c5. (Black)",
  openings: [
    "Grünfeld Defense"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkb1r/ppp1pp1p/5np1/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 0 4",
      line: "d2d4 g8f6 c2c4 g7g6 b1c3 d7d5",
      text: "The Grünfeld: ...d5 challenges the centre at once. If White takes on d5 and builds a big centre with e4, Black attacks it with the g7 bishop, ...c5 and ...Nc6.",
      arrows: [
        {
          from: "d5",
          to: "c4"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqk2r/pp2ppbp/6p1/2p5/3PP3/2P2N2/P4PPP/R1BQKB1R w KQkq - 0 8",
      line: "d2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5 f6d5 e2e4 d5c3 b2c3 f8g7 g1f3 c7c5",
      text: "In the Exchange Variation White has the c3–d4–e4 centre. The g7 bishop and the c5 pawn both hit d4, and ...Nc6, ...Bg4 and ...Qa5 add more pressure.",
      arrows: [
        {
          from: "g7",
          to: "d4",
          color: "red"
        },
        {
          from: "c5",
          to: "d4",
          color: "red"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbq1rk1/1pp1ppbp/p4np1/8/2QPP3/2N2N2/PP3PPP/R1B1KB1R w KQ - 0 8",
      line: "d2d4 g8f6 c2c4 g7g6 b1c3 d7d5 g1f3 f8g7 d1b3 d5c4 b3c4 e8g8 e2e4 a7a6",
      text: "Against Qb3 Black takes on c4 and castles. White has the centre, and Black plays ...b5 and ...c5, gaining time on the queen.",
      arrows: [
        {
          from: "b7",
          to: "b5"
        },
        {
          from: "c7",
          to: "c5"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the Grünfeld against the Exchange, the Russian (Qb3) and Bf4.",
      side: "b",
      lines: [
        "d2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5 f6d5 e2e4 d5c3 b2c3 f8g7 g1f3 c7c5",
        "d2d4 g8f6 c2c4 g7g6 b1c3 d7d5 g1f3 f8g7 d1b3 d5c4 b3c4 e8g8 e2e4 a7a6",
        "d2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c1f4 f8g7 e2e3 e8g8"
      ],
      notes: {
        "d2d4 g8f6 c2c4 g7g6 b1c3 d7d5": "...d5 challenges White's centre straight away.",
        "d2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5 f6d5 e2e4 d5c3 b2c3 f8g7 g1f3 c7c5": "...c5 attacks d4, the base of White's centre."
      }
    }
  ]
} satisfies Lesson;
