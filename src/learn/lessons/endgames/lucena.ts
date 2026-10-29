import type { Lesson } from '../../types';

export default {
  id: 'lucena',
  section: 'endgames',
  order: 7,
  title: 'The Lucena position',
  puzzleThemes: ['endgame'],
  summary: 'Winning rook and pawn against rook by building a bridge.',
  steps: [
    {
      type: 'explain',
      fen: '1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1',
      text: "The Lucena position: your pawn is on the 7th rank, your king is in front of it, and the enemy king is cut off. The only problem is that your king can't come out without being checked. The answer is to build a bridge with your rook.",
      claim: { side: 'w', result: 'win' },
    },
    {
      type: 'try',
      fen: '1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1',
      prompt: 'Step 1: push the black king one file further away.',
      hint: 'Give a check from the d-file.',
      solution: 'c1d1',
      success: "Rd1+ sends the king to the e-file, so it can't come back to c7.",
    },
    {
      type: 'try',
      fen: '1K6/1P2k3/8/8/8/8/r7/3R4 w - - 0 1',
      prompt: 'Step 2: build the bridge. Put your rook on the 4th rank.',
      hint: 'From the 4th rank the rook can later step across to block checks on the c-file.',
      solution: 'd1d4',
      success: 'Rd4. Now your king comes out (Kc7, Kc6, Kc5) and when the checks run out of room, the rook steps to c4 to block them.',
    },
    {
      type: 'practice',
      fen: '1K6/1P2k3/8/8/3R4/8/r7/8 b - - 0 1',
      prompt: 'The bridge is ready. Black to move: walk your king out and promote.',
      userColor: 'w',
      goal: 'win',
    },
  ],
} satisfies Lesson;
