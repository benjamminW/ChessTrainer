import type { Lesson } from '../../types';

export default {
  id: "colle",
  section: "openings",
  order: 9,
  title: "The Colle System",
  summary: "d4, Nf3, e3 and Bd3, then e4 to open lines toward the king. (White)",
  openings: [
    "Queen's Pawn Game: Colle System",
    "Indian Defense: Colle System"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkb1r/ppp2ppp/4pn2/3p4/3P4/3BPN2/PPP2PPP/RNBQK2R b KQkq - 1 4",
      line: "d2d4 d7d5 g1f3 g8f6 e2e3 e7e6 f1d3",
      text: "The Colle System: d4, Nf3, e3 and Bd3, with c3, Nbd2 and castling to follow. Unlike the London, the c1 bishop stays behind the pawns; the plan is a later e4.",
      arrows: [
        {
          from: "e3",
          to: "e4"
        },
        {
          from: "d3",
          to: "h7",
          color: "red"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bq1rk1/pp3ppp/2nbpn2/2pp4/3P4/2PBPN2/PP1N1PPP/R1BQ1RK1 w - - 5 8",
      line: "d2d4 d7d5 g1f3 g8f6 e2e3 e7e6 f1d3 c7c5 c2c3 b8c6 b1d2 f8d6 e1g1 e8g8",
      text: "The full setup: the c3–d4–e3 pawns, Nbd2 and a castled king. Next comes Re1 or Qe2 and e4. When the centre opens, the d3 bishop points straight at h7.",
      arrows: [
        {
          from: "e3",
          to: "e4"
        },
        {
          from: "d3",
          to: "h7",
          color: "red"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqk2r/ppp1ppbp/3p1np1/8/3P4/3BPN2/PPP2PPP/RNBQK2R w KQkq - 0 5",
      line: "d2d4 g8f6 g1f3 g7g6 e2e3 f8g7 f1d3 d7d6",
      text: "Against a King's Indian setup the same development works. White castles, plays Nbd2 and e4, and gets a broad centre.",
      arrows: [
        {
          from: "e3",
          to: "e4"
        },
        {
          from: "b1",
          to: "d2"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Set up the Colle against ...d5, ...e6 with ...c5, and a King's Indian.",
      side: "w",
      lines: [
        "d2d4 d7d5 g1f3 g8f6 e2e3 e7e6 f1d3",
        "d2d4 g8f6 g1f3 e7e6 e2e3 c7c5 f1d3 d7d5 c2c3",
        "d2d4 g8f6 g1f3 g7g6 e2e3 f8g7 f1d3 d7d6"
      ],
      notes: {
        "d2d4 d7d5 g1f3 g8f6 e2e3": "e3 solidly supports d4 and opens the way for Bd3.",
        "d2d4 g8f6 g1f3 e7e6 e2e3 c7c5 f1d3 d7d5 c2c3": "c3 keeps d4 solid, so ...cxd4 is met by exd4 and the e-file opens for White."
      }
    }
  ]
} satisfies Lesson;
