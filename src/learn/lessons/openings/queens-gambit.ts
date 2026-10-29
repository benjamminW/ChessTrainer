import type { Lesson } from '../../types';

export default {
  id: "queens-gambit",
  section: "openings",
  order: 2,
  title: "The Queen's Gambit",
  summary: "Offer the c-pawn to undermine d5, against ...e6, ...dxc4 and ...c6. (White)",
  openings: [
    "Queen's Gambit",
    "Queen's Gambit Declined",
    "Queen's Gambit Accepted",
    "Slav Defense"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2",
      line: "d2d4 d7d5 c2c4",
      text: "The Queen's Gambit. White offers the c-pawn to pull Black's d-pawn away from the centre. It is not a real gambit: if Black takes, White usually wins the pawn back with e3 and Bxc4.",
      arrows: [
        {
          from: "c4",
          to: "d5",
          color: "red"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqkb1r/ppp2ppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR b KQkq - 3 4",
      line: "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5",
      text: "Declined with ...e6, Black holds d5 solidly. White develops and pins the f6-knight with Bg5, adding pressure on d5. Black's problem is the c8-bishop, shut in behind e6: freeing it, often with ...c5 or ...dxc4 and ...e5, is the main task.",
      arrows: [
        {
          from: "g5",
          to: "f6"
        },
        {
          from: "f6",
          to: "d5",
          color: "blue"
        }
      ],
      squares: [
        {
          sq: "c8",
          color: "yellow"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqkbnr/ppp1pppp/8/8/2pP4/5N2/PP2PPPP/RNBQKB1R b KQkq - 1 3",
      line: "d2d4 d7d5 c2c4 d5c4 g1f3",
      text: "If Black accepts, White develops calmly with Nf3 and e3, then takes back on c4 with the bishop and keeps a fine centre. Trying to hold the pawn with ...b5 usually backfires.",
      arrows: [
        {
          from: "e2",
          to: "e3"
        },
        {
          from: "f1",
          to: "c4"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3",
      line: "d2d4 d7d5 c2c4 c7c6",
      text: "The Slav holds d5 with ...c6 instead, keeping the c8-bishop free to come out to f5 or g4 before ...e6.",
      arrows: [
        {
          from: "c8",
          to: "f5",
          color: "blue"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the Queen's Gambit from move 1. The coach declines, accepts or plays the Slav.",
      side: "w",
      lines: [
        "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 g1f3",
        "d2d4 d7d5 c2c4 d5c4 g1f3 g8f6",
        "d2d4 d7d5 c2c4 c7c6 b1c3 d5c4"
      ],
      notes: {
        "d2d4 d7d5 c2c4": "c4 attacks d5 from the side: the point of the Queen's Gambit.",
        "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5": "Bg5 pins the knight that defends d5."
      }
    }
  ]
} satisfies Lesson;
