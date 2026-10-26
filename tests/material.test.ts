import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { materialSummary } from '../src/game/material';
import { Session, newGameState } from '../src/game/session';

describe('materialSummary', () => {
  it('is empty at the start', () => {
    expect(materialSummary(new Chess().fen())).toEqual({
      w: { captured: [], lead: 0 },
      b: { captured: [], lead: 0 },
    });
  });

  it('lists captures for the side that made them and the lead', () => {
    // 1.e4 d5 2.exd5 Qxd5 3.Nc3 Qxg2?? 4.Bxg2: White wins the queen, Black has two pawns.
    const s = new Session(newGameState('w', 1200));
    for (const m of ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5g2', 'f1g2']) s.play(m, 'user');
    const m = materialSummary(s.fenAt());
    expect(m.w.captured).toEqual(['p', 'q']);
    expect(m.b.captured).toEqual(['p', 'p']);
    expect(m.w.lead).toBe(8);
    expect(m.b.lead).toBe(0);
  });

  it('sorts captured pieces cheapest first', () => {
    // White has captured two rooks, a knight and two pawns.
    const m = materialSummary('1nbqkb2/2pppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1');
    expect(m.w.captured).toEqual(['p', 'p', 'n', 'r', 'r']);
  });

  it('keeps the lead exact after a promotion', () => {
    // White's h-pawn became a second queen (on e4); Black is missing nothing.
    const m = materialSummary('rnbqkbnr/pppppppp/8/8/4Q3/8/PPPPPPP1/RNBQKBNR w KQkq - 0 1');
    expect(m.w.lead).toBe(8); // +9 for the queen, −1 for the pawn
    expect(m.b.captured).toEqual(['p']); // the promoted pawn shows as missing
  });
});
