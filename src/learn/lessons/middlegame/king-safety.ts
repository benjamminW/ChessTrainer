import type { Lesson } from '../../types';

export default {
  id: "king-safety",
  section: "middlegame",
  order: 3,
  title: "King safety and attacking the castled king",
  summary: "Back-rank weakness, luft, and the bishop sacrifice on h7.",
  puzzleThemes: [
    "sacrifice",
    "backRankMate"
  ],
  steps: [
    {
      type: "explain",
      fen: "4r1k1/pp3ppp/8/8/8/8/PP3PPP/2R3K1 w - - 0 1",
      text: "A king behind three unmoved pawns is safe from the front but can be mated on its back rank. One pawn move (h3, g3) gives it an escape square, called luft, and removes the danger for good.",
      arrows: [
        {
          from: "e8",
          to: "e1",
          color: "red"
        }
      ],
      squares: [
        {
          sq: "g1",
          color: "red"
        }
      ]
    },
    {
      type: "explain",
      fen: "r1bq1rk1/pppn1ppp/2n1p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 8",
      text: "A classic attacking setup: bishop on d3 aimed at h7, knight on f3 ready for g5, the queen ready for h5, and the e5 pawn keeping the black knight off f6. When all of these are in place, the bishop sacrifice on h7 often works.",
      arrows: [
        {
          from: "d3",
          to: "h7",
          color: "red"
        },
        {
          from: "f3",
          to: "g5"
        },
        {
          from: "d1",
          to: "h5"
        }
      ],
      squares: [
        {
          sq: "h7",
          color: "red"
        }
      ]
    },
    {
      type: "try",
      fen: "4r1k1/pp3ppp/8/8/8/8/PP3PPP/2R3K1 w - - 0 1",
      prompt: "White to move. Rc7 looks tempting. Why not, and what should you do first?",
      hint: "Rc7 would allow ...Re1, mate. Give your king an escape square.",
      solution: "h2h3",
      success: "h3 makes luft. Now the rook is free to go to c7. (g3 or Kf1 also deal with it.)",
      margin: 5
    },
    {
      type: "try",
      fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
      prompt: "White to move: Black's king has no luft. Punish it.",
      hint: "The rook takes the open d-file to the back rank.",
      solution: "d1d8",
      success: "Rd8 is mate.",
      fastest: true
    },
    {
      type: "try",
      fen: "r1bq1rk1/pppn1ppp/2n1p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 8",
      prompt: "White to move. Everything is in place. Attack!",
      hint: "Sacrifice the bishop on h7, then follow with Ng5+ and Qh5.",
      solution: "d3h7",
      success: "Bxh7+! Kxh7 Ng5+ and Qh5 gives a winning attack."
    },
    {
      type: "try",
      fen: "r1bq1rk1/pp1nbppp/2p1p3/3p4/2PP4/2NBP3/PPQ2PPP/R3K1NR b KQ - 0 9",
      prompt: "Black to move. White's queen and bishop both aim at h7. Defend it.",
      hint: "Bring a piece to defend h7, or close the diagonal.",
      solution: "d7f6",
      success: "...Nf6 guards h7. (...dxc4, ...g6 and ...h6 are also fine.)"
    }
  ]
} satisfies Lesson;
