import type { Lesson } from '../../types';

export default {
  id: "italian",
  section: "openings",
  order: 1,
  title: "The Italian Game",
  summary: "Quick development and pressure on f7, then a slow build-up in the centre. (White)",
  openings: [
    "Italian Game"
  ],
  steps: [
    {
      type: "explain",
      fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
      line: "e2e4 e7e5 g1f3 b8c6 f1c4",
      text: "The Italian Game. White develops fast and aims the bishop at f7, the weakest square near Black's king. White's plan is to castle, prepare d4 with c3, and build the centre slowly. Black develops with ...Bc5 or ...Nf6 and looks for ...d5 when it is safe.",
      arrows: [
        {
          from: "c4",
          to: "f7",
          color: "red"
        }
      ],
      squares: [
        {
          sq: "f7",
          color: "red"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R b KQkq - 0 4",
      line: "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3",
      text: "With c3 White prepares d4 to build a big pawn centre, gaining time on the bishop on c5. Black usually answers ...Nf6, hitting e4 so that d4 is not so easy.",
      arrows: [
        {
          from: "d2",
          to: "d4"
        },
        {
          from: "g8",
          to: "f6",
          color: "blue"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 4",
      line: "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 d2d3",
      text: "The quieter Giuoco Pianissimo: d3 protects e4 for good. Both sides castle and manoeuvre; White often plays c3, Re1, and brings the knight round via d2 and f1 to g3.",
      arrows: [
        {
          from: "b1",
          to: "d2"
        },
        {
          from: "d2",
          to: "f1"
        },
        {
          from: "f1",
          to: "g3"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
      line: "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6",
      text: "The Two Knights Defence: Black attacks e4 at once. White can protect it with d3 or Nc3, or go for f7 with Ng5. After Nc3, Black has the trick ...Nxe4 Nxe4 d5, forking bishop and knight to win the piece back.",
      arrows: [
        {
          from: "f6",
          to: "e4",
          color: "red"
        },
        {
          from: "b1",
          to: "c3"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the Italian from move 1. The coach answers with ...Bc5 or ...Nf6, and you need the right plan for each.",
      side: "w",
      lines: [
        "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 d2d3",
        "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6",
        "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 b1c3 f6e4 c3e4 d7d5"
      ],
      notes: {
        "e2e4 e7e5 g1f3": "Nf3 develops with an attack on e5, so Black has to spend a move defending it.",
        "e2e4 e7e5 g1f3 b8c6 f1c4": "Bc4 is the Italian bishop: developed, and aimed at f7.",
        "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3": "c3 prepares d4, so White can build a two-pawn centre."
      }
    }
  ]
} satisfies Lesson;
