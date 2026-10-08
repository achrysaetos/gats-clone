/**
 * Bringing the gun up after a sprint, as the player sees it. The sim keeps the gun from firing for its `raiseMsOf` after a
 * sprint ends; this module shows that wait on the soldier (the gun swings from the carry across the chest up to the aim,
 * snapping on with a small overshoot) and on the reticle (spread wide, greyed and dotless while the gun is down, then
 * snapping in with a click the moment it can fire). Clicking while it is down gives a soft "not yet" tick.
 */
import { clickFindsGunDown, raiseLeftOf, type Firing } from './fire.ts';

/* --------------------------------------------------------------- the body ------------------------------------------------------------ */

/** How fast the gun drops into the sprint carry (ms for the whole way), and the overshoot past the aim once it is up. */
export const CARRY = { downMs: 140, overshoot: 0.16, overshootMs: 200, lift: 0.12, liftK: 0.2, ease: 1.5 } as const;

/**
 * The carry pose `sinceEnd` ms after a sprint ended, the gun having been `from` (0..1) of the way into the carry: 1 is
 * fully across the chest, 0 on the aim, and a little below 0 swung just past it. It lifts off the chest a touch first,
 * then swings up faster and faster so it lands on the aim exactly when the gun can fire (`raiseMs`), overshoots and settles.
 */
export function carryAt(sinceEnd: number, raiseMs: number, from: number): number {
  if (sinceEnd < 0) return from;
  if (sinceEnd < raiseMs) {
    const k = sinceEnd / raiseMs;
    if (k < CARRY.liftK) return from * (1 - CARRY.lift * (k / CARRY.liftK));
    const t = (k - CARRY.liftK) / (1 - CARRY.liftK);
    return from * (1 - CARRY.lift) * (1 - t ** CARRY.ease);
  }
  const u = (sinceEnd - raiseMs) / CARRY.overshootMs;
  if (u >= 1) return 0;
  return -CARRY.overshoot * from * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u);
}

type Track = { sprint: boolean; amount: number; t: number; endAt: number; from: number };
const tracks = new Map<number, Track>();
let prunedAt = 0;

/**
 * Each body's carry this frame: the gun drops into the carry quickly while it sprints, and comes back up over its gun's whole
 * `raiseMs` from the moment the sprint ends (see `carryAt`). `reduced` (reduced motion) skips the overshoot and the easing.
 */
export function stepCarry(id: number, sprinting: boolean, raiseMs: number, now: number, reduced: boolean): number {
  const prev = tracks.get(id);
  let tr: Track;
  if (!prev) tr = { sprint: sprinting, amount: sprinting ? 1 : 0, t: now, endAt: -Infinity, from: 0 };
  else if (sprinting) {
    const dt = Math.min(100, Math.max(0, now - prev.t));
    tr = { ...prev, sprint: true, amount: reduced ? 1 : Math.min(1, (prev.sprint ? prev.amount : Math.max(0, prev.amount)) + dt / CARRY.downMs), t: now };
  } else {
    const ended = prev.sprint;
    const endAt = ended ? now : prev.endAt;
    const from = ended ? prev.amount : prev.from;
    const since = now - endAt;
    const amount = reduced ? (since < raiseMs ? from : 0) : carryAt(since, raiseMs, from);
    tr = { sprint: false, amount, t: now, endAt, from };
  }
  tracks.set(id, tr);
  if (now - prunedAt > 5000) {
    prunedAt = now;
    for (const [k, v] of tracks) if (now - v.t > 5000) tracks.delete(k);
  }
  return tr.amount;
}

/* ------------------------------------------------------------- the reticle ----------------------------------------------------------- */

export type GunPhase = 'sprint' | 'raising' | 'ready';

/** Your gun's state as of the newest input sent: sprinting (down), coming up (no shot yet), or up. */
export const gunPhaseOf = (f: Firing): GunPhase => (f.trigger.sprint ? 'sprint' : raiseLeftOf(f) > 0 ? 'raising' : 'ready');

