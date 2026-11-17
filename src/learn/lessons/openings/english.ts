import type { Lesson } from '../../types';

export default {
  id: "english",
  section: "openings",
  order: 7,
  title: "The English Opening",
  summary: "c4 and a kingside fianchetto: control d5 from the side. (White)",
  openings: [
    "English Opening"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq - 0 1",
      line: "c2c4",
      text: "The English: c4 controls d5 without putting a pawn in the centre. Against ...e5 it is like a Sicilian with the colours reversed, and White is a move up.",
      arrows: [
        {
          from: "c4",
          to: "d5"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bqk1nr/pppp1pbp/2n3p1/4p3/2P5/2N3P1/PP1PPPBP/R1BQK1NR w KQkq - 2 5",
      line: "c2c4 e7e5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7",
      text: "White fianchettoes: the bishop on g2, the knight on c3 and the c4 pawn all work on d5. Black often copies the setup.",
      arrows: [
        {
          from: "g2",
          to: "d5"
        },
        {
          from: "c3",
          to: "d5"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bqk1nr/ppp2pbp/2np2p1/4p3/2P1P3/2NP2P1/PP3PBP/R1BQK1NR b KQkq - 0 6",
      line: "c2c4 e7e5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7 d2d3 d7d6 e2e4",
      text: "The Botvinnik setup: with d3 and e4 White locks down d5. Then Nge2, castling, and queenside play with Rb1 and b4.",
      arrows: [
        {
          from: "a1",
          to: "b1"
        },
        {
          from: "b2",
          to: "b4"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the English from move 1 against ...e5, ...c5 and ...Nf6 with ...d5.",
      side: "w",
      lines: [
        "c2c4 e7e5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7 d2d3 d7d6 e2e4",
        "c2c4 e7e5 b1c3 g8f6 g2g3 f8b4 e2e4 e8g8 g1e2 b8c6 f1g2",
        "c2c4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7 g1f3 e7e5 e1g1 g8e7 d2d3",
        "c2c4 g8f6 b1c3 d7d5 c4d5 f6d5 g1f3"
      ],
      notes: {
        "c2c4 e7e5 b1c3 b8c6 g2g3": "g3 prepares Bg2, aimed down the long diagonal at d5.",
        "c2c4 e7e5 b1c3 g8f6 g2g3 f8b4 e2e4": "e4 stops ...e4 and makes the c3 knight's pin less annoying."
      }
    }
  ]
} satisfies Lesson;
