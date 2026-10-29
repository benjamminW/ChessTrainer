import type { Lesson } from '../../types';

export default {
  id: 'kp-opposition',
  section: 'endgames',
  order: 1,
  title: 'King and pawn: the opposition',
  puzzleThemes: ['endgame'],
  summary: 'Why one tempo decides king-and-pawn endings, and how to win it.',
  steps: [
    {
      type: 'explain',
      fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
      text: "A pawn can't win on its own: the defending king simply walks in front of it. The winning plan is to bring your king up first and push the pawn only when the king has cleared the way. Here White wins, because the white king can get in front of its pawn in time.",
      arrows: [{ from: 'e1', to: 'd2' }],
      claim: { side: 'w', result: 'win' },
    },
    {
      type: 'explain',
      fen: '8/4k3/8/4K3/4P3/8/8/8 w - - 0 1',
      text: 'The kings face each other with one square between them. This is the opposition: whoever has to move must step aside. With White to move, the white king has to give way, the black king keeps blocking, and it is a draw.',
      squares: [{ sq: 'e6', color: 'red' }],
      claim: { side: 'w', result: 'draw' },
    },
    {
      type: 'explain',
      fen: '8/4k3/8/4K3/4P3/8/8/8 b - - 0 1',
      text: 'The same position with Black to move. Now Black has to step aside, the white king walks forward to d6 or f6, and the pawn promotes. A single tempo decides the game.',
      squares: [{ sq: 'd6', color: 'green' }, { sq: 'f6', color: 'green' }],
      claim: { side: 'w', result: 'win' },
    },
    {
      type: 'try',
      fen: '8/4k3/8/3K4/4P3/8/8/8 b - - 0 1',
      prompt: "You're Black. White's king has just stepped to d5. Find the only move that keeps the draw.",
      hint: 'Stand directly opposite the white king, with one square between you.',
      solution: 'e7d7',
      success: "Kd7 takes the opposition. White can't get past without handing it back to you.",
    },
    {
      type: 'try',
      fen: '8/8/4k3/8/4K3/8/4P3/8 w - - 0 1',
      prompt: "White to move and win. The kings face each other and it's your turn, which normally gives Black the opposition. How do you fix that?",
      hint: "A pawn move doesn't move your king. Use it to pass the turn to Black.",
      solution: 'e2e3',
      success: 'e3 is a spare tempo: now Black has to move and give way.',
    },
    {
      type: 'practice',
      fen: '8/4k3/8/4K3/4P3/8/8/8 b - - 0 1',
      prompt: 'Black to move. Use the opposition to bring the pawn home. The coach defends with perfect tablebase play.',
      userColor: 'w',
      goal: 'win',
    },
  ],
} satisfies Lesson;