/** The lowered reticle's gap is this share of the widest; it snaps in over `snapMs` with a little overshoot; a "not yet" click shakes it. */
export const RETICLE_RAISE = { lowShare: 0.8, lowAlpha: 0.55, snapMs: 160, flashMs: 220, shakeMs: 240, shakePx: 4 } as const;

export type ReticleLook = {
  /** The gap from the centre to each arm, px. */
  gap: number;
  alpha: number;
  /** Drawn grey instead of in the crosshair's own colour (the gun is down). */
  grey: boolean;
  /** The centre dot (none while the gun is down; it pops in as the gun comes up). */
  dot: number;
  /** 0..1, a white flash over the arms as they snap in. */
  flash: number;
  /** Sideways jolt, px, after a click the gun was down for. */
  shake: number;
};

const easeOutBack = (u: number) => { const c = 1.9; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };

/**
 * How the reticle is drawn for the gun's `phase`, `gap` being the spread's own gap and `maxGap` the widest it ever opens.
 * While the gun is down it sits lowered: splayed wide, grey, faint and dotless. `sinceReady` ms after the gun came up it snaps
 * in to `gap`, overshooting a hair, with a flash; `sinceDenied` ms after a click it was down for, it shakes.
 */
export function reticleLook(phase: GunPhase, gap: number, maxGap: number, sinceReady: number, sinceDenied: number): ReticleLook {
  const shakeK = sinceDenied >= 0 && sinceDenied < RETICLE_RAISE.shakeMs ? sinceDenied / RETICLE_RAISE.shakeMs : 1;
  const shake = shakeK < 1 ? Math.sin(shakeK * Math.PI * 5) * RETICLE_RAISE.shakePx * (1 - shakeK) : 0;
  const low = Math.max(gap, maxGap * RETICLE_RAISE.lowShare);
  if (phase !== 'ready') return { gap: low, alpha: RETICLE_RAISE.lowAlpha, grey: true, dot: 0, flash: 0, shake };
  if (sinceReady < 0 || sinceReady >= RETICLE_RAISE.flashMs) return { gap, alpha: 1, grey: false, dot: 1, flash: 0, shake };
  const u = Math.min(1, sinceReady / RETICLE_RAISE.snapMs);
  const e = easeOutBack(u);
  return {
    gap: Math.max(1, low + (gap - low) * e), alpha: RETICLE_RAISE.lowAlpha + (1 - RETICLE_RAISE.lowAlpha) * Math.min(1, u * 2), grey: false,
    dot: Math.min(1.6, e * 1.3), flash: 1 - sinceReady / RETICLE_RAISE.flashMs, shake,
  };
}

/** Tracks your gun's phase frame to frame: when it last came up (for the snap) and when a click last found it down. */
export function createRaiseWatch() {
  let phase: GunPhase = 'ready';
  let readyAt = -Infinity;
  let deniedAt = -Infinity;
  return {
    /** Steps to this frame's phase; true the frame the gun comes up from a raise (play the click). */
    step(f: Firing | null, now: number): boolean {
      const next = f && f.trigger.alive ? gunPhaseOf(f) : 'ready';
      const up = phase === 'raising' && next === 'ready';
      if (up) readyAt = now;
      if (next !== 'ready') readyAt = -Infinity;
      phase = next;
      return up;
    },
    /** A click was made: true (and noted, for the shake) when it found the gun down, so it fires nothing. */
    click(f: Firing | null, now: number): boolean {
      const down = !!f && clickFindsGunDown(f);
      if (down) deniedAt = now;
      return down;
    },
    get phase() { return phase; },
    sinceReady: (now: number) => now - readyAt,
    sinceDenied: (now: number) => now - deniedAt,
  };
}

/** The one watch for your own gun, shared by the HUD (which draws and steps it) and the page (which reports clicks). */
export const raiseWatch = createRaiseWatch();
