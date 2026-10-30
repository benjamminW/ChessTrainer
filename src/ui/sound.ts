/**
 * Sound effects, synthesized with the Web Audio API (no audio files to download or license).
 * Every board plays move sounds through Board.render(); the app adds event sounds (game over,
 * right and wrong answers). Browsers only allow audio after the first click or key press, so
 * the context is created then.
 */

export type SoundKind = 'move' | 'capture' | 'castle' | 'check' | 'promote' | 'start' | 'end' | 'correct' | 'wrong';

/** Which sound a board change makes: compares piece placements (FEN boards) and the last move. */
export function moveSoundFor(prevPlacement: string | null, placement: string, lastMove: [string, string] | null, check: boolean): SoundKind | null {
  if (!lastMove || prevPlacement === null || prevPlacement === placement) return null;
  if (check) return 'check';
  const before = squares(prevPlacement);
  const after = squares(placement);
  const [from, to] = lastMove;
  const moved = after.get(to);
  const was = before.get(from);
  if (moved && (moved === 'K' || moved === 'k') && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2) return 'castle';
  if (moved && was && (was === 'P' || was === 'p') && moved.toLowerCase() !== 'p') return 'promote';
  if (after.size < before.size) return 'capture';
  return 'move';
}

function squares(placement: string): Map<string, string> {
  const out = new Map<string, string>();
  placement.split('/').forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else out.set(`${'abcdefgh'[f++]}${8 - i}`, ch);
    }
  });
  return out;
}

class Sounds {
  enabled = true;
  /** 0–1. */
  volume = 0.7;
  private ctx: AudioContext | null = null;
  private lastAt = 0;

  /** Call from a user gesture: browsers block audio until then. */
  unlock(): void {
    if (!this.enabled) return;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null; // no Web Audio: stay silent
    }
  }

  play(kind: SoundKind): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    // Two board updates in the same instant (e.g. a move and its re-render) make one sound.
    const now = this.ctx.currentTime;
    if (now - this.lastAt < 0.04) return;
    this.lastAt = now;
    const out = this.ctx.createGain();
    out.gain.value = this.volume;
    out.connect(this.ctx.destination);
    PATCHES[kind](this.ctx, out, now);
  }
}

type Patch = (ctx: AudioContext, out: AudioNode, t: number) => void;

/** A short wooden knock: filtered noise plus a low thump. */
function knock(ctx: AudioContext, out: AudioNode, t: number, o: { pitch?: number; level?: number; thump?: number } = {}): void {
  const level = o.level ?? 0.5;
  const len = 0.08;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = o.pitch ?? 1700;
  band.Q.value = 1.2;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(level, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + len);
  noise.connect(band).connect(ng).connect(out);
  noise.start(t);
  noise.stop(t + len);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(o.thump ?? 190, t);
  osc.frequency.exponentialRampToValueAtTime((o.thump ?? 190) * 0.6, t + 0.07);
  const og = ctx.createGain();
  og.gain.setValueAtTime(level * 0.8, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  osc.connect(og).connect(out);
  osc.start(t);
  osc.stop(t + 0.1);
}

/** A soft bell-like note. */
function tone(ctx: AudioContext, out: AudioNode, t: number, freq: number, dur = 0.18, level = 0.18, type: OscillatorType = 'sine'): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const PATCHES: Record<SoundKind, Patch> = {
  move: (c, o, t) => knock(c, o, t),
  capture: (c, o, t) => {
    knock(c, o, t, { pitch: 1300, level: 0.75, thump: 150 });
    knock(c, o, t + 0.035, { pitch: 2200, level: 0.3 });
  },
  castle: (c, o, t) => {
    knock(c, o, t);
    knock(c, o, t + 0.09, { pitch: 1500 });
  },
  check: (c, o, t) => {
    knock(c, o, t);
    tone(c, o, t + 0.02, 988, 0.16, 0.12, 'triangle');
  },
  promote: (c, o, t) => {
    knock(c, o, t);
    tone(c, o, t + 0.03, 784, 0.12);
    tone(c, o, t + 0.11, 1175, 0.2);
  },
  start: (c, o, t) => {
    tone(c, o, t, 523, 0.25, 0.12);
    tone(c, o, t + 0.08, 659, 0.3, 0.12);
  },
  end: (c, o, t) => {
    tone(c, o, t, 523, 0.5, 0.12);
    tone(c, o, t + 0.12, 659, 0.5, 0.11);
    tone(c, o, t + 0.24, 784, 0.7, 0.11);
  },
  correct: (c, o, t) => {
    tone(c, o, t, 880, 0.14, 0.14);
    tone(c, o, t + 0.09, 1319, 0.25, 0.14);
  },
  wrong: (c, o, t) => {
    tone(c, o, t, 220, 0.18, 0.1, 'triangle');
    tone(c, o, t + 0.12, 175, 0.26, 0.1, 'triangle');
  },
};

export const sounds = new Sounds();
