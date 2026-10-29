import { formatEval } from '../coach/format';
import { winPercent } from '../coach/ratingMoves';
import { clampElo } from '../config/strength';
import { GOAL_LABELS, suggestGoal, type PracticeGoal } from '../game/practice';
import type { Color } from '../types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const side = (c: Color) => (c === 'w' ? 'White' : 'Black');

export interface PracticeChoice {
  userColor: Color;
  elo: number;
  goal: PracticeGoal;
}

/**
 * Asks how to play a position: which side, the coach's strength and the goal. The goal is
 * suggested from the eval for the side you pick (until you change it yourself).
 */
export function askPractice(o: { fen: string; evalWhite: number | null; label: string; retry: boolean; elo: number }): Promise<PracticeChoice | null> {
  const dlg = $<HTMLDialogElement>('practice-dialog');
  const mover = o.fen.split(' ')[1] as Color;
  const other: Color = mover === 'w' ? 'b' : 'w';
  $('pd-title').textContent = o.retry ? 'Try this position again' : 'Play from here';
  $('pd-where').textContent = o.retry ? `Just before your mistake in ${o.label}.` : `From ${o.label}.`;
  $('pd-mover').textContent = `${side(mover)} (the side to move)`;
  $('pd-other').textContent = `${side(other)} (the other side)`;
  const radios = [...dlg.querySelectorAll<HTMLInputElement>('input[name=pd-side]')];
  radios.forEach((r) => (r.checked = r.value === 'mover'));
  const elo = $<HTMLInputElement>('pd-elo');
  elo.value = String(o.elo);
  $('pd-elo-out').textContent = elo.value;
  elo.oninput = () => ($('pd-elo-out').textContent = elo.value);
  const goal = $<HTMLSelectElement>('pd-goal');
  let touched = false;
  goal.onchange = () => (touched = true);
  const color = () => (radios.find((r) => r.checked)?.value === 'other' ? other : mover);
  const suggest = () => {
    const c = color();
    const g = suggestGoal(o.evalWhite, c);
    if (!touched) goal.value = g;
    $('pd-goal-why').textContent = o.evalWhite === null
      ? 'No engine eval for this position yet, so no goal is suggested.'
      : `Suggested: ${GOAL_LABELS[g]}. Eval ${formatEval(o.evalWhite)}, about ${Math.round(winPercent(c === 'w' ? o.evalWhite : -o.evalWhite))}% winning chances for ${side(c)}.`;
  };
  radios.forEach((r) => (r.onchange = suggest));
  suggest();
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.onclose = () => resolve(dlg.returnValue === 'start' ? { userColor: color(), elo: clampElo(+elo.value), goal: goal.value as PracticeGoal } : null);
  });
}
