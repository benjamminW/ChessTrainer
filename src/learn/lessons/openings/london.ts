import type { Lesson } from '../../types';

export default {
  id: "london",
  section: "openings",
  order: 3,
  title: "The London System",
  summary: "One reliable setup against almost anything. (White)",
  openings: [
    "London System",
    "Queen's Pawn Game: London System"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkb1r/ppp1pppp/5n2/3p4/3P1B2/5N2/PPP1PPPP/RN1QKB1R b KQkq - 3 3",
      line: "d2d4 d7d5 g1f3 g8f6 c1f4",
      text: "The London System: d4, Nf3 and an early Bf4, then e3, c3, Bd3 and Nbd2. The same setup works against nearly everything, so there is little theory. The bishop comes out before e3 so it is not shut in.",
      arrows: [
        {
          from: "c1",
          to: "f4"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bqkb1r/pp3ppp/2n1pn2/2pp4/3P1B2/2P1PN2/PP1N1PPP/R2QKB1R b KQkq - 0 6",
      line: "d2d4 d7d5 g1f3 g8f6 c1f4 c7c5 e2e3 b8c6 b1d2 e7e6 c2c3",
      text: "The pyramid of d4, c3 and e3 is very solid. White castles and later looks for Ne5, or for kingside play with Bd3 and Qe2.",
      arrows: [
        {
          from: "f3",
          to: "e5"
        },
        {
          from: "f1",
          to: "d3"
        }
      ],
      squares: [
        {
          sq: "c3",
          color: "green"
        },
        {
          sq: "d4",
          color: "green"
        },
        {
          sq: "e3",
          color: "green"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqk2r/ppp1ppbp/3p1np1/8/3P1B2/4PN2/PPP2PPP/RN1QKB1R w KQkq - 0 5",
      line: "d2d4 g8f6 g1f3 g7g6 c1f4 f8g7 e2e3 d7d6",
      text: "Against a King's Indian setup the London stays the same. Black is aiming for ...e5, so White keeps an eye on that square, and often plays h3 to give the bishop a retreat on h2.",
      arrows: [
        {
          from: "d6",
          to: "e5",
          color: "blue"
        },
        {
          from: "h2",
          to: "h3"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the London from move 1, against ...d5 and against a King's Indian setup.",
      side: "w",
      lines: [
        "d2d4 d7d5 g1f3 g8f6 c1f4 c7c5 e2e3 b8c6 b1d2 e7e6 c2c3",
        "d2d4 g8f6 g1f3 g7g6 c1f4 f8g7 e2e3 d7d6 f1e2 e8g8"
      ],
      notes: {
        "d2d4 d7d5 g1f3 g8f6 c1f4": "Bf4 first, before e3, so the bishop is outside the pawn chain.",
        "d2d4 d7d5 g1f3 g8f6 c1f4 c7c5 e2e3 b8c6 b1d2 e7e6 c2c3": "c3 completes the pyramid and answers ...cxd4 with exd4 or cxd4."
      }
    }
  ]
} satisfies Lesson;
