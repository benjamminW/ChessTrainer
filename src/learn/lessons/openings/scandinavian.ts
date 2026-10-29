import type { Lesson } from '../../types';

export default {
  id: "scandinavian",
  section: "openings",
  order: 8,
  title: "The Scandinavian Defence",
  summary: "A simple, open answer to 1.e4 for beginners. (Black)",
  openings: [
    "Scandinavian Defense"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
      line: "e2e4 d7d5",
      text: "The Scandinavian. Black challenges e4 on move one. It is easy to learn: the position opens up early and development is straightforward.",
      arrows: [
        {
          from: "d5",
          to: "e4",
          color: "blue"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnb1kbnr/ppp1pppp/8/q7/8/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 4",
      line: "e2e4 d7d5 e4d5 d8d5 b1c3 d5a5",
      text: "After ...Qxd5 Nc3 the queen has to move again. On a5 it stays active and out of the way, and it pins the c3-knight once White plays d4.",
      arrows: [
        {
          from: "a5",
          to: "c3",
          color: "blue"
        }
      ]
    },
    {
      type: "explain",
      fen: "rn2kb1r/ppp1pppp/5n2/q4b2/3P4/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 3 6",
      line: "e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c8f5",
      text: "Black develops the light bishop outside the pawn chain, then plays ...c6 and ...e6: a solid setup with no weaknesses.",
      arrows: [
        {
          from: "c7",
          to: "c6",
          color: "blue"
        },
        {
          from: "e7",
          to: "e6",
          color: "blue"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqkb1r/ppp1pppp/8/3n4/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 0 4",
      line: "e2e4 d7d5 e4d5 g8f6 d2d4 f6d5",
      text: "The ...Nf6 version takes back with the knight, so Black loses no time with the queen.",
      arrows: [
        {
          from: "f6",
          to: "d5",
          color: "blue"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the Scandinavian as Black: recapture with the queen or the knight.",
      side: "b",
      lines: [
        "e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c8f5",
        "e2e4 d7d5 e4d5 g8f6 d2d4 f6d5 g1f3 c8g4"
      ],
      notes: {
        "e2e4 d7d5 e4d5 d8d5 b1c3 d5a5": "Qa5 keeps the queen active and safe, and pins the knight after d4."
      }
    }
  ]
} satisfies Lesson;
