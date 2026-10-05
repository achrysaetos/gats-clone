import { WORLD } from '../../shared/defs.ts';
import type { PlayerView } from '../../shared/protocol.ts';
import type { Point } from './nav.ts';

export type Engagement = { id: number; x: number; y: number; bearing: number; acquiredTick: number; fireAtTick: number; aimErrRad: number };

const BOT_AIM = {
  reactionMs: [250, 400],
  baseSigma: 0.03,
  sigmaPerRadPerSec: 0.25,
  unsettledMul: 1.5,
  settleMs: 700,
  errCorrelation: 0.85,
} as const;

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
export const sharpnessAgainst = (target: PlayerView) =>
  target.kind === 'bot' ? SHARPNESS[0]! : SHARPNESS[target.hunted ? SHARPNESS.length - 1 : Math.min(target.level, SHARPNESS.length - 1)]!;

const gaussian = (rand: () => number) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function engage(prev: Engagement | null, enemy: { id: number; x: number; y: number }, sharpness: (typeof SHARPNESS)[number], me: Point, tick: number, rand: () => number): Engagement {
  const bearing = Math.atan2(enemy.y - me.y, enemy.x - me.x);
  const { aimMul, reactionMul } = sharpness;
  const [fastest, slowest] = BOT_AIM.reactionMs.map((ms) => ms * reactionMul);
  const acquiredTick = prev?.acquiredTick ?? tick;
  const fireAtTick = prev?.fireAtTick ?? tick + Math.round((fastest + rand() * (slowest - fastest)) / TICK_MS);
  const angularSpeed = prev ? Math.abs(wrapAngle(bearing - prev.bearing)) * WORLD.tickHz : 0;
  const unsettled = 1 + BOT_AIM.unsettledMul * Math.exp(-((tick - acquiredTick) * TICK_MS) / BOT_AIM.settleMs);
  const sigma = (BOT_AIM.baseSigma + BOT_AIM.sigmaPerRadPerSec * angularSpeed) * unsettled * aimMul;
  const rho = BOT_AIM.errCorrelation;
  const aimErrRad = prev ? prev.aimErrRad * rho + Math.sqrt(1 - rho * rho) * sigma * gaussian(rand) : sigma * gaussian(rand);
  return { id: enemy.id, x: enemy.x, y: enemy.y, bearing, acquiredTick, fireAtTick, aimErrRad };
}
