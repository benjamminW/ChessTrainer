import type { StrengthParams } from '../config/strength';

/** A candidate move with its score in centipawns from the bot's (side to move) POV. */
export interface Candidate {
  uci: string;
  cp: number;
}

export type Rng = () => number;

/** Deterministic PRNG (mulberry32) for tests and reproducible games. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Selection weight of each candidate: exp(−loss / temperature), where loss is
 * the centipawn deficit versus the best candidate. Candidates losing more than
 * `maxLoss` get weight 0. The best candidate always has weight 1.
 */
export function candidateWeights(
  candidates: Candidate[],
  p: Pick<StrengthParams, 'temperature' | 'maxLoss'>,
): number[] {
  if (candidates.length === 0) return [];
  const best = Math.max(...candidates.map((c) => c.cp));
  const t = Math.max(p.temperature, 1e-6);
  return candidates.map((c) => {
    const loss = best - c.cp;
    if (loss > p.maxLoss) return 0;
    return Math.exp(-loss / t);
  });
}

/** Index chosen from `weights` using one draw of `rng`. */
export function weightedIndex(weights: number[], rng: Rng): number {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return 0;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  // Floating-point leftovers: return the last non-zero weight.
  for (let i = weights.length - 1; i >= 0; i--) if (weights[i] > 0) return i;
  return 0;
}

/** Picks a move from the engine's MultiPV candidates according to strength. */
export function pickCandidate(candidates: Candidate[], p: StrengthParams, rng: Rng): Candidate {
  if (candidates.length === 0) throw new Error('no candidates');
  return candidates[weightedIndex(candidateWeights(candidates, p), rng)];
}

/** Should this move be a deliberate human-style mistake? */
export function rollMistake(p: Pick<StrengthParams, 'mistakeChance'>, rng: Rng): boolean {
  return p.mistakeChance > 0 && rng() < p.mistakeChance;
}

/**
 * Among evaluated mistake candidates, keeps those whose loss vs `bestCp` is within
 * [mistakeMinLoss, mistakeMaxLoss] and picks one uniformly. Null if none qualify.
 */
export function pickMistake(
  evaluated: Candidate[],
  bestCp: number,
  p: Pick<StrengthParams, 'mistakeMinLoss' | 'mistakeMaxLoss'>,
  rng: Rng,
): Candidate | null {
  const ok = evaluated.filter((c) => {
    const loss = bestCp - c.cp;
    return loss >= p.mistakeMinLoss && loss <= p.mistakeMaxLoss;
  });
  if (ok.length === 0) return null;
  return ok[Math.floor(rng() * ok.length)];
}

/** Thinking delay still to wait, given how long the search already took. */
export function thinkDelay(p: Pick<StrengthParams, 'thinkMinMs' | 'thinkMaxMs'>, elapsedMs: number, rng: Rng): number {
  const target = p.thinkMinMs + rng() * (p.thinkMaxMs - p.thinkMinMs);
  return Math.max(0, target - elapsedMs);
}
