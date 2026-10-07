import { WORLD, type AbilityId } from '../../shared/defs.ts';
import type { PlayerView } from '../../shared/protocol.ts';
import { intercept, MUZZLE_PX } from '../../shared/sim/ballistics.ts';

export { intercept, MUZZLE_PX };
import type { Point } from './nav.ts';

export type AimState = { angle: number; spin: number; want: number; err: number };

/** `leadMul` is how this bot judges this target's lead: 1 leads exactly, below under-leads, drawn once per engagement as a person's read of one target. */
export type Engagement = { id: number; x: number; y: number; vx: number; vy: number; acquiredTick: number; noticeAtTick: number; leadMul: number };

export type Hand = { omega: number; zeta: number; maxSpin: number; maxAccel: number };

const DEG = Math.PI / 180;

export const HANDS = {
  flick: { omega: 30, zeta: 0.72, maxSpin: 800 * DEG, maxAccel: 10_000 * DEG },
  calm: { omega: 9, zeta: 0.9, maxSpin: 240 * DEG, maxAccel: 2_500 * DEG },
} as const satisfies Record<string, Hand>;

const BOT_AIM = {
  noticeMs: [220, 350],
  baseSigma: 0.03,
  sigmaPerRadPerSec: 0.25,
  unsettledMul: 1.5,
  settleMs: 700,
  errTauMs: 400,
  motionTauMs: 30,
  /** A bot leads by the round's real flight to where the target will be, times a judgment drawn per engagement in `mean ± spread`. */
  leadJudgment: { mean: 0.95, spread: 0.15 },
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

export const bearingSpin = (rx: number, ry: number, vx: number, vy: number) => (rx * vy - ry * vx) / Math.max(1, rx * rx + ry * ry);

export const freshAim = (angle: number): AimState => ({ angle, spin: 0, want: angle, err: 0 });

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

export function drift(err: number, sigma: number, dtMs: number, rand: () => number): number {
  const keep = Math.exp(-dtMs / BOT_AIM.errTauMs);
  return err * keep + sigma * Math.sqrt(1 - keep * keep) * gaussian(rand);
}

export function handFor(sharpness: Sharpness): Hand {
  const f = Math.min(2.5, 1 / Math.sqrt(sharpness.aimMul));
  return { ...HANDS.flick, omega: HANDS.flick.omega * f, maxAccel: HANDS.flick.maxAccel * f * f };
}


const onTarget = (aim: AimState, d: number) => Math.abs(wrapAngle(aim.angle - aim.want)) <= Math.max(BOT_AIM.fireSlackRad, Math.atan2(WORLD.playerRadius, d));

/** This engagement's lead judgment, hashed from the target and the moment rather than drawn, so it leaves the bot's random stream untouched. */
function leadJudgment(id: number, tick: number): number {
  const v = Math.sin(id * 12.9898 + tick * 78.233) * 43758.5453;
  const { mean, spread } = BOT_AIM.leadJudgment;
  return mean + ((v - Math.floor(v)) * 2 - 1) * spread;
}

export function engage(prev: Engagement | null, enemy: Point & { id: number }, sharpness: Sharpness, tick: number, rand: () => number): Engagement {
  if (!prev) {
    const [fastest, slowest] = BOT_AIM.noticeMs.map((ms) => ms * sharpness.reactionMul);
    const noticeAtTick = tick + Math.round((fastest + rand() * (slowest - fastest)) / TICK_MS);
    return { id: enemy.id, x: enemy.x, y: enemy.y, vx: 0, vy: 0, acquiredTick: tick, noticeAtTick, leadMul: leadJudgment(enemy.id, tick) };
  }
  const k = 1 - Math.exp(-TICK_MS / BOT_AIM.motionTauMs);
  const vx = prev.vx + k * ((enemy.x - prev.x) * WORLD.tickHz - prev.vx);
  const vy = prev.vy + k * ((enemy.y - prev.y) * WORLD.tickHz - prev.vy);
  return { ...prev, id: enemy.id, x: enemy.x, y: enemy.y, vx, vy };
}

export function aimSigma(e: Engagement, me: Point, sharpness: Sharpness, tick: number): number {
  const rx = e.x - me.x, ry = e.y - me.y;
  const crossing = Math.abs(rx * e.vy - ry * e.vx) / Math.max(1, rx * rx + ry * ry);
  const unsettled = 1 + BOT_AIM.unsettledMul * Math.exp(-(Math.max(0, tick - e.noticeAtTick) * TICK_MS) / BOT_AIM.settleMs);
  return (BOT_AIM.baseSigma + BOT_AIM.sigmaPerRadPerSec * crossing) * unsettled * sharpness.aimMul;
}

export const landingErr = (sigma: number, rand: () => number) => sigma * gaussian(rand);

export const GRENADES: ReadonlySet<AbilityId | null> = new Set(['grenade', 'fragGrenade', 'gasGrenade']);
const AIMED_ABILITIES: ReadonlySet<AbilityId | null> = new Set([...GRENADES, 'knife', 'engineer']);

export type Look = { want: number; spin: number; hand: Hand; d: number; err: number };

export function aimAndTrigger(before: AimState, look: Look, wantsFire: boolean, wanted: AbilityId | null, shots: number): { aim: AimState; fire: boolean; ability: boolean; shots: number } {
  const aim = turn({ ...before, err: look.err }, look.want, look.spin, look.hand, TICK_MS);
  const aimed = onTarget(aim, look.d);
  const fire = wantsFire && aimed;
  return { aim, fire, ability: wanted !== null && (aimed || !AIMED_ABILITIES.has(wanted)), shots: shots + (fire ? 1 : 0) };
}
