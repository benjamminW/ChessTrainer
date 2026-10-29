import { describe, expect, it } from 'vitest';
import { ENGINE_BUILDS, ENGINE_FILE } from '../src/engine/uci';
import { DEFAULT_SETTINGS, loadSettings } from '../src/game/persistence';
import copy from '../scripts/copy-engine.mjs?raw';

/** Files the stockfish package ships (keys only; nothing is loaded). */
const shipped = Object.keys(import.meta.glob('../node_modules/stockfish/bin/*')).map((k) => k.split('/').pop());

describe('engine builds', () => {
  it('points at Stockfish files that exist and that the copy script copies', () => {
    for (const b of Object.values(ENGINE_BUILDS)) {
      const name = b.file.replace('engine/', '');
      expect(shipped).toContain(name);
      expect(shipped).toContain(name.replace('.js', '.wasm'));
      expect(copy).toContain(`'${name}'`);
      expect(copy).toContain(`'${name.replace('.js', '.wasm')}'`);
    }
  });

  it('defaults to the lite build', () => {
    expect(ENGINE_FILE).toBe(ENGINE_BUILDS.lite.file);
    expect(DEFAULT_SETTINGS.engine).toBe('lite');
    expect(loadSettings().engine).toBe('lite');
  });
});
