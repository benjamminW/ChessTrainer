import type { Lesson } from '../../types';

export default {
  id: "vienna",
  section: "openings",
  order: 4,
  title: "The Vienna Game",
  summary: "Nc3 and Bc4: quick development with an eye on f7. (White)",
  openings: [
    "Vienna Game",
    "Bishop's Opening: Vienna Hybrid"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2",
      line: "e2e4 e7e5 b1c3",
      text: "The Vienna: Nc3 instead of Nf3. The knight guards e4 and watches d5, and the f-pawn stays free, so f4 is possible later.",
      arrows: [
        {
          from: "c3",
          to: "d5"
        },
        {
          from: "f2",
          to: "f4"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqkb1r/pppp1ppp/3n4/4p2Q/8/1BN5/PPPP1PPP/R1B1K1NR b KQkq - 3 5",
      line: "e2e4 e7e5 b1c3 g8f6 f1c4 f6e4 d1h5 e4d6 c4b3",
      text: "If Black takes on e4, White doesn't take back at once. Qh5 hits f7 and e5, so the knight has to come back to d6 to defend. Then Bb3 keeps the bishop safe while it still aims at f7.",
      arrows: [
        {
          from: "h5",
          to: "f7",
          color: "red"
        },
        {
          from: "h5",
          to: "e5",
          color: "red"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/2NP4/PPP2PPP/R1BQK1NR b KQkq - 0 4",
      line: "e2e4 e7e5 b1c3 b8c6 f1c4 g8f6 d2d3",
      text: "Against quiet development d3 holds e4. White follows with Nge2 or Nf3 and castles, and later f4 can open the f-file toward Black's king.",
      arrows: [
        {
          from: "f2",
          to: "f4"
        },
        {
          from: "g1",
          to: "e2"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the Vienna with Bc4 from move 1 against ...Nf6 and ...Nc6.",
      side: "w",
      lines: [
        "e2e4 e7e5 b1c3 g8f6 f1c4 f6e4 d1h5 e4d6 c4b3 f8e7 g1f3 b8c6 f3e5",
        "e2e4 e7e5 b1c3 b8c6 f1c4 g8f6 d2d3 f8b4 g1e2",
        "e2e4 e7e5 b1c3 g8f6 f1c4 f8c5 d2d3"
      ],
      notes: {
        "e2e4 e7e5 b1c3 g8f6 f1c4 f6e4 d1h5": "Qh5 hits f7 and e5 at the same time.",
        "e2e4 e7e5 b1c3 b8c6 f1c4 g8f6 d2d3": "d3 holds e4 so the knight on f6 has nothing to take."
      }
    }
  ]
} satisfies Lesson;
