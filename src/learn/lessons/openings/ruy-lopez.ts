import type { Lesson } from '../../types';

export default {
  id: "ruy-lopez",
  section: "openings",
  order: 2,
  title: "The Ruy Lopez",
  summary: "Pressure on e5 through its defender, then a slow fight for the centre. (White)",
  openings: [
    "Ruy Lopez"
  ],
  steps: [
    {
      type: "explain",
      fen: "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
      line: "e2e4 e7e5 g1f3 b8c6 f1b5",
      text: "The Ruy Lopez (or Spanish). The bishop attacks the knight that defends e5. There's no threat yet: after Bxc6 dxc6, Nxe5 is met by ...Qd4, winning the pawn back. But the pressure on e5 lasts the whole opening.",
      arrows: [
        {
          from: "b5",
          to: "c6",
          color: "red"
        },
        {
          from: "c6",
          to: "e5",
          color: "blue"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bq1rk1/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N1P/PP1P1PP1/RNBQR1K1 b - - 0 9",
      line: "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8 h2h3",
      text: "The Closed Ruy Lopez. White castles, guards e4 with Re1, keeps the bishop on b3 aimed at f7 and prepares d4 with c3. h3 stops ...Bg4, which would pin the knight that supports d4.",
      arrows: [
        {
          from: "d2",
          to: "d4"
        },
        {
          from: "b3",
          to: "f7",
          color: "red"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bk1b1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK1 w - - 0 9",
      line: "e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4 d2d4 e4d6 b5c6 d7c6 d4e5 d6f5 d1d8 e8d8",
      text: "The Berlin Defence takes on e4 at once. White wins the pawn back and the queens come off. Black's king can no longer castle, but the bishop pair makes this endgame hard to beat. White plays with the e5 pawn and the extra pawn on the kingside.",
      arrows: [
        {
          from: "e5",
          to: "e6"
        },
        {
          from: "f2",
          to: "f4"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the Ruy Lopez from move 1 against the Closed, the Open and the Berlin defences.",
      side: "w",
      lines: [
        "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8 h2h3",
        "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f6e4 d2d4 b7b5 a4b3 d7d5 d4e5 c8e6",
        "e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4 d2d4 e4d6 b5c6 d7c6 d4e5 d6f5 d1d8 e8d8"
      ],
      notes: {
        "e2e4 e7e5 g1f3 b8c6 f1b5": "Bb5 attacks the knight that defends e5.",
        "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f6e4 d2d4": "d4 opens the centre while Black's king is still on e8; White wins the pawn back soon."
      }
    }
  ]
} satisfies Lesson;
