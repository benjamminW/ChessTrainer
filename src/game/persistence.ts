import type { GameState } from '../types';

const GAME_KEY = 'chess-coach:game:v1';
const SETTINGS_KEY = 'chess-coach:settings:v1';

export interface Settings {
  elo: number;
  colorChoice: 'w' | 'b' | 'random';
  /** Show explanations, eval bar and arrows while the game is in progress. */
  coachDuringPlay: boolean;
}

export const DEFAULT_SETTINGS: Settings = { elo: 1200, colorChoice: 'w', coachDuringPlay: true };

// localStorage can throw (private mode, blocked storage); the app works without it.
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
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
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(SETTINGS_KEY) };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}
