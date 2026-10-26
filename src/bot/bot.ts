import { MISTAKE_CHECK_DEPTH, MISTAKE_SAMPLE_SIZE, paramsForElo } from '../config/strength';
import type { Engine } from '../engine/uci';
import { findPlausibleMistakes, type MistakeKind } from './mistakes';
import { pickCandidate, pickMistake, rollMistake, thinkDelay, type Candidate, type Rng } from './selectMove';

export interface BotDecision {
  uci: string;
  source: 'engine' | 'mistake';
  mistakeKind?: MistakeKind;
  /** How much longer to "think" before playing, in ms. */
  delayMs: number;
}

function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Decides the bot's move for `fen` at the given Elo. See config/strength.ts for the algorithm. */
export async function chooseBotMove(engine: Engine, fen: string, elo: number, rng: Rng): Promise<BotDecision> {
  const t0 = performance.now();
  const p = paramsForElo(elo);

  const analysis = await engine.analyze(fen, { depth: p.depth, multiPv: p.multiPv });
  const candidates: Candidate[] = analysis.lines.map((l) => ({ uci: l.pv[0], cp: l.cp }));
  if (candidates.length === 0) {
    if (!analysis.bestmove) throw new Error('engine returned no move');
    candidates.push({ uci: analysis.bestmove, cp: 0 });
  }

  let decision: Omit<BotDecision, 'delayMs'> = { uci: pickCandidate(candidates, p, rng).uci, source: 'engine' };

  if (rollMistake(p, rng)) {
    const pool = shuffle(findPlausibleMistakes(fen), rng).slice(0, MISTAKE_SAMPLE_SIZE);
    if (pool.length > 0) {
      // One restricted search scores all sampled mistakes at once.
      const check = await engine.analyze(fen, {
        depth: MISTAKE_CHECK_DEPTH,
        multiPv: pool.length,
        searchMoves: pool.map((m) => m.uci),
      });
      const evaluated = check.lines.map((l) => ({ uci: l.pv[0], cp: l.cp }));
      const chosen = pickMistake(evaluated, candidates[0].cp, p, rng);
      if (chosen) {
        decision = { uci: chosen.uci, source: 'mistake', mistakeKind: pool.find((m) => m.uci === chosen.uci)?.kind };
      }
    }
  }

  return { ...decision, delayMs: thinkDelay(p, performance.now() - t0, rng) };
}
