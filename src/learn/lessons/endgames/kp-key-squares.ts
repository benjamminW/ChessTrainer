import type { Lesson } from '../../types';

export default {
  id: 'kp-key-squares',
  section: 'endgames',
  order: 2,
  title: 'King and pawn: key squares',
  puzzleThemes: ['endgame'],
  summary: 'The squares your king must reach to force the pawn through.',
  steps: [
    {
      type: 'explain',
      fen: '8/8/2k5/8/4P3/4K3/8/8 w - - 0 1',
      text: "Every pawn has key squares: if your king reaches one, the pawn promotes whoever is to move. For a pawn that hasn't crossed the middle of the board, they are the three squares two ranks in front of it. For this pawn on e4 that's d6, e6 and f6.",
      squares: [{ sq: 'd6', color: 'green' }, { sq: 'e6', color: 'green' }, { sq: 'f6', color: 'green' }],
      claim: { side: 'w', result: 'win' },
    },
    {
      type: 'try',
      fen: '8/8/2k5/8/4P3/4K3/8/8 w - - 0 1',
      prompt: 'White to move. Only one move wins. Which way should your king go?',
      hint: 'Go round on the side away from the black king, heading for f6.',
      solution: 'e3f4',
      success: "Kf4 heads for f5 and then e6 or f6. The black king is on the other side and can't get back in time.",
    },
    {
      type: 'try',
      fen: '8/8/2k5/8/4P3/4K3/8/8 b - - 0 1',
      prompt: "Now you're Black in the same position, and it's your move. Hold the draw.",
      hint: 'Get your king in front of the key squares before the white king arrives.',
      solution: 'c6d6',
      success: 'Kd6 (or Kd7) keeps the white king away from d6, e6 and f6.',
    },
    {
      type: 'practice',
      fen: '8/8/2k5/8/4P3/4K3/8/8 w - - 0 1',
      prompt: 'White to move. Reach a key square and promote the pawn.',
      userColor: 'w',
      goal: 'win',
    },
  ],
} satisfies Lesson;
