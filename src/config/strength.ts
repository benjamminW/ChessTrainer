/**
 * Bot strength tuning — everything that controls how the bot plays lives here.
 *
 * We deliberately do NOT use Stockfish's UCI_LimitStrength/UCI_Elo. Verified on the
 * bundled build (Stockfish 19 Lite WASM, npm `stockfish` 19.0.1):
 *   option name UCI_Elo type spin default 1320 min 1320 max 3190
 *   option name Skill Level type spin default 20 min 0 max 20
 *   option name MultiPV type spin default 1 min 1 max 256
 *   option name Threads type spin default 1 min 1 max 1
 * UCI_Elo can't go below 1320, and its weakening doesn't feel human. Instead the bot:
 *   1. asks the engine for the top `multiPv` moves at `depth`;
 *   2. picks one with probability ∝ exp(−cpLoss / temperature), ignoring moves that
 *      lose more than `maxLoss` centipawns relative to the best;
 *   3. with probability `mistakeChance` (low Elo only), plays a human-looking mistake
 *      instead: hanging a piece, a bad capture, or ignoring a threat (see bot/mistakes.ts);
 *   4. waits a random "thinking" time between thinkMinMs and thinkMaxMs.
 *
 * Values are given at anchor Elos and linearly interpolated in between.
 */

export const ELO_MIN = 400;
export const ELO_MAX = 2500;
export const ELO_STEP = 100;

export interface StrengthParams {
  /** Search depth for the bot's MultiPV search. */
  depth: number;
  /** Number of candidate moves requested from the engine. */
  multiPv: number;
  /** Softmax temperature in centipawns. Lower = more likely to play the best move. */
  temperature: number;
  /** Candidates losing more than this (cp, vs the best move) are never picked from MultiPV. */
  maxLoss: number;
  /** Probability per move of deliberately playing a human-style mistake. */
  mistakeChance: number;
  /** Minimum / maximum loss (cp) for a deliberate mistake, checked by a shallow search. */
  mistakeMinLoss: number;
  mistakeMaxLoss: number;
  /** Randomized thinking time range (ms), including time spent searching. */
  thinkMinMs: number;
  thinkMaxMs: number;
}

export interface StrengthAnchor extends StrengthParams {
  elo: number;
}

export const STRENGTH_TABLE: StrengthAnchor[] = [
  { elo: 400,  depth: 5,  multiPv: 8, temperature: 160, maxLoss: 500, mistakeChance: 0.15, mistakeMinLoss: 150, mistakeMaxLoss: 600,  thinkMinMs: 600, thinkMaxMs: 1800 },
  { elo: 800,  depth: 6,  multiPv: 8, temperature: 100, maxLoss: 350, mistakeChance: 0.06, mistakeMinLoss: 150, mistakeMaxLoss: 450,  thinkMinMs: 700, thinkMaxMs: 2000 },
  { elo: 1200, depth: 8,  multiPv: 6, temperature: 55,  maxLoss: 220, mistakeChance: 0,    mistakeMinLoss: 150, mistakeMaxLoss: 400,  thinkMinMs: 800, thinkMaxMs: 2200 },
  { elo: 1600, depth: 10, multiPv: 6, temperature: 35,  maxLoss: 180, mistakeChance: 0,    mistakeMinLoss: 150, mistakeMaxLoss: 300,  thinkMinMs: 800, thinkMaxMs: 2500 },
  { elo: 2000, depth: 12, multiPv: 5, temperature: 15,  maxLoss: 90,  mistakeChance: 0,    mistakeMinLoss: 150, mistakeMaxLoss: 300,  thinkMinMs: 800, thinkMaxMs: 2500 },
  { elo: 2500, depth: 15, multiPv: 5, temperature: 4,   maxLoss: 40,  mistakeChance: 0,    mistakeMinLoss: 150, mistakeMaxLoss: 300,  thinkMinMs: 600, thinkMaxMs: 2000 },
];

/** Depth for the quick check that a deliberate mistake loses a believable amount. */
export const MISTAKE_CHECK_DEPTH = 8;
/** How many mistake candidates to evaluate in that check. */
export const MISTAKE_SAMPLE_SIZE = 5;

export function clampElo(elo: number): number {
  const stepped = Math.round(elo / ELO_STEP) * ELO_STEP;
  return Math.max(ELO_MIN, Math.min(ELO_MAX, stepped));
}

/** Strength parameters for an Elo, linearly interpolated between table anchors. */
export function paramsForElo(elo: number, table: StrengthAnchor[] = STRENGTH_TABLE): StrengthParams {
  const sorted = [...table].sort((a, b) => a.elo - b.elo);
  if (elo <= sorted[0].elo) return strip(sorted[0]);
  const last = sorted[sorted.length - 1];
  if (elo >= last.elo) return strip(last);
  const i = sorted.findIndex((a) => a.elo > elo);
  const lo = sorted[i - 1];
  const hi = sorted[i];
  const t = (elo - lo.elo) / (hi.elo - lo.elo);
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    depth: Math.round(lerp(lo.depth, hi.depth)),
    multiPv: Math.round(lerp(lo.multiPv, hi.multiPv)),
    temperature: lerp(lo.temperature, hi.temperature),
    maxLoss: lerp(lo.maxLoss, hi.maxLoss),
    mistakeChance: lerp(lo.mistakeChance, hi.mistakeChance),
    mistakeMinLoss: lerp(lo.mistakeMinLoss, hi.mistakeMinLoss),
    mistakeMaxLoss: lerp(lo.mistakeMaxLoss, hi.mistakeMaxLoss),
    thinkMinMs: lerp(lo.thinkMinMs, hi.thinkMinMs),
    thinkMaxMs: lerp(lo.thinkMaxMs, hi.thinkMaxMs),
  };
}

function strip({ elo: _elo, ...p }: StrengthAnchor): StrengthParams {
  return p;
}
