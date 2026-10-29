import { BOARDS, PIECE_SETS } from '../themes/catalog';
import type { GameState } from '../types';

const GAME_KEY = 'chess-coach:game:v1';
const SETTINGS_KEY = 'chess-coach:settings:v1';

export interface Settings {
  elo: number;
  colorChoice: 'w' | 'b' | 'random';
  /** Show explanations, eval bar and arrows while the game is in progress. */
  coachDuringPlay: boolean;
  /** Open the game review automatically when a game ends. */
  autoReview: boolean;
  /** Which mode the app is in. */
  mode: 'play' | 'puzzles';
  /** An id from BOARDS in src/themes/catalog.ts. */
  boardTheme: string;
  /** An id from PIECE_SETS in src/themes/catalog.ts. */
  pieceSet: string;
}

export const DEFAULT_SETTINGS: Settings = {
  elo: 1200,
  colorChoice: 'w',
  coachDuringPlay: true,
  autoReview: true,
  mode: 'play',
  boardTheme: 'brown',
  pieceSet: 'classic',
};

// localStorage can throw (private mode, blocked storage); the app works without it.
export function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function loadGame(): GameState | null {
  const g = read<GameState>(GAME_KEY);
  return g && g.version === 1 && Array.isArray(g.plies) ? g : null;
}

export function saveGame(state: GameState): void {
  write(GAME_KEY, state);
}

export function loadSettings(): Settings {
  const s = { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(SETTINGS_KEY) };
  // Fall back if a saved theme no longer exists.
  if (!BOARDS.some((b) => b.id === s.boardTheme)) s.boardTheme = DEFAULT_SETTINGS.boardTheme;
  if (!PIECE_SETS.some((p) => p.id === s.pieceSet)) s.pieceSet = DEFAULT_SETTINGS.pieceSet;
  return s;
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}
