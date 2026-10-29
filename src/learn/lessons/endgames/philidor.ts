import type { Lesson } from '../../types';

export default {
  id: 'philidor',
  section: 'endgames',
  order: 8,
  title: 'The Philidor defence',
  puzzleThemes: ['endgame'],
  summary: 'Drawing rook and pawn against rook with an active rook.',
  steps: [
    {
      type: 'explain',
      fen: '4k3/R7/7r/4PK2/8/8/8/8 b - - 0 1',
      text: "The Philidor position: your king is in front of the pawn and your rook guards your third rank (the 6th from White's side). The white king can't come forward to f6 or d6 without walking into checks.",
      squares: [{ sq: 'd6', color: 'red' }, { sq: 'f6', color: 'red' }],
      claim: { side: 'b', result: 'draw' },
    },
    {
      type: 'try',
      fen: '4k3/R7/7r/4PK2/8/8/8/8 b - - 0 1',
      prompt: 'Black to move. Keep the draw. Where does your rook belong?',
      hint: "Stay on the 6th rank. Don't drop back to defend passively.",
      solution: 'h6b6',
      success: 'Rb6 keeps guarding the 6th rank. A passive move like Rh8 would lose.',
    },
    {
      type: 'try',
      fen: '4k3/R7/4P2r/4K3/8/8/8/8 b - - 0 1',
      prompt: 'White has pushed e6, so the 6th rank is blocked. Your rook changes job. Find the drawing move.',
      hint: 'With the pawn on e6 the white king has nowhere to hide from checks from behind.',
      solution: 'h6h1',
      success: 'Rh1! The rook goes far away and checks the white king from behind.',
    },
    {
      type: 'practice',
      fen: '4k3/R7/7r/4PK2/8/8/8/8 b - - 0 1',
      prompt: "You're Black. Hold the Philidor for 20 moves.",
      userColor: 'b',
      goal: 'draw',
      maxMoves: 20,
    },
  ],
} satisfies Lesson;
