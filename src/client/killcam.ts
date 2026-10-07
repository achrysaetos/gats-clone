import type { Point } from './camera.ts';

/**
 * The killcam's timeline and framing, as plain math. After a `beatMs` of the live death the last `leadMs` of the life replay at
 * normal speed, easing to `slowRate` for the last `slowFromMs` before the killing shot, and hold `tailMs` past it.
 */
export const KILLCAM = {
  beatMs: 600, leadMs: 2800, tailMs: 320, slowFromMs: 450, slowEaseMs: 150, slowRate: 0.5, minClipMs: 1200,
  /** Input this soon after the death does not skip: it is the click or key that was still going when you died. */
  guardMs: 350, margin: 150, minRadius: 0.55, maxRadius: 1.1, settleMs: 450, cameraEaseMs: 200,
} as const;

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** Playback speed with the playhead at `head` ms of server time and the killing shot at `deathAt`. */
export const killcamSpeed = (head: number, deathAt: number): number =>
  1 - (1 - KILLCAM.slowRate) * smooth((head - (deathAt - KILLCAM.slowFromMs)) / KILLCAM.slowEaseMs);

/** Moves the playhead on by `dtMs` of real time. */
export const advanceHead = (head: number, dtMs: number, deathAt: number): number => head + Math.min(Math.max(dtMs, 0), 100) * killcamSpeed(head, deathAt);

export const killcamOver = (head: number, deathAt: number): boolean => head >= deathAt + KILLCAM.tailMs;

/** Whether the replay is worth showing: the ring reached back far enough before the death. */
export const clipLongEnough = (firstMs: number, deathAt: number): boolean => deathAt - firstMs >= KILLCAM.minClipMs;

/** Real ms the whole replay takes from its first frame, for the progress bar and the tests. */
export function replayDuration(startMs: number, deathAt: number): number {
  let head = startMs, real = 0;
  while (!killcamOver(head, deathAt) && real < 20_000) { head = advanceHead(head, 10, deathAt); real += 10; }
  return real;
}

/** The view that holds you and your killer both, as a center and a view radius for a screen of `aspect` (width over height). */
export function framing(me: Point, killer: Point | null, viewRadius: number, aspect: number): { center: Point; radius: number } {
  const min = viewRadius * KILLCAM.minRadius, max = viewRadius * KILLCAM.maxRadius;
  if (!killer) return { center: me, radius: Math.min(max, Math.max(min, viewRadius * 0.8)) };
  const center = { x: (me.x + killer.x) / 2, y: (me.y + killer.y) / 2 };
  const halfW = Math.abs(me.x - killer.x) / 2 + KILLCAM.margin, halfH = Math.abs(me.y - killer.y) / 2 + KILLCAM.margin;
  return { center, radius: Math.min(max, Math.max(min, halfW, halfH * aspect)) };
}

/** One step of the camera easing toward its target, frame-rate independent. */
export function easeToward(from: number, to: number, dtMs: number): number {
  return from + (to - from) * (1 - Math.exp(-Math.min(dtMs, 100) / KILLCAM.cameraEaseMs));
}
