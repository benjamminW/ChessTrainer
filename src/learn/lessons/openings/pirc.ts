import type { Lesson } from '../../types';

export default {
  id: "pirc",
  section: "openings",
  order: 14,
  title: "The Pirc Defence",
  summary: "Let White build a centre, then hit it with a fianchettoed bishop and ...e5 or ...c5. (Black)",
  openings: [
    "Pirc Defense"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkb1r/ppp1pp1p/3p1np1/8/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 0 4",
      line: "e2e4 d7d6 d2d4 g8f6 b1c3 g7g6",
      text: "The Pirc: Black lets White build a big centre and fianchettoes the bishop on g7. Later ...e5 or ...c5 attacks that centre.",
      arrows: [
        {
          from: "f8",
          to: "g7"
        },
        {
          from: "e7",
          to: "e5"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbq1rk1/ppp1ppbp/3p1np1/8/3PPP2/2N2N2/PPP3PP/R1BQKB1R w KQ - 3 6",
      line: "e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 f2f4 f8g7 g1f3 e8g8",
      text: "The Austrian Attack with f4 is White's sharpest try: e5 is coming. Black castles quickly and strikes with ...c5 to attack d4 before White's pawns roll forward.",
      arrows: [
        {
          from: "c7",
          to: "c5"
        },
        {
          from: "e4",
          to: "e5",
          color: "blue"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbq1rk1/pp2ppbp/2pp1np1/8/3PP3/2N2N2/PPP1BPPP/R1BQ1RK1 w - - 0 7",
      line: "e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 g1f3 f8g7 f1e2 e8g8 e1g1 c7c6",
      text: "Against quiet development Black castles and plays ...c6, then ...Nbd7 and ...e5, or ...Bg4 to trade off the knight that guards d4.",
      arrows: [
        {
          from: "e7",
          to: "e5"
        },
        {
          from: "b8",
          to: "d7"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the Pirc against the quiet Classical setup and the Austrian Attack.",
      side: "b",
      lines: [
        "e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 g1f3 f8g7 f1e2 e8g8 e1g1 c7c6",
        "e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 f2f4 f8g7 g1f3 e8g8"
      ],
      notes: {
        "e2e4 d7d6 d2d4 g8f6 b1c3 g7g6": "...g6 prepares ...Bg7, the bishop that will hit White's centre.",
        "e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 f2f4 f8g7 g1f3 e8g8": "Castle first: the king must be safe before the centre opens."
      }
    }
  ]
} satisfies Lesson;
