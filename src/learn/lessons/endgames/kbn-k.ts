import type { Lesson } from '../../types';

export default {
  id: 'kbn-k',
  section: 'endgames',
  order: 6,
  title: 'Bishop and knight against king',
  puzzleThemes: ['endgame'],
  summary: "The hardest basic mate: it only works in a corner of the bishop's color.",
  steps: [
    {
      type: 'explain',
      fen: '7k/8/5K2/8/8/8/8/4BN2 w - - 0 1',
      text: "Bishop and knight can force mate, but only in a corner the bishop controls. This bishop is dark-squared, so the mating corners are a1 and h8. If the king escapes to a light corner, you drive it along the edge to a dark one. From the worst start it takes over 30 moves, so the 50-move rule is close.",
      squares: [{ sq: 'h8', color: 'green' }, { sq: 'a1', color: 'green' }],
      claim: { side: 'w', result: 'win' },
    },
    {
      type: 'try',
      fen: '7k/5K2/8/4N3/8/8/8/2B5 w - - 0 1',
      prompt: 'White to move. Find a move that mates as fast as possible (mate in 4).',
      hint: 'Use the knight to take away squares around the cornered king.',
      solution: 'e5g6',
      fastest: true,
      success: 'Ng6+ keeps the king in the corner; the bishop and knight finish it off.',
    },
    {
      type: 'practice',
      fen: '7k/8/5K2/8/8/8/8/4BN2 w - - 0 1',
      prompt: 'Mate in the dark corner. The coach defends perfectly.',
      userColor: 'w',
      goal: 'win',
    },
  ],
} satisfies Lesson;
