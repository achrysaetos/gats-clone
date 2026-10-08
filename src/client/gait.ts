import { WORLD } from '../shared/defs.ts';

/** A soldier's legs: where they were last drawn, the way they walk and how far through the run cycle they are (0..1). */
export type Stride = { x: number; y: number; at: number; heading: number; phase: number; moving: boolean };

/** One run cycle covers this much ground, so feet keep pace with the floor at any speed. */
const CYCLE_UNITS = 150;
/** Slower than this reads as standing still, so interpolation jitter never twitches the legs. */
const STILL_SPEED = WORLD.baseSpeed * 0.15;
/** A gap this long (a teleport, a respawn, a tab coming back) restarts the stride instead of running across it. */
const STALE_MS = 250;

/** The legs one frame on from `prev`, for a body now at (x, y). */
export function stride(prev: Stride | undefined, x: number, y: number, now: number): Stride {
  if (!prev || now - prev.at > STALE_MS || now <= prev.at) return { x, y, at: now, heading: prev?.heading ?? 0, phase: prev?.phase ?? 0, moving: false };
  const dx = x - prev.x, dy = y - prev.y, d = Math.hypot(dx, dy);
  const moving = (d * 1000) / (now - prev.at) > STILL_SPEED;
  return { x, y, at: now, heading: moving ? Math.atan2(dy, dx) : prev.heading, phase: moving ? (prev.phase + d / CYCLE_UNITS) % 1 : prev.phase, moving };
}

/** The legs frame to draw: the standing frame, or one of `runFrames` run frames by phase. */
export const legFrame = (s: Stride, stand: number, runFrom: number, runFrames: number): number =>
  s.moving ? runFrom + Math.floor(s.phase * runFrames) % runFrames : stand;
