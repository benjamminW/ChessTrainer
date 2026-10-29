// Builds public/openings.json from the Lichess chess-openings dataset (CC0-1.0):
// https://github.com/lichess-org/chess-openings (a.tsv … e.tsv, columns: eco, name, pgn).
//
//   node scripts/build-openings.mjs                 download the five TSV files and build
//   node scripts/build-openings.mjs --input <dir>   use local a.tsv … e.tsv instead
//
// Output: [[eco, name, "uci uci …"], …] — the app replays these to know every named
// position and which moves stay in theory.
import { Chess } from 'chess.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/';
const FILES = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv'];

async function load(name, dir) {
  if (dir) return readFileSync(join(dir, name), 'utf8');
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

const i = process.argv.indexOf('--input');
const dir = i >= 0 ? process.argv[i + 1] : null;
const out = [];
for (const f of FILES) {
  const [header, ...rows] = (await load(f, dir)).trim().split('\n');
  const cols = header.split('\t');
  if (cols.join(',') !== 'eco,name,pgn') throw new Error(`${f}: unexpected columns ${cols.join(',')}`);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    const chess = new Chess();
    chess.loadPgn(pgn);
    const uci = chess.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''));
    out.push([eco, name, uci.join(' ')]);
  }
}
writeFileSync(join(root, 'public', 'openings.json'), JSON.stringify(out) + '\n');
console.log(`[openings] wrote ${out.length} openings to public/openings.json`);
