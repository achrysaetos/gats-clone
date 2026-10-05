import { WORLD } from '../../shared/defs.ts';
import type { PlayerView } from '../../shared/protocol.ts';
import type { Point } from './nav.ts';

/** The gun as a hand moves it: where it points and how fast it turns (rad/s), where the bot wants it, and the slow error in that want. */
export type AimState = { angle: number; spin: number; want: number; err: number };

/** An enemy a bot has seen, with its velocity smoothed the way an eye reads motion (px/s). It notices them, and starts its flick, at `noticeAtTick`. */
export type Engagement = { id: number; x: number; y: number; vx: number; vy: number; acquiredTick: number; noticeAtTick: number };

/** A spring with `omega` (rad/s) natural frequency and `zeta` damping, capped at `maxSpin` (rad/s) and `maxAccel` (rad/s²). */
export type Hand = { omega: number; zeta: number; maxSpin: number; maxAccel: number };

const DEG = Math.PI / 180;

/** A flick onto an enemy peaks near 800°/s and overshoots a hair before it settles; looking around turns at a calm 240°/s at most. */
export const HANDS = {
  flick: { omega: 22, zeta: 0.72, maxSpin: 800 * DEG, maxAccel: 10_000 * DEG },
  calm: { omega: 9, zeta: 0.9, maxSpin: 240 * DEG, maxAccel: 2_500 * DEG },
} as const satisfies Record<string, Hand>;

const BOT_AIM = {
  noticeMs: [220, 350],
  baseSigma: 0.03,
  sigmaPerRadPerSec: 0.25,
  unsettledMul: 1.5,
  settleMs: 700,
  errTauMs: 400,
  motionTauMs: 150,
  fireSlackRad: 2.5 * DEG,
} as const;

const SUBSTEP_MS = 5;

export const TICK_MS = 1000 / WORLD.tickHz;

/**
 * Bots sharpen against a human who has climbed further, indexed by the human's level; a hunted human gets the last row.
 * A fresh player meets the base aim, so the room is beatable on arrival and fights back as they snowball.
 * Bots fight each other at the base row, so a bot that climbs keeps climbing and the room shows abilities and hunted bots.
 */
export const SHARPNESS: readonly { aimMul: number; reactionMul: number }[] = [
  { aimMul: 1, reactionMul: 1 },
  { aimMul: 0.55, reactionMul: 0.8 },
  { aimMul: 0.4, reactionMul: 0.7 },
  { aimMul: 0.3, reactionMul: 0.6 },
  { aimMul: 0.2, reactionMul: 0.5 },
  { aimMul: 0.15, reactionMul: 0.45 },
];
type Sharpness = (typeof SHARPNESS)[number];
export const sharpnessAgainst = (target: PlayerView) =>
  target.kind === 'bot' ? SHARPNESS[0]! : SHARPNESS[target.hunted ? SHARPNESS.length - 1 : Math.min(target.level, SHARPNESS.length - 1)]!;

const gaussian = (rand: () => number) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x: number, lim: number) => Math.max(-lim, Math.min(lim, x));

export const freshAim = (angle: number): AimState => ({ angle, spin: 0, want: angle, err: 0 });

/** Turns the gun toward `want`, which itself turns at `wantSpin`, so a smooth track carries no lag. Fixed substeps keep it the same at any tick rate. */
export function turn(aim: AimState, want: number, wantSpin: number, hand: Hand, dtMs: number): AimState {
  const n = Math.max(1, Math.ceil(dtMs / SUBSTEP_MS)), h = dtMs / 1000 / n;
  let angle = aim.angle, spin = aim.spin, goal = angle + wrapAngle(want - angle);
  for (let i = 0; i < n; i++) {
    const accel = hand.omega * hand.omega * (goal - angle) + 2 * hand.zeta * hand.omega * (wantSpin - spin);
    spin = clamp(spin + clamp(accel, hand.maxAccel) * h, hand.maxSpin);
    angle += spin * h;
    goal += wantSpin * h;
  }
  return { ...aim, angle: wrapAngle(angle), spin, want: wrapAngle(goal) };
}

/** An Ornstein-Uhlenbeck drift with spread `sigma` and a time constant in real time, so it wanders alike at any tick rate. */
export function drift(err: number, sigma: number, dtMs: number, rand: () => number): number {
  const keep = Math.exp(-dtMs / BOT_AIM.errTauMs);
  return err * keep + sigma * Math.sqrt(1 - keep * keep) * gaussian(rand);
}

export const onTarget = (aim: AimState, d: number) => Math.abs(wrapAngle(aim.angle - aim.want)) <= Math.max(BOT_AIM.fireSlackRad, Math.atan2(WORLD.playerRadius, d));

export function engage(prev: Engagement | null, enemy: Point & { id: number }, sharpness: Sharpness, tick: number, rand: () => number): Engagement {
  if (!prev) {
    const [fastest, slowest] = BOT_AIM.noticeMs.map((ms) => ms * sharpness.reactionMul);
    const noticeAtTick = tick + Math.round((fastest + rand() * (slowest - fastest)) / TICK_MS);
    return { id: enemy.id, x: enemy.x, y: enemy.y, vx: 0, vy: 0, acquiredTick: tick, noticeAtTick };
  }
  const k = 1 - Math.exp(-TICK_MS / BOT_AIM.motionTauMs);
  const vx = prev.vx + k * ((enemy.x - prev.x) * WORLD.tickHz - prev.vx);
  const vy = prev.vy + k * ((enemy.y - prev.y) * WORLD.tickHz - prev.vy);
  return { ...prev, id: enemy.id, x: enemy.x, y: enemy.y, vx, vy };
}

/** The spread of a bot's aim error: wider against a target crossing its view fast and just after its flick, narrower against a sharper foe. */
export function aimSigma(e: Engagement, me: Point, sharpness: Sharpness, tick: number): number {
  const rx = e.x - me.x, ry = e.y - me.y;
  const crossing = Math.abs(rx * e.vy - ry * e.vx) / Math.max(1, rx * rx + ry * ry);
  const unsettled = 1 + BOT_AIM.unsettledMul * Math.exp(-(Math.max(0, tick - e.noticeAtTick) * TICK_MS) / BOT_AIM.settleMs);
  return (BOT_AIM.baseSigma + BOT_AIM.sigmaPerRadPerSec * crossing) * unsettled * sharpness.aimMul;
}

/** The fresh error a flick lands with. */
export const landingErr = (sigma: number, rand: () => number) => sigma * gaussian(rand);
