import type { Lesson } from '../../types';

export default {
  id: "kings-indian-attack",
  section: "openings",
  order: 10,
  title: "The King's Indian Attack",
  summary: "A system: Nf3, g3, Bg2, castles and d3, then e4, against almost anything. (White)",
  openings: [
    "King's Indian Attack"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkb1r/pp3ppp/4pn2/2pp4/8/3P1NP1/PPP1PPBP/RNBQ1RK1 b kq - 0 5",
      line: "g1f3 d7d5 g2g3 c7c5 f1g2 g8f6 e1g1 e7e6 d2d3",
      text: "The King's Indian Attack is a system: Nf3, g3, Bg2, castles and d3, then Nbd2 and e4. It is the King's Indian Defence with White, so a move up.",
      arrows: [
        {
          from: "b1",
          to: "d2"
        },
        {
          from: "e2",
          to: "e4"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bqk2r/pp2bppp/2n1pn2/2pp4/4P3/3P1NP1/PPPN1PBP/R1BQ1RK1 b kq - 0 7",
      line: "g1f3 d7d5 g2g3 c7c5 f1g2 g8f6 e1g1 e7e6 d2d3 b8c6 b1d2 f8e7 e2e4",
      text: "After e4 White often pushes e5, gaining space and driving the f6 knight away from Black's king. Then Re1, h4 and the knight from d2 to f1 bring more pieces toward the kingside.",
      arrows: [
        {
          from: "e4",
          to: "e5"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbq1rk1/ppp1ppbp/5np1/3p4/8/3P1NP1/PPP1PPBP/RNBQ1RK1 w - - 0 6",
      line: "g1f3 g8f6 g2g3 g7g6 f1g2 f8g7 e1g1 e8g8 d2d3 d7d5",
      text: "If Black copies the setup, White carries on the same way with Nbd2 and e4. One plan against every reply is the point of a system.",
      arrows: [
        {
          from: "b1",
          to: "d2"
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
      prompt: "Set up the King's Indian Attack against ...d5 and ...c5, ...c6 with ...Bf5, and a mirror setup.",
      side: "w",
      lines: [
        "g1f3 d7d5 g2g3 c7c5 f1g2 g8f6 e1g1 e7e6 d2d3",
        "g1f3 g8f6 g2g3 d7d5 f1g2 c7c6 e1g1 c8f5 d2d3 e7e6 b1d2",
        "g1f3 g8f6 g2g3 g7g6 f1g2 f8g7 e1g1 e8g8 d2d3 d7d5"
      ],
      notes: {
        "g1f3 d7d5 g2g3": "g3 and Bg2: the bishop guards the king and eyes the long diagonal.",
        "g1f3 g8f6 g2g3 d7d5 f1g2 c7c6 e1g1 c8f5 d2d3 e7e6 b1d2": "Nbd2 supports e4, the move the whole system is built for."
      }
    }
  ]
} satisfies Lesson;
