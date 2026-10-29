import type { Lesson } from '../../types';

export default {
  id: "passed-pawns",
  section: "middlegame",
  order: 6,
  title: "Creating a passed pawn",
  summary: "Majorities, breakthroughs and pushing passers.",
  puzzleThemes: [
    "promotion"
  ],
  steps: [
    {
      type: "explain",
      fen: "8/6p1/3k4/8/P2K4/8/6P1/8 w - - 0 1",
      text: "A passed pawn has no enemy pawns in front of it or on the files beside it. An outside passed pawn, far from the other pawns, is especially strong: it pulls the enemy king away, and your king then eats the remaining pawns.",
      arrows: [
        {
          from: "a4",
          to: "a8"
        }
      ],
      squares: [
        {
          sq: "a4",
          color: "green"
        }
      ]
    },
    {
      type: "explain",
      fen: "8/ppp3k1/8/PPP5/8/8/8/6K1 w - - 0 1",
      text: "Three pawns against three, with the kings far away. White can force a passed pawn with a sacrifice: b6! Whichever pawn takes, another white pawn gets through.",
      arrows: [
        {
          from: "b5",
          to: "b6"
        }
      ]
    },
    {
      type: "try",
      fen: "8/ppp3k1/8/PPP5/8/8/8/6K1 w - - 0 1",
      prompt: "White to move: create a passed pawn by force.",
      hint: "Sacrifice the middle pawn.",
      solution: "b5b6",
      success: "b6! After ...axb6 c6! or ...cxb6 a6!, a white pawn queens."
    },
    {
      type: "try",
      fen: "6k1/5ppp/3P4/8/8/8/5PPP/6K1 w - - 0 1",
      prompt: "White to move. Passed pawns must be pushed.",
      hint: "The black king can't get back in time.",
      solution: "d6d7",
      success: "d7, and the pawn queens next move."
    },
    {
      type: "try",
      fen: "8/6p1/3k4/8/P2K4/8/6P1/8 w - - 0 1",
      prompt: "White to move. Use the outside passed pawn.",
      hint: "Advance it to drag the black king away.",
      solution: "a4a5",
      success: "a5: the black king has to chase it, and your king takes the g-pawn."
    }
  ]
} satisfies Lesson;
