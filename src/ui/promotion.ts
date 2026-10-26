import type { Color } from '../types';

const CHOICES: [string, string][] = [
  ['q', 'queen'],
  ['r', 'rook'],
  ['b', 'bishop'],
  ['n', 'knight'],
];

/**
 * Shows the promotion picker over the board. Resolves with 'q' | 'r' | 'b' | 'n',
 * or null if dismissed (click outside / Escape).
 */
export function pickPromotion(host: HTMLElement, color: Color): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'promo-overlay';
    const box = document.createElement('div');
    box.className = 'promo-box cg-wrap';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Choose promotion piece');
    const colorName = color === 'w' ? 'white' : 'black';

    const done = (v: string | null) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done(null);
    };

    for (const [code, name] of CHOICES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'promo-choice';
      btn.title = name;
      btn.setAttribute('aria-label', `Promote to ${name}`);
      const piece = document.createElement('piece');
      piece.className = `${name} ${colorName}`;
      btn.append(piece);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        done(code);
      });
      box.append(btn);
    }
    overlay.append(box);
    overlay.addEventListener('click', () => done(null));
    document.addEventListener('keydown', onKey);
    host.append(overlay);
    (box.firstElementChild as HTMLElement).focus();
  });
}
