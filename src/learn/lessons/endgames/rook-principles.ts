import type { Lesson } from '../../types';

export default {
  id: 'rook-principles',
  section: 'endgames',
  order: 9,
  title: 'Rook endgame principles',
  puzzleThemes: ['endgame'],
  summary: 'Active rooks, cutting off the king, and rooks behind passed pawns.',
  steps: [
    {
      type: 'explain',
      fen: '1K6/1P2k3/8/8/8/8/r7/3R4 w - - 0 1',
      text: "Cut off the king. White's rook on the d-file keeps the black king away from the pawn, and that is what makes this position winnable. When you have the pawn, use your rook to keep the defending king as far from it as possible.",
      arrows: [{ from: 'd1', to: 'd8' }],
      claim: { side: 'w', result: 'win' },
    },
    {
      type: 'explain',
      fen: 'R7/P5k1/8/8/8/8/r7/6K1 b - - 0 1',
      text: "Rooks belong behind passed pawns. Here Black's rook sits behind the a-pawn and keeps it under attack, while White's rook is stuck in front of it, doing nothing. White can't make progress: it's a draw.",
      arrows: [{ from: 'a2', to: 'a7', color: 'blue' }],
      claim: { side: 'b', result: 'draw' },
    },
    {
      type: 'try',
      fen: 'R7/P5k1/8/8/8/8/r7/6K1 b - - 0 1',
      prompt: 'Black to move. Several king moves lose. Keep the draw.',
      hint: 'Your king belongs on g7 or h7, where the white rook can never check it and then skewer your rook.',
      solution: 'g7h7',
      success: 'Kh7 (or a quiet rook move along the a-file) keeps everything covered. Kf7 would lose to Rh8 and Rh7+.',
    },
    {
      type: 'practice',
      fen: 'R7/P5k1/8/8/8/8/r7/6K1 b - - 0 1',
      prompt: "You're Black. Keep your rook behind the pawn and hold the draw for 20 moves.",
      userColor: 'b',
      goal: 'draw',
      maxMoves: 20,
    },
  ],
} satisfies Lesson;
