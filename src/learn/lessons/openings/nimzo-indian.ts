import type { Lesson } from '../../types';

export default {
  id: "nimzo-indian",
  section: "openings",
  order: 18,
  title: "The Nimzo-Indian Defence",
  summary: "Pin the c3 knight and fight for e4, often giving up the bishop pair. (Black)",
  openings: [
    "Nimzo-Indian Defense"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4",
      line: "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4",
      text: "The Nimzo-Indian: ...Bb4 pins the knight that controls e4. Black is ready to take on c3 to double White's pawns, and fights for e4 with ...Ne4, ...b6 and ...Bb7, or with ...d5.",
      arrows: [
        {
          from: "b4",
          to: "c3",
          color: "red"
        },
        {
          from: "f6",
          to: "e4"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbq1rk1/p1pp1ppp/1p2pn2/8/2PP4/P1Q5/1P2PPPP/R1B1KBNR w KQ - 0 7",
      line: "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4 d1c2 e8g8 a2a3 b4c3 c2c3 b7b6",
      text: "Against Qc2 White takes back on c3 with the queen and keeps the pawns whole. Black castles first, then fianchettoes with ...Bb7 to hold the light squares. White has the two bishops; Black is ahead in development.",
      arrows: [
        {
          from: "c8",
          to: "b7"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbq1rk1/pp3ppp/4pn2/2pp4/1bPP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 7",
      line: "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8 f1d3 d7d5 g1f3 c7c5",
      text: "Against e3 Black hits the centre with ...d5 and ...c5. The bishop on b4 can take on c3 later, at the moment it hurts White most.",
      arrows: [
        {
          from: "c5",
          to: "d4"
        },
        {
          from: "b4",
          to: "c3",
          color: "red"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the Nimzo-Indian against Qc2, e3 and the Sämisch (a3).",
      side: "b",
      lines: [
        "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4 d1c2 e8g8 a2a3 b4c3 c2c3 b7b6",
        "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8 f1d3 d7d5 g1f3 c7c5",
        "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4 a2a3 b4c3 b2c3 e8g8"
      ],
      notes: {
        "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4": "...Bb4 pins the knight that controls e4.",
        "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4 a2a3 b4c3": "Taking on c3 gives White doubled c-pawns that Black can attack later."
      }
    }
  ]
} satisfies Lesson;
