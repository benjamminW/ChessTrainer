import type { Lesson } from '../../types';

export default {
  id: "trading-when-ahead",
  section: "middlegame",
  order: 5,
  title: "Trading when ahead",
  summary: "Ahead in material? Trade pieces, in the right order.",
  steps: [
    {
      type: "explain",
      fen: "3r2k1/5pp1/7p/8/8/2N5/5PPP/3R2K1 w - - 0 1",
      text: "When you are ahead in material, trade pieces (not pawns). Every trade makes your extra material count for more and leaves the opponent fewer ways to fight back. When you are behind, do the opposite: keep pieces on.",
      arrows: [
        {
          from: "d1",
          to: "d8"
        }
      ]
    },
    {
      type: "explain",
      fen: "3r2k1/pp3ppp/1q6/8/8/2B1Q2P/PP3PP1/3R2K1 w - - 0 1",
      text: "Before any trade, look at what it leaves behind. Here the white rook on d1 is only defended by the queen. If the queen leaves to take on b6, the rook hangs to ...Rxd1+. Trades have an order: start with the one that doesn't loosen anything.",
      arrows: [
        {
          from: "d8",
          to: "d1",
          color: "red"
        }
      ],
      squares: [
        {
          sq: "d1",
          color: "red"
        }
      ]
    },
    {
      type: "try",
      fen: "3r2k1/5pp1/7p/8/8/2N5/5PPP/3R2K1 w - - 0 1",
      prompt: "White is a knight up. Simplify.",
      hint: "Offer the trade of rooks on the d-file.",
      solution: "d1d8",
      success: "Rxd8+ leaves a knight against nothing: an easy win."
    },
    {
      type: "try",
      fen: "3r2k1/pp3ppp/1q6/8/8/2B1Q2P/PP3PP1/3R2K1 w - - 0 1",
      prompt: "White is a bishop up and would like to trade queens. Careful: in which order?",
      hint: "Qxb6 at once allows ...Rxd1+, winning your rook. Trade the rooks first.",
      solution: "d1d8",
      success: "Rxd8+ first. After the rook trade, the queens can come off too."
    },
    {
      type: "try",
      fen: "3r2k1/5ppp/8/8/8/2N5/5PPP/3R2K1 w - - 0 1",
      prompt: "White to move. You were planning to trade rooks. Look closely before you do.",
      hint: "Black's king has no luft.",
      solution: "d1d8",
      success: "Rxd8 is mate. Before trading, always check whether the trade does even more.",
      fastest: true
    }
  ]
} satisfies Lesson;
