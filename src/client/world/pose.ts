import { GUNS, type GunId } from '../../shared/defs.ts';
import type { Stride } from '../gait.ts';
import { cycleOf, RELOAD_BEATS, RELOAD_FRAMES, reloadFamily, type ReloadFamily } from '../reload.ts';
import { SOLDIER } from './catalog.ts';

/**
 * What a soldier is doing with the hands and feet, picked from what the snapshot and recent events say, so the painter
 * only looks frames up. Everything here is a pure function of its inputs, so tests can pin each pick.
 */

/** A hit's frames and jolt last this long; the hit flash is shorter. */
export const FLINCH_MS = 200;
/** How far a hit jolts the drawn body along the round's flight, in game units, before it eases back. */
const JOLT = 3.2;
/** How long a throw and a knife swing show, split evenly over their frames. */
const MOVE_MS = 300;
/** A dash's three frames: push off, flight, skid. */
const DASH_MS = 260;
/** Breathing: one in-breath frame shown for this share of each cycle. */
const BREATH_MS = 1700;
/** How far a pump or bolt travels back, in game units, and how long each half of the stroke takes. */
const ACTION_TRAVEL = { pump: 5, bolt: 3.5 } as const;
const STROKE_MS = 90;

export type Torso = { sprite: 'soldier' | 'soldier.act'; frame: number };
/** The gun's moving parts: whether the magazine is in, how far back the pump or bolt sits (game units). */
export type GunParts = { mag: boolean; action: number };
export type Legs = { heading: number; frame: number };

/** How hard a gun kicks the drawn soldier, 0.35 for the lightest to 1 for the heaviest: one shot's damage, pellets summed. */
export const kickWeight = (gun: GunId): number => {
  const g = GUNS[gun];
  return Math.max(0.35, Math.min(1, (g.damage * g.pellets) / 60));
};

/** The reload frame for a share of the reload: frames change on the same beats as the reload's sounds. */
export function reloadFrame(family: ReloadFamily, progress: number): number {
  const starts = RELOAD_FRAMES[family];
  let i = 0;
  while (i + 1 < starts.length && progress >= starts[i + 1]!) i++;
  return SOLDIER.act.reload[family][i]!;
}

/** Whether the magazine is in the gun at a share of the reload: out from `magOut` until `magIn`. */
export function magIn(family: ReloadFamily, progress: number | null): boolean {
  if (progress === null) return true;
  const beats = RELOAD_BEATS[family];
  const out = beats.find((b) => b.cue === 'magOut')?.at, back = beats.find((b) => b.cue === 'magIn')?.at;
  return out === undefined || back === undefined || progress < out || progress >= back;
}

/** A stroke back and home again, peaking `travel` at `at`, over 2 * STROKE_MS. */
const stroke = (ms: number, at: number, travel: number) => {
  const t = Math.abs(ms - at) / STROKE_MS;
  return t >= 1 ? 0 : travel * (1 - t * t);
};

/**
 * Where the pump or bolt sits: worked `cycleOf(gun).atMs` after each shot, and on the reload's `pump` or `bolt` beat.
 * `sinceShot` is ms since the last shot, `reload` the share of a running reload and `reloadMs` its length.
 */
export function actionTravel(gun: GunId, sinceShot: number | null, reload: number | null): number {
  const cycle = cycleOf(gun);
  if (!cycle) return 0;
  const travel = ACTION_TRAVEL[cycle.kind];
  let back = sinceShot === null ? 0 : stroke(sinceShot, cycle.atMs, travel);
  if (reload !== null) {
    const beat = RELOAD_BEATS[reloadFamily(gun)].find((b) => b.cue === cycle.kind);
    if (beat) back = Math.max(back, stroke(reload * GUNS[gun].reloadMs, beat.at * GUNS[gun].reloadMs, travel));
  }
  return back;
}

export type TorsoInput = {
  gun: GunId; now: number; id: number;
  /** 0..1 while reloading. */
  reload: number | null;
  /** 1 just fired, fading to 0. */
  kick: number;
  /** The newest hit still flinching: ms since, and whether it came from in front. */
  hit: { ms: number; front: boolean } | null;
  /** A throw or knife swing under way, ms since it started. */
  move: { kind: 'throw' | 'knife'; ms: number } | null;
  moving: boolean;
};

