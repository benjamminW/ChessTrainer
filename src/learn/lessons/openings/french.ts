import type { Lesson } from '../../types';

export default {
  id: "french",
  section: "openings",
  order: 5,
  title: "The French Defence",
  summary: "A solid pawn chain and pawn breaks with ...c5. (Black)",
  openings: [
    "French Defense"
  ],
  steps: [
    {
      type: "explain",
      fen: "rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3",
      line: "e2e4 e7e6 d2d4 d7d5",
      text: "The French. Black builds a solid e6-d5 chain and challenges e4. The price is the c8-bishop, hemmed in by its own pawns. Black's play comes from pawn breaks, mainly ...c5 and sometimes ...f6.",
      arrows: [
        {
          from: "d5",
          to: "e4",
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
      fen: "rnbqkbnr/pp3ppp/4p3/2ppP3/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 0 4",
      line: "e2e4 e7e6 d2d4 d7d5 e4e5 c7c5",
      text: "In the Advance, White grabs space with e5. Black attacks the base of the chain at once with ...c5, then ...Nc6 and ...Qb6 to pile up on d4.",
      arrows: [
        {
          from: "c5",
          to: "d4",
          color: "blue"
        },
        {
          from: "d8",
          to: "b6",
          color: "blue"
        }
      ],
      squares: [
        {
          sq: "d4",
          color: "red"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqkbnr/ppp2ppp/8/3p4/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 0 4",
      line: "e2e4 e7e6 d2d4 d7d5 e4d5 e6d5",
      text: "The Exchange opens the position and frees Black's c8-bishop. It is calm and level: develop naturally, castle, and fight for the e-file.",
      arrows: [
        {
          from: "c8",
          to: "f5",
          color: "blue"
        }
      ]
    },
    {
      type: "explain",
      fen: "rnbqk1nr/ppp2ppp/4p3/3p4/1b1PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 2 4",
      line: "e2e4 e7e6 d2d4 d7d5 b1c3 f8b4",
      text: "Against 3.Nc3, ...Bb4 (the Winawer) pins the knight that defends e4 and keeps up the pressure on it.",
      arrows: [
        {
          from: "b4",
          to: "c3",
          color: "blue"
        }
      ],
      squares: [
        {
          sq: "e4",
          color: "red"
        }
      ]
    },
    {
      type: "drill",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      prompt: "Play the French as Black against the Advance, the Exchange and 3.Nc3.",
      side: "b",
      lines: [
        "e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3 b8c6",
        "e2e4 e7e6 d2d4 d7d5 e4d5 e6d5 g1f3",
        "e2e4 e7e6 d2d4 d7d5 b1c3 f8b4"
      ],
      notes: {
        "e2e4 e7e6 d2d4 d7d5 e4e5 c7c5": "...c5 attacks the base of White's pawn chain: the standard French break."
      }
    }
  ]
} satisfies Lesson;
