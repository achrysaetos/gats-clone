import type { Point } from './camera.ts';
import { GUN_IDS, GUNS, type GunId, type WeaponId } from '../shared/defs.ts';
import type { SoundCue } from './sfx.ts';

export const MAX_SHAKE_PX = 10;
const DECAY_PER_MS = 1 / 700;
const MAX_SHAKE_PER_AXIS_PX = MAX_SHAKE_PX / Math.SQRT2;

export const addTrauma = (t: number, amount: number) => Math.min(1, Math.max(0, t + amount));
export const decay = (t: number, dtMs: number) => Math.max(0, t - dtMs * DECAY_PER_MS);

const wobble = (now: number, seed: number) =>
  (Math.sin(now * 0.031 + seed) + 0.6 * Math.sin(now * 0.047 + seed * 3) + 0.4 * Math.sin(now * 0.073 + seed * 7)) / 2;

export function offset(t: number, now: number): Point {
  const k = MAX_SHAKE_PER_AXIS_PX * t * t;
  return { x: k * wobble(now, 1), y: k * wobble(now, 5) };
}

const RECOIL: Partial<Record<WeaponId, number>> = { shotgun: 0.22, sniper: 0.3 };

/** How far your own shot shoves the camera back along your aim, in screen px, before the spring returns it. */
export const KICK_PX: Record<WeaponId, number> = { pistol: 4, smg: 2.5, shotgun: 9, assault: 3.5, sniper: 12, lmg: 3 };
const KICK_STAGE = 0.15;
const KICK_BLAST = 5;
export const KICK_MAX_PX = 16;
const KICK_RETURN_MS = 70;

export const NO_KICK: Point = { x: 0, y: 0 };

export function kickPx(gun: GunId): number {
  const g = GUNS[gun];
  return KICK_PX[g.base] * (1 + KICK_STAGE * g.stage) + (g.blast ? KICK_BLAST : 0);
}

/** Adds a shot's shove against its aim, capped so a held trigger never drags the view off its player. */
export function addKick(kick: Point, gun: GunId, angle: number): Point {
  const px = kickPx(gun);
  const x = kick.x - Math.cos(angle) * px, y = kick.y - Math.sin(angle) * px;
  const len = Math.hypot(x, y);
  return len <= KICK_MAX_PX ? { x, y } : { x: (x / len) * KICK_MAX_PX, y: (y / len) * KICK_MAX_PX };
}

export function settleKick(kick: Point, dtMs: number): Point {
  const k = Math.exp(-Math.max(0, dtMs) / KICK_RETURN_MS);
  return Math.hypot(kick.x, kick.y) * k < 0.05 ? NO_KICK : { x: kick.x * k, y: kick.y * k };
}

export function traumaFor(cue: SoundCue, listener: Point, viewRadius: number): number {
  if (cue.id === 'hurt') return 0.25 + 0.5 * cue.damageFrac;
  if (cue.id === 'death') return 0.6;
  if (cue.id === 'boom') return 0.7 * Math.max(0, 1 - Math.hypot(cue.x - listener.x, cue.y - listener.y) / viewRadius);
  const gun = cue.self ? GUN_IDS.find((g) => cue.id === `shot:${g}`) : undefined;
  if (gun) return RECOIL[GUNS[gun].base] ?? 0.1;
  if (cue.self && cue.id === 'shot:silenced') return 0.1;
  return 0;
}
