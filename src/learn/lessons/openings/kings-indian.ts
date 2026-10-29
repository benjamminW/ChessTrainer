import type { Lesson } from '../../types';

export default {
  id: "kings-indian",
  section: "openings",
  order: 7,
  title: "The King's Indian Defence",
  summary: "Let White build a centre, then strike back with ...e5. (Black)",
  openings: [
    "King's Indian Defense"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N5/PP3PPP/R1BQKBNR w KQkq - 0 5",
      line: "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6",
      text: "The King's Indian. Black lets White build a big centre, fianchettoes the bishop and castles, then strikes back with ...e5 (or ...c5). If the centre opens, the g7-bishop becomes very strong.",
      arrows: [
        {
          from: "g7",
          to: "d4",
          color: "blue"
        },
        {
          from: "e7",
          to: "e5",
          color: "blue"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbq1rk1/ppp2pbp/3p1np1/4p3/2PPP3/2N2N2/PP2BPPP/R1BQK2R w KQ - 0 7",
      line: "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8 f1e2 e7e5",
      text: "The key moment: ...e5 challenges d4. If White closes the centre with d5, Black usually attacks on the kingside with ...Ne8 or ...Nd7 and ...f5, while White plays on the queenside.",
      arrows: [
        {
          from: "f7",
          to: "f5",
          color: "blue"
        }
      ],
      squares: [
        {
          sq: "e5",
          color: "green"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqk2r/ppppppbp/5np1/8/2PP4/5NP1/PP2PP1P/RNBQKB1R b KQkq - 0 4",
      line: "d2d4 g8f6 c2c4 g7g6 g1f3 f8g7 g2g3",
      text: "Against the Fianchetto, both bishops face each other on the long diagonals and White's king is safer. Black castles, plays ...d6, and still aims for ...e5 or ...c5.",
      arrows: [
        {
          from: "g7",
          to: "b2",
          color: "blue"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the King's Indian as Black against the Classical setup and the Fianchetto.",
      side: "b",
      lines: [
        "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8 f1e2 e7e5",
        "d2d4 g8f6 c2c4 g7g6 g1f3 f8g7 g2g3"
      ],
      notes: {
        "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8 f1e2 e7e5": "...e5 is the King's Indian strike against the centre."
      }
    }
  ]
} satisfies Lesson;
