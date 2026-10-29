import type { Lesson } from '../../types';

export default {
  id: 'kq-k',
  section: 'endgames',
  order: 3,
  title: 'Queen and king against king',
  puzzleThemes: ['endgame'],
  summary: 'Shrink the box, bring the king, and watch out for stalemate.',
  steps: [
    {
      type: 'explain',
      fen: '8/8/8/4k3/8/8/8/KQ6 w - - 0 1',
      text: "This is always a win, as long as you don't stalemate. Use the queen to shrink the box the enemy king lives in (a knight's move away from it is a good distance), then walk your own king up to help. The queen can't mate alone.",
      arrows: [{ from: 'b1', to: 'g6' }],
      claim: { side: 'w', result: 'win' },
    },
    {
      type: 'explain',
      fen: 'k7/2Q5/1K6/8/8/8/8/8 b - - 0 1',
      text: "The danger: after Qc7 Black has no legal move and isn't in check. That's stalemate, a draw. Before every queen move near a cornered king, check that it still has a move.",
      squares: [{ sq: 'a8', color: 'red' }],
    },
    {
      type: 'try',
      fen: 'k7/8/1K6/8/8/8/8/2Q5 w - - 0 1',
      prompt: 'White to move: checkmate in one. Careful, two natural queen moves are stalemate.',
      hint: 'The black king only has a8. Attack it along the back rank.',
      solution: 'c1c8',
      fastest: true,
      success: 'Qc8 is mate: your king covers a7 and b7.',
    },
    {
      type: 'practice',
      fen: '8/8/8/4k3/8/8/8/KQ6 w - - 0 1',
      prompt: 'Mate the lone king. The coach runs to the middle and lasts as long as it can.',
      userColor: 'w',
      goal: 'win',
    },
  ],
} satisfies Lesson;
