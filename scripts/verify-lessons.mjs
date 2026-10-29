// Checks every lesson under src/learn/lessons/ with a chess engine, so no lesson teaches a wrong move:
//   - the schema (src/learn/validate.ts): ids, legal FENs, legal solution moves;
//   - Try steps: the solution must be as good as the best move. With 7 pieces or fewer the Lichess
//     tablebase decides (same result: win stays win, draw stays draw); otherwise Stockfish
//     (full NNUE, depth LEARN_CONFIG.verifyDepth) must rate it within the step's win% margin;
//   - claims ("a win for White", "a draw") and Practice goals must hold.
// Exits with code 1 and a list of problems if anything fails.
//
//   npm run verify:lessons            (needs network for the tablebase; answers are cached in data/)
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Chess } from 'chess.js';
import { winPercent } from '../src/coach/ratingMoves.ts';
import { LEARN_CONFIG } from '../src/config/learn.ts';
import { allProblems, pieceCount } from '../src/learn/validate.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The Stockfish loader replaces the global fetch while it starts, so keep Node's own.
const httpFetch = globalThis.fetch.bind(globalThis);
const require = createRequire(import.meta.url);
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

// ------------------------------------------------------------ lessons

const dir = join(root, 'src/learn/lessons');
const lessons = [];
for (const section of readdirSync(dir)) {
  for (const f of readdirSync(join(dir, section)).filter((f) => f.endsWith('.ts'))) {
    lessons.push((await import(pathToFileURL(join(dir, section, f)).href)).default);
  }
}
const problems = allProblems(lessons);

// ------------------------------------------------------------ engine (Stockfish in Node)

const MATE = 100000;
let engine;
let listener = () => {};
function startEngine() {
  engine = require('stockfish')('single', (line) => listener(line));
  return send('uci', (l) => l === 'uciok').then(() => send('isready', (l) => l === 'readyok'));
}
function send(cmd, done) {
  return new Promise((resolve) => {
    if (done) listener = (l) => done(l) && resolve();
    engine.processCommand(cmd);
    if (!done) resolve();
  });
}
/** Lines best first: { uci, cp } with cp from the side to move (mates as ±(MATE − n)). */
async function analyze(fen, depth = LEARN_CONFIG.verifyDepth, multiPv = 4) {
  const lines = new Map();
  await send(`setoption name MultiPV value ${multiPv}`);
  await send(`position fen ${fen}`);
  await new Promise((resolve) => {
    listener = (l) => {
      const m = /^info .*depth (\d+).* multipv (\d+) score (cp|mate) (-?\d+).* pv (\S+)/.exec(l);
      if (m) {
        const v = Number(m[4]);
        const cp = m[3] === 'mate' ? (v > 0 ? MATE - v : -MATE - v) : v;
        lines.set(Number(m[2]), { uci: m[5], cp });
      }
      if (l.startsWith('bestmove')) resolve();
    };
    engine.processCommand(`go depth ${depth}`);
  });
  return [...lines.values()].sort((a, b) => b.cp - a.cp);
}
/** Mover-POV score of a move: from the MultiPV lines, or by searching the position after it. */
async function moveScore(fen, uci, lines) {
  const own = lines.find((l) => l.uci === uci);
  if (own) return own.cp;
  const c = new Chess(fen);
  c.move(uci);
  if (c.isCheckmate()) return MATE;
  if (c.isDraw()) return 0;
  const after = await analyze(c.fen(), LEARN_CONFIG.verifyDepth, 1);
  return -(after[0]?.cp ?? 0);
}

// ------------------------------------------------------------ tablebase (cached on disk, one request at a time)

