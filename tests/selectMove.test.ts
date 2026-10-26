import { describe, expect, it } from 'vitest';
import { findPlausibleMistakes } from '../src/bot/mistakes';
import {
  candidateWeights, pickCandidate, pickMistake, rollMistake, seededRng, thinkDelay, weightedIndex,
  type Candidate,
} from '../src/bot/selectMove';
import { ELO_MAX, ELO_MIN, ELO_STEP, STRENGTH_TABLE, clampElo, paramsForElo } from '../src/config/strength';

// Typical MultiPV output: best move, a few reasonable ones, and some bad ones.
const CANDS: Candidate[] = [
  { uci: 'e2e4', cp: 40 },
  { uci: 'd2d4', cp: 30 },
  { uci: 'g1f3', cp: 15 },
  { uci: 'b1c3', cp: -20 },
  { uci: 'a2a4', cp: -90 },
  { uci: 'g2g4', cp: -250 },
  { uci: 'f2f3', cp: -400 },
];

function frequencies(elo: number, trials = 4000, seed = 1): Map<string, number> {
  const rng = seededRng(seed);
  const p = paramsForElo(elo);
  const counts = new Map<string, number>();
  for (let i = 0; i < trials; i++) {
    const c = pickCandidate(CANDS, p, rng).uci;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  for (const [k, v] of counts) counts.set(k, v / trials);
  return counts;
}

describe('paramsForElo', () => {
  it('returns anchor values exactly at anchors', () => {
    for (const a of STRENGTH_TABLE) {
      const p = paramsForElo(a.elo);
      expect(p.temperature).toBe(a.temperature);
      expect(p.depth).toBe(a.depth);
      expect(p.mistakeChance).toBe(a.mistakeChance);
    }
  });

  it('interpolates linearly between anchors', () => {
    const p = paramsForElo(1000); // halfway between 800 and 1200
    expect(p.temperature).toBeCloseTo((140 + 70) / 2);
    expect(p.mistakeChance).toBeCloseTo(0.07);
    expect(p.maxLoss).toBeCloseTo(450);
  });

  it('clamps outside the table', () => {
    expect(paramsForElo(100)).toEqual(paramsForElo(400));
    expect(paramsForElo(3000)).toEqual(paramsForElo(2500));
  });

  it('gets monotonically stronger across the whole 400–2500 range', () => {
    let prev = paramsForElo(ELO_MIN);
    for (let elo = ELO_MIN + ELO_STEP; elo <= ELO_MAX; elo += ELO_STEP) {
      const p = paramsForElo(elo);
      expect(p.temperature).toBeLessThanOrEqual(prev.temperature);
      expect(p.maxLoss).toBeLessThanOrEqual(prev.maxLoss);
      expect(p.mistakeChance).toBeLessThanOrEqual(prev.mistakeChance);
      expect(p.depth).toBeGreaterThanOrEqual(prev.depth);
      prev = p;
    }
  });

  it('only makes deliberate mistakes below 1200', () => {
    expect(paramsForElo(1100).mistakeChance).toBeGreaterThan(0);
    for (let elo = 1200; elo <= ELO_MAX; elo += ELO_STEP) expect(paramsForElo(elo).mistakeChance).toBe(0);
  });
});

describe('clampElo', () => {
  it('rounds to the step and clamps to range', () => {
    expect(clampElo(1249)).toBe(1200);
    expect(clampElo(1250)).toBe(1300);
    expect(clampElo(0)).toBe(400);
    expect(clampElo(9999)).toBe(2500);
  });
});

describe('candidateWeights', () => {
  it('gives the best move weight 1 and decays with loss', () => {
    const w = candidateWeights(CANDS, { temperature: 50, maxLoss: 1000 });
    expect(w[0]).toBe(1);
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeLessThan(w[i - 1]);
    expect(w[1]).toBeCloseTo(Math.exp(-10 / 50));
  });

  it('zeroes candidates beyond maxLoss', () => {
    // Losses vs best: 0, 10, 25, 60, 130, 290, 440.
    const w = candidateWeights(CANDS, { temperature: 1000, maxLoss: 150 });
    expect(w.slice(0, 5).every((x) => x > 0)).toBe(true);
    expect(w[5]).toBe(0);
    expect(w[6]).toBe(0);
  });

  it('does not depend on candidate order', () => {
    const rev = [...CANDS].reverse();
    const w = candidateWeights(rev, { temperature: 50, maxLoss: 1000 });
    expect(w[rev.length - 1]).toBe(1);
  });

  it('handles mate scores without NaN', () => {
    const w = candidateWeights([{ uci: 'a', cp: 99997 }, { uci: 'b', cp: 50 }], { temperature: 200, maxLoss: 900 });
    expect(w).toEqual([1, 0]);
  });
});

describe('weightedIndex', () => {
  it('maps the rng draw onto cumulative weights', () => {
    const w = [1, 1, 2];
    expect(weightedIndex(w, () => 0)).toBe(0);
    expect(weightedIndex(w, () => 0.3)).toBe(1);
    expect(weightedIndex(w, () => 0.6)).toBe(2);
    expect(weightedIndex(w, () => 0.999999)).toBe(2);
  });

  it('never returns a zero-weight index', () => {
    expect(weightedIndex([1, 0, 0], () => 0.999999)).toBe(0);
  });
});

describe('pickCandidate (distribution by Elo)', () => {
  it('at 2500 plays the best move almost always', () => {
    expect(frequencies(2500).get('e2e4')!).toBeGreaterThan(0.9);
  });

  it('at 400 spreads choices widely', () => {
    const f = frequencies(400);
    expect(f.get('e2e4')!).toBeLessThan(0.4);
    expect(f.size).toBeGreaterThanOrEqual(5);
  });

  it('plays the best move more often as Elo rises', () => {
    let prev = 0;
    for (const elo of [400, 800, 1200, 1600, 2000, 2500]) {
      const best = frequencies(elo).get('e2e4') ?? 0;
      expect(best).toBeGreaterThan(prev);
      prev = best;
    }
  });

  it('never picks a candidate beyond maxLoss', () => {
    // At 1600 maxLoss is 180, so g2g4 (−290) and f2f3 (−440) are excluded.
    const f = frequencies(1600);
    expect(f.has('g2g4')).toBe(false);
    expect(f.has('f2f3')).toBe(false);
  });

  it('is deterministic for a given seed', () => {
    const p = paramsForElo(800);
    const run = () => {
      const rng = seededRng(42);
      return Array.from({ length: 20 }, () => pickCandidate(CANDS, p, rng).uci);
    };
    expect(run()).toEqual(run());
  });
});

describe('mistakes', () => {
  it('rolls mistakes at roughly mistakeChance', () => {
    const rng = seededRng(7);
    let n = 0;
    for (let i = 0; i < 10000; i++) if (rollMistake({ mistakeChance: 0.3 }, rng)) n++;
    expect(n / 10000).toBeCloseTo(0.3, 1);
    expect(rollMistake({ mistakeChance: 0 }, () => 0)).toBe(false);
  });

  it('pickMistake keeps only losses inside the configured window', () => {
    const evaluated = [
      { uci: 'tiny', cp: 30 }, // loss 10 — not a real mistake
      { uci: 'ok', cp: -200 }, // loss 240
      { uci: 'huge', cp: -2000 }, // loss 2040 — too absurd
    ];
    const p = { mistakeMinLoss: 150, mistakeMaxLoss: 700 };
    for (let i = 0; i < 20; i++) expect(pickMistake(evaluated, 40, p, Math.random)!.uci).toBe('ok');
    expect(pickMistake([{ uci: 'tiny', cp: 30 }], 40, p, Math.random)).toBeNull();
  });

  it('finds a hanging-piece move and a bad capture', () => {
    // White to move after 1.e4 e5 2.Nf3 d5. Ng5 walks into the d8 queen with no defender.
    const fen = 'rnbqkbnr/ppp2ppp/8/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3';
    const ms = findPlausibleMistakes(fen);
    const ucis = ms.map((m) => m.uci);
    expect(ucis).toContain('f3g5'); // knight to g5: attacked by the queen, undefended
    // exd5 is a fine capture (pawn takes pawn), so it must not be listed as bad.
    expect(ucis).not.toContain('e4d5');
    expect(ms.every((m) => ['hangs-piece', 'bad-capture', 'ignores-threat'].includes(m.kind))).toBe(true);
  });

  it('never offers a checkmating move as a "mistake"', () => {
    // Back-rank mate available: Ra8#.
    const ms = findPlausibleMistakes('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
    expect(ms.map((m) => m.uci)).not.toContain('a1a8');
  });

  it('flags moves that ignore a threatened piece', () => {
    // Black's bishop on c5 is attacked by the d4 pawn; a random pawn move ignores it.
    const fen = 'rnbqk1nr/pppp1ppp/8/2b1p3/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 3';
    const ms = findPlausibleMistakes(fen);
    expect(ms).toContainEqual({ uci: 'h7h6', kind: 'ignores-threat' });
    expect(ms.map((m) => m.uci)).not.toContain('c5b6'); // moving the bishop away is not ignoring it
  });
});

describe('thinkDelay', () => {
  it('stays within range and subtracts time already spent', () => {
    const p = { thinkMinMs: 1000, thinkMaxMs: 2000 };
    expect(thinkDelay(p, 0, () => 0)).toBe(1000);
    expect(thinkDelay(p, 0, () => 0.5)).toBe(1500);
    expect(thinkDelay(p, 400, () => 0.5)).toBe(1100);
    expect(thinkDelay(p, 5000, () => 0.5)).toBe(0);
  });
});
