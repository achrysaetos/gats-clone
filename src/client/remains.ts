import type { ArmorId, GunId } from '../shared/defs.ts';

/**
 * Deaths that stay: each fallen soldier plays a fall picked by the killing blow, then lies where it fell, its gun
 * clattering away along the blow. The newest REMAINS_CAP stay; each fades after REMAINS_LIFE_MS, and the oldest fades
 * early when a newer one needs its place.
 */
export const REMAINS_CAP = 24;
export const REMAINS_LIFE_MS = 25_000;
const FADE_MS = 2500;
/** The fall's frames play over this long, the last one being the body. */
export const FALL_MS = 520;
/** The dropped gun skids along the blow at this speed (units per second), slowing to rest. */
const GUN_SPEED = 230;
const GUN_DRAG = 6;
const GUN_SPIN = 9;

export type Fall = 'forward' | 'back' | 'spin';

export type Remains = {
  id: number; x: number; y: number;
  /** The way the body's fall frames are turned: they are baked facing east, so this is the way it faced as it fell. */
  turn: number;
  fall: Fall; color: string; armor: ArmorId; gun: GunId; born: number;
  /** The way the gun skids, and which way it spins. */
  blow: number; spin: number;
  /** When it is gone: its life's end, or sooner once newer bodies push it past the cap. */
  ends: number;
};

/**
 * Which fall a blow gives: a blast spins the body round, a blow from in front throws it back, one from behind folds it
 * forward. `dir` is the way the killing round flew (null when unknown), `aim` the way the victim faced.
 */
export function fallOf(dir: number | null, aim: number, blast: boolean): { fall: Fall; turn: number } {
  if (blast || dir === null) return { fall: 'spin', turn: dir ?? aim };
  const front = Math.cos(dir - aim) < 0;
  return front ? { fall: 'back', turn: dir + Math.PI } : { fall: 'forward', turn: dir };
}

/** Adds a body; past the cap the oldest start fading now. */
export function addRemains(list: readonly Remains[], r: Omit<Remains, 'ends'>): Remains[] {
  const next: Remains[] = [...list.filter((o) => o.id !== r.id || o.born < r.born - FALL_MS), { ...r, ends: r.born + REMAINS_LIFE_MS }];
  const over = next.length - REMAINS_CAP;
  return next.map((o, i) => (i < over ? { ...o, ends: Math.min(o.ends, r.born + FADE_MS) } : o));
}

/** How opaque a body is: whole until it starts fading, then fading out by `ends`. */
export const remainsAlpha = (r: Remains, now: number): number => Math.max(0, Math.min(1, (r.ends - now) / FADE_MS));

export const liveRemains = (list: readonly Remains[], now: number): Remains[] => list.filter((r) => r.ends > now);

/** Where the dropped gun lies `ms` after the death, and how far it has turned: it skids along the blow, slowing. */
export function gunAt(r: Remains, ms: number): { x: number; y: number; angle: number; moving: boolean } {
  const t = Math.max(0, ms) / 1000;
  const travel = (GUN_SPEED / GUN_DRAG) * (1 - Math.exp(-GUN_DRAG * t));
  const turned = (GUN_SPIN / GUN_DRAG) * (1 - Math.exp(-GUN_DRAG * t)) * r.spin;
  return { x: r.x + Math.cos(r.blow) * (travel + 10), y: r.y + Math.sin(r.blow) * (travel + 10), angle: r.turn + turned, moving: Math.exp(-GUN_DRAG * t) > 0.05 };
}
