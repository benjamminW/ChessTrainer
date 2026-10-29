// Builds the puzzle set in public/puzzles/ from the Lichess puzzle database (CC0).
//
//   node scripts/build-puzzles.mjs                      download (cached in data/) and build
//   node scripts/build-puzzles.mjs --input <file>       use a local .csv.zst or .csv instead
//
// It streams the file (≈300 MB compressed, ≈1 GB of CSV), keeps popular, well-rated
// puzzles, samples a balanced set per 100-point rating band, and writes one small JSON
// file per band plus an index. Only the generated JSON is committed; data/ is git-ignored.
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createZstdDecompress } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CONFIG = {
  url: 'https://database.lichess.org/lichess_db_puzzle.csv.zst',
  cache: join(root, 'data', 'lichess_db_puzzle.csv.zst'),
  out: join(root, 'public', 'puzzles'),
  /** Lichess popularity is −100…100 (share of upvotes); keep well-liked puzzles. */
  minPopularity: 80,
  /** Enough plays for the rating to mean something. */
  minPlays: 500,
  /** Rating deviation: lower = more settled rating. */
  maxRatingDeviation: 90,
  bandMin: 400,
  bandMax: 2800, // last band is 2800–2899
  bandSize: 100,
  perBand: 120,
  /** Per band, keep at least this many puzzles of each filterable theme (when the data has them). */
  themeQuota: 5,
  /** Same seed → same sample, so regenerating doesn't churn the committed files. */
  seed: 20261028,
};

// The expected header (verified against the file published 2 Oct 2026).
const COLUMNS = ['PuzzleId', 'FEN', 'Moves', 'Rating', 'RatingDeviation', 'Popularity', 'NbPlays', 'Themes', 'GameUrl', 'OpeningTags', 'DailyDate'];

const FILTER_THEMES = JSON.parse(readFileSync(join(root, 'src', 'puzzles', 'themeNames.json'), 'utf8')).filters;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixed-size uniform random sample of a stream (Algorithm R). */
class Reservoir {
  constructor(size, random) {
    this.size = size;
    this.random = random;
    this.items = [];
    this.seen = 0;
  }
  offer(item) {
    this.seen++;
    if (this.items.length < this.size) this.items.push(item);
    else {
      const j = Math.floor(this.random() * this.seen);
      if (j < this.size) this.items[j] = item;
    }
  }
}

async function source(args) {
  const i = args.indexOf('--input');
  const file = i >= 0 ? args[i + 1] : CONFIG.cache;
  if (i < 0 && !existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    console.log(`[puzzles] downloading ${CONFIG.url} …`);
    const res = await fetch(CONFIG.url);
    if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(file + '.part'));
    renameSync(file + '.part', file);
  }
  console.log(`[puzzles] reading ${file}`);
  const raw = createReadStream(file);
  return file.endsWith('.zst') ? raw.pipe(createZstdDecompress()) : raw;
}

async function main() {
  const random = rng(CONFIG.seed);
  const bands = new Map(); // band → { all: Reservoir, themes: Map<theme, Reservoir> }
  for (let b = CONFIG.bandMin; b <= CONFIG.bandMax; b += CONFIG.bandSize) {
    bands.set(b, {
      all: new Reservoir(CONFIG.perBand, random),
      themes: new Map(FILTER_THEMES.map((t) => [t, new Reservoir(CONFIG.themeQuota, random)])),
    });
  }

  const lines = createInterface({ input: await source(process.argv.slice(2)), crlfDelay: Infinity });
  let header = null;
  let n = 0;
  let kept = 0;
  for await (const line of lines) {
    if (!header) {
      header = line.split(',');
      const missing = COLUMNS.slice(0, 8).filter((c) => !header.includes(c));
      if (missing.length) throw new Error(`unexpected CSV header, missing: ${missing.join(', ')}`);
      continue;
    }
    if (++n % 1_000_000 === 0) console.log(`[puzzles] ${n.toLocaleString()} rows, ${kept.toLocaleString()} kept`);
    const f = line.split(',');
    const col = (name) => f[header.indexOf(name)];
    const rating = Number(col('Rating'));
    const band = Math.floor(rating / CONFIG.bandSize) * CONFIG.bandSize;
    const bucket = bands.get(band);
    if (!bucket) continue;
    if (Number(col('Popularity')) < CONFIG.minPopularity) continue;
    if (Number(col('NbPlays')) < CONFIG.minPlays) continue;
    if (Number(col('RatingDeviation')) > CONFIG.maxRatingDeviation) continue;
    kept++;
    const themes = col('Themes');
    const record = [col('PuzzleId'), col('FEN'), col('Moves'), rating, themes];
    bucket.all.offer(record);
    for (const t of themes.split(' ')) bucket.themes.get(t)?.offer(record);
  }

  rmSync(CONFIG.out, { recursive: true, force: true });
  mkdirSync(CONFIG.out, { recursive: true });
  const index = {
    source: 'Lichess puzzle database (database.lichess.org), CC0',
    generated: new Date().toISOString().slice(0, 10),
    filters: { minPopularity: CONFIG.minPopularity, minPlays: CONFIG.minPlays, maxRatingDeviation: CONFIG.maxRatingDeviation },
    bands: [],
  };
  for (const [band, bucket] of bands) {
    // Theme quotas first, then fill up to perBand with the uniform sample.
    const picked = new Map();
    for (const r of bucket.themes.values()) for (const p of r.items) picked.set(p[0], p);
    for (const p of bucket.all.items) {
      if (picked.size >= CONFIG.perBand) break;
      picked.set(p[0], p);
    }
    const puzzles = [...picked.values()].sort((a, b) => a[3] - b[3]);
    if (!puzzles.length) continue;
    writeFileSync(join(CONFIG.out, `${band}.json`), JSON.stringify(puzzles) + '\n');
    const themeCounts = {};
    for (const t of FILTER_THEMES) themeCounts[t] = puzzles.filter((p) => p[4].split(' ').includes(t)).length;
    index.bands.push({ band, count: puzzles.length, themes: themeCounts });
  }
  writeFileSync(join(CONFIG.out, 'index.json'), JSON.stringify(index, null, 1) + '\n');
  const total = index.bands.reduce((s, b) => s + b.count, 0);
  console.log(`[puzzles] ${n.toLocaleString()} rows read, ${kept.toLocaleString()} passed filters, wrote ${total} puzzles in ${index.bands.length} bands to public/puzzles/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
