import type { Point } from './camera.ts';
import type { SoundCue, SoundId } from './sfx.ts';

export const MAX_SHAKE_PX = 10;
const DECAY_PER_MS = 1 / 700;

export const addTrauma = (t: number, amount: number) => Math.min(1, Math.max(0, t + amount));
export const decay = (t: number, dtMs: number) => Math.max(0, t - dtMs * DECAY_PER_MS);

/** Incommensurate sines stand in for Perlin noise: smooth, deterministic, bounded by 1. */
const wobble = (now: number, seed: number) =>
  (Math.sin(now * 0.031 + seed) + 0.6 * Math.sin(now * 0.047 + seed * 3) + 0.4 * Math.sin(now * 0.073 + seed * 7)) / 2;

/** Squaring trauma keeps small hits subtle while big ones still land; the √2 keeps the vector within MAX_SHAKE_PX. */
export function offset(t: number, now: number): Point {
  const k = (MAX_SHAKE_PX * t * t) / Math.SQRT2;
  return { x: k * wobble(now, 1), y: k * wobble(now, 5) };
}

const RECOIL: Partial<Record<SoundId, number>> = { 'shot:shotgun': 0.22, 'shot:sniper': 0.3 };

export function traumaFor(cue: SoundCue, listener: Point, viewRadius: number): number {
  if (cue.id === 'hurt') return 0.25 + 0.5 * cue.strength;
  if (cue.id === 'death') return 0.6;
  if (cue.id === 'boom') return 0.7 * Math.max(0, 1 - Math.hypot(cue.x - listener.x, cue.y - listener.y) / viewRadius);
  if (cue.self && cue.id.startsWith('shot:')) return RECOIL[cue.id] ?? 0.1;
  return 0;
}
