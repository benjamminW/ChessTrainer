// Builds src/coach/ratingCalibration.json: average win% drop per counted move → rating, per time class.
//
// Source: the Lichess open database (CC0), https://database.lichess.org/ — rated standard games.
// About 9% of those games carry Lichess's own engine evaluation after every move ([%eval …]),
// which is all this needs: a move's drop is the mover's win% before it minus after it.
//
//   node scripts/build-rating-calibration.mjs                       download a slice and build
//   node scripts/build-rating-calibration.mjs --input <file.pgn.zst> use a local file instead
//   options: --month 2024-01  --bytes 300000000  --min-moves 15
//
// Moves are counted with the app's own rules (src/coach/ratingMoves.ts, run directly with Node's
// type stripping), so the table matches what it's applied to. Ratings are Lichess (Glicko-2) ratings.
//
// Method: for each player-game with enough counted moves, take the average drop. Group by the
// player's rating (100-point bins), take the median average drop per bin, force it to fall as the
// rating rises, and store the (drop, rating) pairs; the app interpolates between them. Also stores
// the spread of single-game estimates around the real rating, used for the displayed range.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { countMoves, isEvenRecapture, winPercent } from '../src/coach/ratingMoves.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const MONTH = arg('month', '2024-01');
const BYTES = Number(arg('bytes', 300_000_000));
const MIN_MOVES = Number(arg('min-moves', 15));
const MATE_CP = 100000;
const BIN = 100;
/** Bins with fewer player-games than this are left out of the table. */
const MIN_BIN = 40;

// ------------------------------------------------------------ opening book (same rules as src/review/openings.ts)

const posKey = (fen) => fen.split(' ').slice(0, 4).join(' ');
function buildBookNext() {
  const lines = JSON.parse(readFileSync(join(root, 'public/openings.json'), 'utf8'));
  const next = new Map();
  for (const [, , ucis] of lines) {
    const chess = new Chess();
    for (const uci of ucis.split(' ').filter(Boolean)) {
      const key = posKey(chess.fen());
      if (!next.has(key)) next.set(key, new Set());
      next.get(key).add(uci);
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    }
    const end = posKey(chess.fen());
    if (!next.has(end)) next.set(end, new Set());
  }
  return next;
}
const bookNext = buildBookNext();

// ------------------------------------------------------------ input

