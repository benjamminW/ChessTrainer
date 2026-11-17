import type { Lesson } from '../../types';

export default {
  id: "dutch",
  section: "openings",
  order: 21,
  title: "The Dutch Defence (Leningrad)",
  summary: "...f5 and ...g6: grab e4 and play for the kingside. (Black)",
  openings: [
    "Dutch Defense"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkbnr/ppppp1pp/8/5p2/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2",
      line: "d2d4 f7f5",
      text: "The Dutch: ...f5 fights for e4 and makes the game sharp and unbalanced from move 1. The cost is a slightly looser king.",
      arrows: [
        {
          from: "f5",
          to: "e4"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbq1rk1/ppppp1bp/5np1/5p2/3P4/5NP1/PPP1PPBP/RNBQ1RK1 w - - 4 6",
      line: "d2d4 f7f5 g2g3 g8f6 f1g2 g7g6 g1f3 f8g7 e1g1 e8g8",
      text: "The Leningrad setup: ...Nf6, ...g6, ...Bg7 and castles, like a King's Indian with an extra pawn on f5.",
      arrows: [
        {
          from: "f5",
          to: "e4"
        },
        {
          from: "d7",
          to: "d6"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbq1rk1/pp2p1bp/2pp1np1/5p2/2PP4/2N2NP1/PP2PPBP/R1BQ1RK1 w - - 0 8",
      line: "d2d4 f7f5 g2g3 g8f6 f1g2 g7g6 g1f3 f8g7 e1g1 e8g8 c2c4 d7d6 b1c3 c7c6",
      text: "With ...d6 and ...c6 Black prepares ...Qa5 or ...Qe8 and then ...e5. Once e5 comes, the g7 bishop and the f-pawn work together on the kingside.",
      arrows: [
        {
          from: "e7",
          to: "e5"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the Leningrad Dutch against the g3 setup, with and without an early c4.",
      side: "b",
      lines: [
        "d2d4 f7f5 g2g3 g8f6 f1g2 g7g6 g1f3 f8g7 e1g1 e8g8 c2c4 d7d6 b1c3 c7c6",
        "d2d4 f7f5 c2c4 g8f6 g2g3 g7g6"
      ],
      notes: {
        "d2d4 f7f5": "...f5 fights for e4 from the side.",
        "d2d4 f7f5 g2g3 g8f6 f1g2 g7g6": "...g6 and ...Bg7: the Leningrad bishop."
      }
    }
  ]
} satisfies Lesson;
