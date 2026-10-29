import type { Lesson } from '../../types';

export default {
  id: "piece-activity",
  section: "middlegame",
  order: 1,
  title: "Piece activity",
  summary: "Improve your worst piece: bad bishops, active rooks and an active king.",
  steps: [
    {
      type: "explain",
      fen: "rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3",
      line: "e2e4 e7e6 d2d4 d7d5 e4e5",
      text: "Activity means how many useful squares a piece controls. Here Black's light-squared bishop on c8 is \"bad\": its own pawns on e6 and d5 sit on light squares and block it. A good plan is often to improve or trade your worst piece.",
      squares: [
        {
          sq: "c8",
          color: "red"
        },
        {
          sq: "d5",
          color: "yellow"
        },
        {
          sq: "e6",
          color: "yellow"
        }
      ]
    },
    {
      type: "explain",
      fen: "4r1k1/pp3ppp/8/8/8/7P/PP3PP1/2R3K1 w - - 0 1",
      text: "Rooks belong on open files and on the 7th rank, where they attack pawns that can only be defended by pieces. Once your king has an escape square (h3 here), the rook can go there safely.",
      arrows: [
        {
          from: "c1",
          to: "c7"
        }
      ]
    },
    {
      type: "try",
      fen: "rnbqkbnr/p1p2ppp/1p2p3/3pP3/3P4/5N2/PPP2PPP/RNBQKB1R b KQkq - 1 4",
      prompt: "Black to move. ...b6 has prepared a way to get rid of the bad bishop. Find it.",
      hint: "Offer to trade the bishop for its White counterpart on the a6-f1 diagonal.",
      solution: "c8a6",
      success: "...Ba6 offers to trade the bad bishop for White's good one."
    },
    {
      type: "try",
      fen: "4r1k1/pp3ppp/8/8/8/7P/PP3PP1/2R3K1 w - - 0 1",
      prompt: "White to move. Your king is safe: activate the rook.",
      hint: "The 7th rank is where the rook does the most damage.",
      solution: "c1c7",
      success: "Rc7 attacks b7 and f7 and ties Black down."
    },
    {
      type: "try",
      fen: "8/pp3kpp/4p3/8/8/4P3/PP3PPP/6K1 w - - 0 1",
      prompt: "White to move in an equal-material endgame. Which piece needs to become active first?",
      hint: "In the endgame the king is a strong piece. Bring it toward the centre.",
      solution: "g1f1",
      success: "Kf1 heads for e2 and the centre. (Expanding with f4 is also good.)"
    }
  ]
} satisfies Lesson;