async function input() {
  const local = arg('input', null);
  if (local) return local;
  const dir = join(root, 'data/calibration');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `lichess-${MONTH}-head.pgn.zst`);
  if (!existsSync(file)) {
    const url = `https://database.lichess.org/standard/lichess_db_standard_rated_${MONTH}.pgn.zst`;
    console.log(`Downloading the first ${(BYTES / 1e6).toFixed(0)} MB of ${url}…`);
    const res = await fetch(url, { headers: { Range: `bytes=0-${BYTES - 1}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return file;
}

function timeClass(event) {
  const e = event.toLowerCase();
  if (e.includes('bullet')) return 'bullet';
  if (e.includes('blitz')) return 'blitz';
  if (e.includes('rapid') || e.includes('classical')) return 'rapid';
  if (e.includes('correspondence')) return 'daily';
  return null;
}

function parseEval(s) {
  if (s.startsWith('#')) {
    const n = Number(s.slice(1));
    return n > 0 ? MATE_CP - n : -MATE_CP - n;
  }
  return Math.round(Number(s) * 100);
}

/** SAN moves with the White-POV eval after each (null where missing). */
function parseMovetext(text) {
  const out = [];
  const re = /(?:\d+\.(?:\.\.)?\s*)?([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O-O[+#]?|O-O[+#]?)[?!]{0,2}\s*(?:\{([^}]*)\})?/g;
  let m;
  while ((m = re.exec(text))) {
    const ev = m[2] && /\[%eval ([^\]]+)\]/.exec(m[2]);
    out.push({ san: m[1], eval: ev ? parseEval(ev[1].trim()) : null });
  }
  return out;
}

/** Counted drops for both players of one game, or null if the game can't be used. */
function analyzeGame(headers, movetext) {
  if (!movetext.includes('%eval')) return null;
  const tc = timeClass(headers.Event ?? '');
  const we = Number(headers.WhiteElo);
  const be = Number(headers.BlackElo);
  if (!tc || !we || !be) return null;
  const sans = parseMovetext(movetext);
  const chess = new Chess();
  const moves = [];
  let prevEval = 20; // the start position is about +0.2
  let prev = null;
  let inBook = true;
  for (const { san, eval: ev } of sans) {
    const fenBefore = chess.fen();
    const legalMoves = chess.moves().length;
    let mv;
    try {
      mv = chess.move(san);
    } catch {
      return null;
    }
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    if (inBook && !bookNext.get(posKey(fenBefore))?.has(uci) && !bookNext.has(posKey(mv.after))) inBook = false;
    if (ev === null) break; // the final (mating) move has no eval after it
    const s = mv.color === 'w' ? 1 : -1;
    moves.push({
      color: mv.color,
      winBefore: winPercent(prevEval * s),
      winAfter: winPercent(ev * s),
      inBook,
      legalMoves,
      gapWin: null, // the database has no second-best move
      evenRecapture: isEvenRecapture(fenBefore, uci, prev),
    });
    prev = { fenBefore, uci };
    prevEval = ev;
  }
  const counted = countMoves(moves);
  return [
    { tc, rating: we, drops: counted.w.drops },
    { tc, rating: be, drops: counted.b.drops },
  ];
}

// ------------------------------------------------------------ read

const file = await input();
console.log(`Reading ${file}…`);
const zstd = spawn('zstd', ['-dc', file], { stdio: ['ignore', 'pipe', 'ignore'] });
const rl = createInterface({ input: zstd.stdout, crlfDelay: Infinity });
const samples = [];
let games = 0;
let withEval = 0;
let headers = {};
let movetext = '';
const flush = () => {
  if (movetext) {
    games++;
    const r = analyzeGame(headers, movetext);
    if (r) {
      withEval++;
      for (const s of r) if (s.drops.length >= MIN_MOVES) samples.push({ tc: s.tc, rating: s.rating, n: s.drops.length, avg: s.drops.reduce((a, b) => a + b, 0) / s.drops.length });
    }
    if (games % 50000 === 0) console.log(`  ${games} games, ${withEval} with evals, ${samples.length} player-games`);
  }
  headers = {};
  movetext = '';
};
for await (const line of rl) {
  if (line.startsWith('[')) {
    if (movetext) flush();
    const m = /^\[(\w+) "(.*)"\]$/.exec(line);
    if (m) headers[m[1]] = m[2];
  } else if (line.trim()) movetext += line + ' ';
}
// The slice ends mid-game: the last partial game is dropped.
console.log(`${games} games read, ${withEval} with evals, ${samples.length} player-games with ≥ ${MIN_MOVES} counted moves.`);

// ------------------------------------------------------------ fit

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

function fit(rows) {
  const bins = new Map();
  for (const r of rows) {
    const b = Math.floor(r.rating / BIN) * BIN + BIN / 2;
    if (!bins.has(b)) bins.set(b, []);
    bins.get(b).push(r.avg);
  }
  let pts = [...bins].filter(([, v]) => v.length >= MIN_BIN).sort((a, b) => a[0] - b[0]).map(([rating, v]) => ({ rating, drop: median(v), n: v.length }));
  // Pool-adjacent-violators: the median drop must not rise with rating.
  const blocks = pts.map((p) => ({ ...p, w: p.n }));
  for (let i = 0; i < blocks.length - 1; ) {
    if (blocks[i].drop < blocks[i + 1].drop) {
      const a = blocks[i];
      const b = blocks[i + 1];
      const w = a.w + b.w;
      blocks.splice(i, 2, { rating: (a.rating * a.w + b.rating * b.w) / w, drop: (a.drop * a.w + b.drop * b.w) / w, n: a.n + b.n, w });
      if (i > 0) i--;
    } else i++;
  }
  pts = blocks;
  // Table rows sorted by drop (ascending), the shape coach/estimate.ts expects.
  const table = pts.map((p) => [Number(p.drop.toFixed(3)), Math.round(p.rating)]).sort((a, b) => a[0] - b[0]);
  return table;
}

function interp(table, drop) {
  if (drop <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (drop >= last[0]) return last[1];
  const i = table.findIndex(([d]) => d > drop);
  const [d0, r0] = table[i - 1];
  const [d1, r1] = table[i];
  return r0 + ((drop - d0) / (d1 - d0)) * (r1 - r0);
}

/** Spread of single-game estimates around the real rating, scaled to 40 counted moves. */
function spread(rows, table) {
  // Residual² × n / 40 averages to σ²(40) if the noise shrinks as √n.
  const z = rows.map((r) => ((interp(table, r.avg) - r.rating) ** 2 * r.n) / 40);
  return Math.round(Math.sqrt(z.reduce((a, b) => a + b, 0) / z.length));
}

const out = {
  source: `Lichess open database (CC0), rated standard games, first ${(BYTES / 1e6).toFixed(0)} MB of ${MONTH}`,
  scale: 'lichess',
  builtAt: new Date().toISOString().slice(0, 10),
  minCountedMoves: MIN_MOVES,
  classes: {},
};
for (const tc of ['all', 'bullet', 'blitz', 'rapid', 'daily']) {
  const rows = tc === 'all' ? samples : samples.filter((s) => s.tc === tc);
  if (rows.length < MIN_BIN * 5) {
    console.log(`${tc}: ${rows.length} player-games, too few for a table`);
    continue;
  }
  const table = fit(rows);
  out.classes[tc] = { samples: rows.length, sigma40: spread(rows, table), table };
  console.log(`${tc}: ${rows.length} player-games, ${table.length} rows, σ(40 moves) ≈ ${out.classes[tc].sigma40}`);
  console.log('   ' + table.map(([d, r]) => `${d}→${r}`).join('  '));
}
writeFileSync(join(root, 'src/coach/ratingCalibration.json'), JSON.stringify(out, null, 1) + '\n');
console.log('Wrote src/coach/ratingCalibration.json');
