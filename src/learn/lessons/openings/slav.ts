import type { Lesson } from '../../types';

export default {
  id: "slav",
  section: "openings",
  order: 19,
  title: "The Slav Defence",
  summary: "Hold d5 with ...c6 and develop the c8 bishop outside the pawn chain. (Black)",
  openings: [
    "Slav Defense"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3",
      line: "d2d4 d7d5 c2c4 c7c6",
      text: "The Slav supports d5 with ...c6 instead of ...e6, so the c8 bishop isn't shut in. Black's plan is ...Nf6, ...Bf5 and then ...e6.",
      arrows: [
        {
          from: "c8",
          to: "f5"
        }
      ]
    },
    {
      type: "explain",
      fen: "rn1qkb1r/pp2pppp/2p2n2/5b2/P1pP4/2N2N2/1P2PPPP/R1BQKB1R w KQkq - 1 6",
      line: "d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5",
      text: "In the main line Black takes on c4. White plays a4 so that ...b5 can't hold the pawn, and wins it back later. Black uses the time to get the bishop to f5, then plays ...e6, ...Bb4 and castles.",
      arrows: [
        {
          from: "e7",
          to: "e6"
        },
        {
          from: "f8",
          to: "b4"
        }
      ]
    },
    {
      type: "explain",
      fen: "rn1qkb1r/pp2pppp/2p2n2/3p1b2/2PP4/4PN2/PP3PPP/RNBQKB1R w KQkq - 1 5",
      line: "d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 e2e3 c8f5",
      text: "Against the quiet e3 the bishop comes out to f5 before ...e6. This is the Slav's point: in the Queen's Gambit Declined that bishop is often stuck on c8.",
      arrows: [
        {
          from: "e7",
          to: "e6"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the Slav against Nc3 with ...dxc4, the quiet e3, and the Exchange.",
      side: "b",
      lines: [
        "d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5",
        "d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 e2e3 c8f5",
        "d2d4 d7d5 c2c4 c7c6 c4d5 c6d5 b1c3 g8f6 g1f3 b8c6 c1f4 c8f5"
      ],
      notes: {
        "d2d4 d7d5 c2c4 c7c6": "...c6 supports d5 and keeps the c8 bishop free.",
        "d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5": "The bishop gets out before ...e6 closes its path."
      }
    }
  ]
} satisfies Lesson;
