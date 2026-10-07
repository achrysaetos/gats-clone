import type { Point } from './camera.ts';
import { GUN_IDS, GUNS, type GunId } from '../shared/defs.ts';
import type { SoundCue } from './sfx.ts';

export const MAX_SHAKE_PX = 14;
const DECAY_PER_MS = 1 / 700;
const MAX_SHAKE_PER_AXIS_PX = MAX_SHAKE_PX / Math.SQRT2;

export const addTrauma = (t: number, amount: number) => Math.min(1, Math.max(0, t + amount));
export const decay = (t: number, dtMs: number) => Math.max(0, t - dtMs * DECAY_PER_MS);

const wobble = (now: number, seed: number) =>
  (Math.sin(now * 0.031 + seed) + 0.6 * Math.sin(now * 0.047 + seed * 3) + 0.4 * Math.sin(now * 0.073 + seed * 7)) / 2;

export function offset(t: number, now: number): Point {
  // Steeper than linear so small trauma stays subtle, but a near blast is felt: trauma 0.35 shakes ~2px, a point-blank grenade ~10px.
  const k = MAX_SHAKE_PER_AXIS_PX * t ** 1.5;
  return { x: k * wobble(now, 1), y: k * wobble(now, 5) };
}

/**
 * How heavy a gun feels to fire, 0..1: from what one pull throws downrange, plus a machine gun's bulk.
 * A pistol or SMG barely moves you; a shotgun, a bolt-action or a hand cannon shoves.
 */
export function heftOf(gun: GunId): number {
  const def = GUNS[gun];
  const punch = (def.damage * def.pellets - 18) / 110;
  return Math.min(1, Math.max(0, punch) + (def.base === 'lmg' ? 0.3 : 0));
}

/** Your own shot's camera trauma: heavier guns shake more, scaled down for fast-firing guns so a held trigger rumbles rather than blurs. */
const shotTrauma = (gun: GunId) => (0.08 + 0.3 * heftOf(gun)) * Math.min(1, GUNS[gun].fireMs / 110);

/** A blast's shake reaches this share of the view and is felt most within its own radius; `r` scales it from a crate's pop up to a grenade. */
const BOOM = { reach: 0.85, near: 0.75, far: 0.12, fullRadius: 150, minSize: 0.35, defaultR: 100 } as const;

function boomTrauma(cue: SoundCue, listener: Point, viewRadius: number): number {
  const d = Math.hypot(cue.x - listener.x, cue.y - listener.y);
  const closeness = Math.max(0, 1 - d / (viewRadius * BOOM.reach));
  if (closeness === 0) return 0;
  const size = Math.min(1, Math.max(BOOM.minSize, (cue.r ?? BOOM.defaultR) / BOOM.fullRadius));
  return size * (BOOM.far + BOOM.near * closeness * closeness);
}

/** Your own big gun shoves the camera back along your aim, this many px at full heft, easing out over `ms`. */
export const RECOIL_KICK = { px: 10, maxPx: 12, ms: 90 } as const;

export type Kick = { x: number; y: number };

export function addKick(k: Kick, gun: GunId, angle: number): Kick {
  const push = RECOIL_KICK.px * heftOf(gun);
  const x = k.x - Math.cos(angle) * push, y = k.y - Math.sin(angle) * push;
  const len = Math.hypot(x, y);
  const cap = len > RECOIL_KICK.maxPx ? RECOIL_KICK.maxPx / len : 1;
  return { x: x * cap, y: y * cap };
}

export const settleKick = (k: Kick, dtMs: number): Kick => {
  const f = Math.exp(-dtMs / RECOIL_KICK.ms);
  return Math.abs(k.x) + Math.abs(k.y) < 0.05 ? { x: 0, y: 0 } : { x: k.x * f, y: k.y * f };
};

export const KILL_PUNCH = { base: 0.22, perStep: 0.04, big: 0.42 } as const;

export function traumaFor(cue: SoundCue, listener: Point, viewRadius: number): number {
  if (cue.id === 'hurt') return 0.25 + 0.5 * cue.damageFrac;
  if (cue.id === 'death') return 0.6;
  // Your kill lands with a short punch, harder as the streak climbs and hardest for a bounty, revenge or shutdown.
  if (cue.id === 'kill') return KILL_PUNCH.base;
  if (cue.id.startsWith('kill:')) return KILL_PUNCH.base + KILL_PUNCH.perStep * (Number(cue.id.slice(5)) - 1);
  if (cue.id === 'bounty') return KILL_PUNCH.big;
  if (cue.id === 'boom' || cue.id === 'barrel:burst') return boomTrauma(cue, listener, viewRadius);
  const gun = cue.self ? GUN_IDS.find((g) => cue.id === `shot:${g}`) : undefined;
  if (gun) return shotTrauma(gun);
  if (cue.self && cue.id === 'shot:silenced') return 0.1;
  return 0;
}
