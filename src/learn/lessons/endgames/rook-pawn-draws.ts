import type { Lesson } from '../../types';

export default {
  id: 'rook-pawn-draws',
  section: 'endgames',
  order: 5,
  title: 'Rook pawns and the wrong bishop',
  puzzleThemes: ['endgame'],
  summary: 'When the defending king reaches the corner, extra material may not win.',
  steps: [
    {
      type: 'explain',
      fen: 'k7/8/8/K7/P7/8/8/8 w - - 0 1',
      text: "A rook pawn (an a- or h-pawn) breaks the usual king-and-pawn rules. Once the defending king reaches the corner in front of it, it can't be driven out: the attacking king either has to let it out or stalemate it.",
      squares: [{ sq: 'a8', color: 'green' }],
      claim: { side: 'w', result: 'draw' },
    },
    {
      type: 'explain',
      fen: 'k7/8/1K6/P7/8/8/8/2B5 w - - 0 1',
      text: 'Add a bishop that can never control the corner square and it is still a draw. a8 is a light square and this bishop is dark-squared, so the black king just shuffles between a8 and b8. This is the "wrong bishop".',
      squares: [{ sq: 'a8', color: 'red' }],
      claim: { side: 'w', result: 'draw' },
    },
    {
      type: 'explain',
      fen: 'k7/8/1K6/P7/8/8/8/5B2 w - - 0 1',
      text: "With the light-squared bishop the corner is no longer safe, and White wins. So when you're defending, trade toward the wrong-bishop ending if you can; when you're attacking, keep the right bishop.",
      squares: [{ sq: 'a8', color: 'green' }],
      claim: { side: 'w', result: 'win' },
    },
    {
      type: 'practice',
      fen: '8/k7/8/K7/P7/8/8/8 b - - 0 1',
      prompt: "You're Black. Head for the corner and hold the draw for 15 moves.",
      userColor: 'b',
      goal: 'draw',
      maxMoves: 15,
    },
  ],
} satisfies Lesson;
