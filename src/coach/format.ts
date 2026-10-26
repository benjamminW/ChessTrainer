import { mateIn } from './classify';

/** Formats a White-POV eval: "+0.35", "−1.20", "#3", "#−2", "#" (mate on board). */
export function formatEval(cpWhite: number): string {
  const mate = mateIn(cpWhite);
  if (mate !== null) {
    if (mate === 0) return '#';
    return mate > 0 ? `#${mate}` : `#−${-mate}`;
  }
  const v = (cpWhite / 100).toFixed(2);
  return cpWhite > 0 ? `+${v}` : cpWhite < 0 ? v.replace('-', '−') : '0.00';
}

/** SAN list → "12. Nf3 Nc6 13. Bb5" (or "12… Nc6 13. Bb5" when Black moves first). */
export function formatLine(fen: string, san: string[]): string {
  const [, turn, , , , full] = fen.split(' ');
  let n = Number(full) || 1;
  let white = turn === 'w';
  const out: string[] = [];
  san.forEach((s, i) => {
    if (white) out.push(`${n}. ${s}`);
    else out.push(i === 0 ? `${n}… ${s}` : s);
    if (!white) n++;
    white = !white;
  });
  return out.join(' ');
}

/** Share of the eval bar that is White, 0..1. */
export function whiteShare(cpWhite: number): number {
  const mate = mateIn(cpWhite);
  if (mate !== null) return cpWhite > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-cpWhite / 400));
}
