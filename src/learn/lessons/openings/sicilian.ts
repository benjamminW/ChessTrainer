import type { Lesson } from '../../types';

export default {
  id: "sicilian",
  section: "openings",
  order: 4,
  title: "The Sicilian Defence",
  summary: "Fight for d4 from the side: the Najdorf, and what to do against 2.c3 and 2.Nc3. (Black)",
  openings: [
    "Sicilian Defense"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
      line: "e2e4 c7c5",
      text: "The Sicilian. Black contests d4 from the side instead of copying White. The game becomes unbalanced: Black usually gets the half-open c-file and an extra central pawn after ...cxd4, White gets space and attacking chances.",
      arrows: [
        {
          from: "c5",
          to: "d4",
          color: "blue"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqkb1r/pp2pppp/3p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R b KQkq - 2 5",
      line: "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3",
      text: "The Open Sicilian. White trades the d-pawn for Black's c-pawn and leads in development. Black hits e4 with ...Nf6 and will use the c-file.",
      arrows: [
        {
          from: "f6",
          to: "e4",
          color: "blue"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6",
      line: "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6",
      text: "The Najdorf: ...a6 keeps White's pieces off b5 and prepares ...e5 or ...b5. A flexible, ambitious system.",
      arrows: [
        {
          from: "e7",
          to: "e5",
          color: "blue"
        },
        {
          from: "b7",
          to: "b5",
          color: "blue"
        }
      ],
      squares: [
        {
          sq: "b5",
          color: "red"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqkb1r/pp1ppppp/5n2/2p5/4P3/2P5/PP1P1PPP/RNBQKBNR w KQkq - 1 3",
      line: "e2e4 c7c5 c2c3 g8f6",
      text: "Against 2.c3 (the Alapin), White wants a d4-e4 centre. ...Nf6 attacks e4 at once; after e5 Nd5 the knight is well placed and Black hits the centre with ...d6 or ...cxd4.",
      arrows: [
        {
          from: "f6",
          to: "e4",
          color: "blue"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the Sicilian as Black. The coach goes for the Open Sicilian, the Alapin (2.c3) or the Closed (2.Nc3).",
      side: "b",
      lines: [
        "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6",
        "e2e4 c7c5 c2c3 g8f6 e4e5 f6d5 d2d4 c5d4",
        "e2e4 c7c5 b1c3 b8c6"
      ],
      notes: {
        "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4": "Take on d4: trading a wing pawn for a centre pawn is the point of the Sicilian.",
        "e2e4 c7c5 c2c3 g8f6": "Hit e4 right away, before White can support it with d4."
      }
    }
  ]
} satisfies Lesson;
