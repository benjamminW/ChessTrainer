// Copies the Stockfish WASM build from node_modules into public/engine so Vite
// serves it as a static file (dev) and copies it into dist/ (build).
// Runs automatically on `npm install` via the postinstall script.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The "lite single-threaded" build: ~1.8 MB, no SharedArrayBuffer, so it needs
// no COOP/COEP headers and works on GitHub Pages. Keep in sync with
// ENGINE_FILE in src/engine/uci.ts.
const FILES = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish', 'bin');
const dest = join(root, 'public', 'engine');

if (!existsSync(src)) {
  console.warn('[copy-engine] node_modules/stockfish not found; skipping.');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const f of FILES) {
  copyFileSync(join(src, f), join(dest, f));
  console.log(`[copy-engine] ${f} -> public/engine/`);
}
