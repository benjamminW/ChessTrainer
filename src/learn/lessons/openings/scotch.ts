import type { Lesson } from '../../types';

export default {
  id: "scotch",
  section: "openings",
  order: 3,
  title: "The Scotch Game",
  summary: "Open the centre at once with d4 and play with free pieces. (White)",
  openings: [
    "Scotch Game"
  ],
  steps: [
    {
      type: "explain",
      fen: "r1bqkbnr/pppp1ppp/2n5/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 0 4",
      line: "e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4",
      text: "The Scotch: White strikes with d4 on move 3 and takes back with the knight. White keeps the e4 pawn while Black's e-pawn is gone, so White has more space, and both sides develop fast.",
      arrows: [
        {
          from: "e4",
          to: "e5"
        },
        {
          from: "d4",
          to: "c6",
          color: "red"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1b1k2r/ppppnppp/2n2q2/2b5/3NP3/2P1B3/PP3PPP/RN1QKB1R w KQkq - 1 7",
      line: "e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 f8c5 c1e3 d8f6 c2c3 g8e7",
      text: "Against 4...Bc5 White guards the knight with Be3 and c3. Black's queen and bishop aim at d4 and f2, so White finishes developing before starting anything.",
      arrows: [
        {
          from: "c5",
          to: "d4",
          color: "blue"
        },
        {
          from: "f6",
          to: "f2",
          color: "blue"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bqkb1r/p1pp1ppp/2p2n2/4P3/8/8/PPP2PPP/RNBQKB1R b KQkq - 0 6",
      line: "e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6 e4e5",
      text: "Against 4...Nf6 White takes on c6 and pushes e5 to kick the knight. Black's pawns are split, and White tries to keep the e5 pawn as a wedge in Black's position.",
      arrows: [
        {
          from: "e5",
          to: "f6",
          color: "red"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the Scotch from move 1 against ...Bc5, ...Nf6 and ...Qh4.",
      side: "w",
      lines: [
        "e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 f8c5 c1e3 d8f6 c2c3 g8e7 f1b5",
        "e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6 e4e5",
        "e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 d8h4 d4b5 f8b4 c1d2"
      ],
      notes: {
        "e2e4 e7e5 g1f3 b8c6 d2d4": "d4 hits e5 straight away and opens the centre.",
        "e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 d8h4 d4b5": "Nb5 threatens Nxc7+, forking the king and the rook."
      }
    }
  ]
} satisfies Lesson;
