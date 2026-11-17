import type { Lesson } from '../../types';

export default {
  id: "petrov",
  section: "openings",
  order: 15,
  title: "Petrov's Defence",
  summary: "Answer 2.Nf3 by attacking e4: solid and symmetrical. (Black)",
  openings: [
    "Petrov's Defense"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
      line: "e2e4 e7e5 g1f3 g8f6",
      text: "Petrov's Defence: instead of defending e5, Black attacks e4. It leads to calm, balanced positions.",
      arrows: [
        {
          from: "f6",
          to: "e4"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqkb1r/ppp2ppp/3p4/8/4n3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 5",
      line: "e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4",
      text: "After 3.Nxe5 Black first plays ...d6 to push the knight back, and only then takes on e4. Taking at once is risky: after 3...Nxe4 4.Qe2 the e-file is open toward Black's king, and 4...Nf6?? 5.Nc6+ wins the queen.",
      arrows: [
        {
          from: "d6",
          to: "d5"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqk2r/ppp2ppp/3b4/3p4/3Pn3/3B1N2/PPP2PPP/RNBQK2R w KQkq - 2 7",
      line: "e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5 f1d3 f8d6",
      text: "Black backs up the e4 knight with ...d5 and develops with ...Bd6 and castling. The knight is Black's best piece; White tries to undermine it with c4 and Re1.",
      arrows: [
        {
          from: "c2",
          to: "c4",
          color: "blue"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play Petrov's Defence against 3.Nxe5, 3.d4 and 3.Nc3.",
      side: "b",
      lines: [
        "e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5 f1d3 f8d6",
        "e2e4 e7e5 g1f3 g8f6 d2d4 f6e4 f1d3 d7d5 f3e5 f8d6 e1g1 e8g8 c2c4 d6e5",
        "e2e4 e7e5 g1f3 g8f6 b1c3 b8c6 f1b5 f8b4 e1g1 e8g8 d2d3 d7d6 c1g5 c8e6"
      ],
      notes: {
        "e2e4 e7e5 g1f3 g8f6 f3e5 d7d6": "First ...d6, driving the knight back, and only then ...Nxe4.",
        "e2e4 e7e5 g1f3 g8f6 d2d4 f6e4": "Against 3.d4 Black takes e4 at once; the knight is well placed there."
      }
    }
  ]
} satisfies Lesson;
