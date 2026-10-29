import type { Lesson } from '../../types';

export default {
  id: 'kr-k',
  section: 'endgames',
  order: 4,
  title: 'Rook and king against king',
  puzzleThemes: ['endgame'],
  summary: 'Cut the king off, face it, and push it to the edge.',
  steps: [
    {
      type: 'explain',
      fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
      text: 'With a rook your king has to do more of the work. The rook cuts the enemy king off along a rank or file, your king walks up to face it, and then a rook check pushes it back one line. Repeat until it is on the edge.',
      arrows: [{ from: 'a1', to: 'a5' }, { from: 'e1', to: 'e2', color: 'blue' }],
      claim: { side: 'w', result: 'win' },
    },
    {
      type: 'explain',
      fen: '1K6/8/8/8/8/8/R7/6k1 w - - 0 1',
      text: "The black king is already boxed in here: the rook on the 2nd rank keeps it on the edge. White's king now walks over to face it, and the rook gives the final check. Mate needs the kings facing each other, or the defending king in a corner.",
      squares: [{ sq: 'g1', color: 'red' }],
      claim: { side: 'w', result: 'win' },
    },
    {
      type: 'try',
      fen: 'k7/8/1K6/8/8/8/8/7R w - - 0 1',
      prompt: 'White to move: mate in one.',
      hint: 'Your king already covers a7 and b7. Check along the back rank.',
      solution: 'h1h8',
      fastest: true,
      success: 'Rh8 is mate.',
    },
    {
      type: 'practice',
      fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
      prompt: 'Mate the lone king with king and rook. You have 50 moves, which is plenty.',
      userColor: 'w',
      goal: 'win',
    },
  ],
} satisfies Lesson;