/** The torso frame: a flinch over a throw or knife, over a reload, over recoil, over breathing at rest. */
export function torsoOf(t: TorsoInput): Torso {
  if (t.hit && t.hit.ms < FLINCH_MS) {
    const strip = t.hit.front ? SOLDIER.act.flinchFront : SOLDIER.act.flinchBack;
    return { sprite: 'soldier.act', frame: strip[t.hit.ms < FLINCH_MS / 2 ? 0 : 1] };
  }
  if (t.move && t.move.ms < MOVE_MS) {
    const strip = SOLDIER.act[t.move.kind];
    return { sprite: 'soldier.act', frame: strip[Math.min(strip.length - 1, Math.floor((t.move.ms / MOVE_MS) * strip.length))]! };
  }
  if (t.reload !== null) return { sprite: 'soldier.act', frame: reloadFrame(reloadFamily(t.gun), t.reload) };
  if (t.kick > 0) {
    const strip = kickWeight(t.gun) > 0.6 ? SOLDIER.torso.recoilHeavy : SOLDIER.torso.recoilLight;
    return { sprite: 'soldier', frame: strip[t.kick > 0.5 ? 0 : 1] };
  }
  if (!t.moving && (t.now + t.id * 397) % BREATH_MS > BREATH_MS * 0.55) return { sprite: 'soldier', frame: SOLDIER.torso.breathe };
  return { sprite: 'soldier', frame: SOLDIER.torso.aim };
}

/** How far back the gun sits at a kick: the frames match a full kick for heavy guns, half for light ones. */
export const gunKick = (gun: GunId, kick: number): number => (kickWeight(gun) > 0.6 ? 1 : 0.5) * Math.max(0, kick);

export const gunParts = (gun: GunId, sinceShot: number | null, reload: number | null): GunParts => ({
  mag: magIn(reloadFamily(gun), reload),
  action: actionTravel(gun, sinceShot, reload),
});

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const cycleFrame = (strip: readonly number[], phase: number, reverse: boolean) => {
  const i = Math.floor(phase * strip.length) % strip.length;
  return strip[reverse ? (strip.length - i) % strip.length : i]!;
};

/**
 * The legs: a dash's frames while one runs; else running toward the movement within 60 degrees of the aim, side-stepping
 * facing the aim between 60 and 120, and backpedalling (the run played backwards, facing the aim) beyond.
 */
export function legsOf(st: Stride | undefined, aim: number, dashMs: number | null): Legs {
  if (!st) return { heading: aim, frame: SOLDIER.legs.stand };
  if (dashMs !== null && st.moving) {
    const strip = SOLDIER.legs.dash;
    return { heading: st.heading, frame: strip[Math.min(strip.length - 1, Math.floor((dashMs / DASH_MS) * strip.length))]! };
  }
  if (!st.moving) return { heading: st.heading, frame: SOLDIER.legs.stand };
  const rel = wrap(st.heading - aim);
  const deg = Math.abs(rel) * (180 / Math.PI);
  if (deg <= 60) return { heading: st.heading, frame: cycleFrame(SOLDIER.legs.run, st.phase, false) };
  if (deg < 120) return { heading: aim, frame: cycleFrame(SOLDIER.legs.strafe, st.phase, rel > 0) };
  return { heading: st.heading + Math.PI, frame: cycleFrame(SOLDIER.legs.run, st.phase, true) };
}

/** The hit's jolt: the drawn body pushed along the round's flight, easing back over the flinch. */
export function jolt(hit: { ms: number; dir: number } | null): { dx: number; dy: number } {
  if (!hit || hit.ms >= FLINCH_MS) return { dx: 0, dy: 0 };
  const t = hit.ms / FLINCH_MS, d = JOLT * (1 - t) * (1 - t);
  return { dx: Math.cos(hit.dir) * d, dy: Math.sin(hit.dir) * d };
}

/** Whether a round flying `dir` struck a soldier aiming `aim` from in front. */
export const fromFront = (dir: number, aim: number) => Math.cos(dir - aim) < 0;

/** A soft bob with each footfall (two per run cycle) and a slight lean into the run, in game units. */
export function bob(st: Stride | undefined): { dx: number; dy: number; scale: number } {
  if (!st?.moving) return { dx: 0, dy: 0, scale: 1 };
  const step = Math.abs(Math.sin(st.phase * Math.PI * 2));
  return { dx: Math.cos(st.heading) * 1.1, dy: Math.sin(st.heading) * 1.1 - step * 0.9, scale: 1 + step * 0.018 };
}

/** How far a staggered soldier sways side to side, in game units, and how fast. */
const STUMBLE = { reach: 1.6, ms: 90 } as const;

/** A staggered soldier sways across their aim while the heavy hit slows them; a steady one stays put. */
export function stumble(staggered: boolean, aim: number, now: number): { dx: number; dy: number } {
  if (!staggered) return { dx: 0, dy: 0 };
  const d = STUMBLE.reach * Math.sin((now / STUMBLE.ms) * Math.PI);
  return { dx: -Math.sin(aim) * d, dy: Math.cos(aim) * d };
}
