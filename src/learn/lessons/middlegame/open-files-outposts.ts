import type { Lesson } from '../../types';

export default {
  id: "open-files-outposts",
  section: "middlegame",
  order: 4,
  title: "Open files and outposts",
  summary: "Put rooks on open files and knights on squares pawns can't attack.",
  steps: [
    {
      type: "explain",
      fen: "r4rk1/pp1nbppp/3p4/2p1p3/2P1P3/2NB4/PP3PPP/R4RK1 w - - 0 1",
      text: "An outpost is a square in or near the enemy camp that no enemy pawn can attack. Here d5 is one: Black's c- and e-pawns have already gone past it. A knight there is very strong.",
      arrows: [
        {
          from: "c3",
          to: "d5"
        }
      ],
      squares: [
        {
          sq: "d5",
          color: "green"
        }
      ]
    },
    {
      type: "explain",
      fen: "r4rk1/ppp2ppp/2n1bn2/8/8/2N1BN2/PPP2PPP/R4RK1 w - - 0 1",
      text: "An open file has no pawns on it, so rooks can use its full length. Whoever controls the open d-file first can later invade on d7 or d8.",
      arrows: [
        {
          from: "f1",
          to: "d1"
        },
        {
          from: "a1",
          to: "d1",
          color: "blue"
        }
      ]
    },
    {
      type: "try",
      fen: "r4rk1/pp1nbppp/3p4/2p1p3/2P1P3/2NB4/PP3PPP/R4RK1 w - - 0 1",
      prompt: "White to move. Occupy the outpost.",
      hint: "Which square can no Black pawn ever attack?",
      solution: "c3d5",
      success: "Nd5: the knight sits on the outpost and eyes e7, c7 and f6."
    },
    {
      type: "try",
      fen: "r4rk1/ppp2ppp/2n1bn2/8/8/2N1BN2/PPP2PPP/R4RK1 w - - 0 1",
      prompt: "White to move. Take the open file.",
      hint: "Put a rook on the d-file before Black does.",
      solution: "f1d1",
      success: "Rfd1 claims the open file. (Rad1 works too.)"
    },
    {
      type: "try",
      fen: "r1bq1rk1/1p2bppp/p1n1p3/3n4/3P4/2NB1N2/PP3PPP/R1BQR1K1 w - - 0 11",
      prompt: "White to move. With an isolated d-pawn, the e5 square (supported by d4) is a natural outpost. Use it.",
      hint: "The d4-pawn supports a knight on e5.",
      solution: "f3e5",
      success: "Ne5: supported by d4 and impossible to chase away with a pawn."
    }
  ]
} satisfies Lesson;
