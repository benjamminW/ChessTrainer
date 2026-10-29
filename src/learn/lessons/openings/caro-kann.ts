import type { Lesson } from '../../types';

export default {
  id: "caro-kann",
  section: "openings",
  order: 6,
  title: "The Caro-Kann Defence",
  summary: "Challenge e4 with ...c6 and ...d5, keeping the light bishop free. (Black)",
  openings: [
    "Caro-Kann Defense"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3",
      line: "e2e4 c7c6 d2d4 d7d5",
      text: "The Caro-Kann. Like the French, Black challenges e4 with ...d5, but prepares it with ...c6 so the c8-bishop can still come out. A solid structure with a simple plan: bishop to f5 or g4, then ...e6.",
      arrows: [
        {
          from: "d5",
          to: "e4",
          color: "blue"
        },
        {
          from: "c8",
          to: "f5",
          color: "blue"
        }
      ]
    },
    {
      type: "explain",
      fen: "rn1qkbnr/pp2pppp/2p5/5b2/3PN3/8/PPP2PPP/R1BQKBNR w KQkq - 1 5",
      line: "e2e4 c7c6 d2d4 d7d5 b1d2 d5e4 d2e4 c8f5",
      text: "In the Classical, Black takes on e4 and develops the bishop to f5 with an attack on the knight.",
      arrows: [
        {
          from: "f5",
          to: "e4",
          color: "blue"
        }
      ]
    },
    {
      type: "explain",
      fen: "rn1qkbnr/pp2pppp/2p5/3pPb2/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 1 4",
      line: "e2e4 c7c6 d2d4 d7d5 e4e5 c8f5",
      text: "Against the Advance, the bishop comes out to f5 before ...e6 locks it in. Later Black attacks the chain with ...c5.",
      arrows: [
        {
          from: "c8",
          to: "f5",
          color: "blue"
        },
        {
          from: "c6",
          to: "c5",
          color: "blue"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqkbnr/pp2pppp/8/3p4/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 0 4",
      line: "e2e4 c7c6 d2d4 d7d5 e4d5 c6d5",
      text: "The Exchange gives a symmetrical pawn structure. Black develops quickly with ...Nc6, ...Nf6 and the bishop to f5 or g4.",
      arrows: [
        {
          from: "b8",
          to: "c6",
          color: "blue"
        },
        {
          from: "g8",
          to: "f6",
          color: "blue"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the Caro-Kann as Black against the Classical, the Advance and the Exchange.",
      side: "b",
      lines: [
        "e2e4 c7c6 d2d4 d7d5 b1d2 d5e4 d2e4 c8f5",
        "e2e4 c7c6 d2d4 d7d5 e4e5 c8f5 g1e2",
        "e2e4 c7c6 d2d4 d7d5 e4d5 c6d5 g1f3 b8c6"
      ],
      notes: {
        "e2e4 c7c6 d2d4 d7d5 e4e5 c8f5": "Develop the bishop to f5 before ...e6 shuts it in."
      }
    }
  ]
} satisfies Lesson;