const cacheFile = join(root, 'data/tablebase-cache.json');
const tbCache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
async function probe(fen) {
  const key = fen.split(' ').slice(0, 5).join(' ');
  if (tbCache[key]) return tbCache[key];
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await httpFetch(`https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(fen)}`);
    if (res.status === 429) {
      console.log('  tablebase rate limit: waiting 60 s…');
      await new Promise((r) => setTimeout(r, 60_000));
      continue;
    }
    if (!res.ok) throw new Error(`tablebase HTTP ${res.status}`);
    tbCache[key] = await res.json();
    return tbCache[key];
  }
  throw new Error('tablebase kept rate-limiting');
}
const outcome = (c) => (c === 'win' || c === 'maybe-win' ? 'win' : c === 'loss' || c === 'maybe-loss' ? 'loss' : c === 'unknown' ? null : 'draw');
const flip = (o) => (o === 'win' ? 'loss' : o === 'loss' ? 'win' : o);
const RANK = { win: 2, draw: 1, loss: 0 };
/** Result for `side` in this position: tablebase when possible, else the engine. */
async function resultFor(fen, side) {
  const toMove = fen.split(' ')[1];
  if (pieceCount(fen) <= 7) {
    const o = outcome((await probe(fen)).category);
    return { result: toMove === side ? o : flip(o), how: 'tablebase' };
  }
  const best = (await analyze(fen, LEARN_CONFIG.verifyDepth, 1))[0]?.cp ?? 0;
  const cp = toMove === side ? best : -best;
  const result = winPercent(cp) >= LEARN_CONFIG.verifyWinPct ? 'win' : Math.abs(cp) <= LEARN_CONFIG.verifyDrawCp ? 'draw' : winPercent(cp) <= 100 - LEARN_CONFIG.verifyWinPct ? 'loss' : 'unclear';
  return { result, how: `engine ${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)}` };
}

// ------------------------------------------------------------ checks

await startEngine();
let checked = 0;
for (const l of lessons) {
  if (only && l.id !== only) continue;
  for (const [i, s] of l.steps.entries()) {
    const at = `${l.id} step ${i + 1} (${s.type})`;
    try {
      if (s.claim) {
        const r = await resultFor(s.fen, s.claim.side);
        if (r.result !== s.claim.result) problems.push(`${at}: claims a ${s.claim.result} for ${s.claim.side}, but it's ${r.result} (${r.how})`);
        checked++;
      }
      if (s.type === 'try') {
        const side = s.fen.split(' ')[1];
        if (pieceCount(s.fen) <= 7) {
          const tb = await probe(s.fen);
          const best = Math.max(...tb.moves.map((m) => RANK[flip(outcome(m.category))] ?? -1));
          const sol = tb.moves.find((m) => m.uci === s.solution);
          const got = sol ? RANK[flip(outcome(sol.category))] : -1;
          if (got < best) problems.push(`${at}: solution ${s.solution} is ${flip(outcome(sol?.category))} but the position is a ${Object.keys(RANK).find((k) => RANK[k] === best)} (tablebase)`);
          if (s.fastest && sol) {
            const dist = (m) => (m.checkmate ? 0 : Math.abs(m.dtm ?? m.dtz ?? 0));
            const quickest = Math.min(...tb.moves.filter((m) => RANK[flip(outcome(m.category))] === best).map(dist));
            if (dist(sol) > quickest) problems.push(`${at}: "fastest" solution ${s.solution} isn't the quickest win`);
          }
        } else {
          const lines = await analyze(s.fen);
          const bestCp = lines[0]?.cp ?? 0;
          const solCp = await moveScore(s.fen, s.solution, lines);
          const drop = Math.max(0, winPercent(bestCp) - winPercent(solCp));
          const margin = s.margin ?? LEARN_CONFIG.tryMargin;
          if (drop > margin) problems.push(`${at}: solution ${s.solution} loses ${drop.toFixed(1)} win% against ${lines[0]?.uci} (margin ${margin})`);
        }
        void side;
        checked++;
      }
      if (s.type === 'practice') {
        const r = await resultFor(s.fen, s.userColor);
        const ok = s.goal === 'win' ? r.result === 'win' : r.result === 'draw' || r.result === 'win';
        if (!ok) problems.push(`${at}: goal "${s.goal}" for ${s.userColor}, but the position is ${r.result} for them (${r.how})`);
        checked++;
      }
    } catch (e) {
      problems.push(`${at}: could not check (${e instanceof Error ? e.message : e})`);
    }
  }
}
engine.terminate?.();
mkdirSync(dirname(cacheFile), { recursive: true });
writeFileSync(cacheFile, JSON.stringify(tbCache));

if (problems.length) {
  console.error(`✗ ${problems.length} problem${problems.length === 1 ? '' : 's'} in ${lessons.length} lessons:`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`✓ ${lessons.length} lessons, ${checked} positions and moves verified.`);
process.exit(0);
