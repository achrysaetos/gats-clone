import { GUN_IDS, GUNS, WORLD, ZOMBIE_KINDS, ZOMBIES, type GunId } from '../shared/defs.ts';
import type { BulletView, GameEvent, Snapshot, WallView } from '../shared/protocol.ts';
import { segmentEntersCircleAt, segmentEntersRectAt, type Rect } from '../shared/sim/movement.ts';
import { MAX_RANGE_MUL } from '../shared/sim/stats.ts';

type Point = { x: number; y: number };
type Body = { x: number; y: number; r: number };
export const TRACER = { tail: 0.022 } as const;
/** What stops a round as drawn: cover, and the bodies of the shooter's enemies and zombies where the page draws them. */
export type RoundScene = { solids: readonly Rect[]; bodies: readonly Body[] };
export type ShotEvent = Extract<GameEvent, { e: 'shot' }>;
export type Shot = { owner: number; gun: GunId; range: number; spread: number };
/**
 * A gun round drawn from its shooter's drawn muzzle, spawned from the shot event. The server's copy of a human's round
 * starts a round trip plus the render delay down its line, because lag compensation flies it through the past they saw.
 */
export type LocalRound = { id: number; owner: number; x: number; y: number; vx: number; vy: number; reach: number; gun: GunId; born: number };

export function roundScene(snap: Pick<Snapshot, 'players' | 'crates' | 'zombies'>, walls: readonly WallView[], shooterId: number): RoundScene {
  const team = snap.players.find((p) => p.id === shooterId)?.team ?? null;
  return {
    solids: [...walls, ...snap.crates.map((c) => ({ x: c.x, y: c.y, w: c.size, h: c.size }))],
    bodies: [
      ...snap.players.filter((p) => p.alive && p.id !== shooterId && (team === null || p.team !== team)).map((p) => ({ x: p.x, y: p.y, r: WORLD.playerRadius })),
      ...(snap.zombies ?? []).map(([, k, x, y]) => ({ x, y, r: ZOMBIES[ZOMBIE_KINDS[k]!].radius })),
    ],
  };
}

/** How far along (dx, dy), as a fraction, a round stops: at the first cover, or at the first body past the ones it pierces. */
function stopAt(from: Point, dx: number, dy: number, scene: RoundScene, pierce: number): number {
  const wall = Math.min(1, ...scene.solids.map((r) => segmentEntersRectAt(from.x, from.y, dx, dy, r) ?? 1));
  const bodies = scene.bodies.map((b) => segmentEntersCircleAt(from.x, from.y, dx, dy, b.x, b.y, b.r)).filter((t): t is number => t !== null).sort((a, b) => a - b);
  return Math.min(wall, bodies[pierce] ?? 1);
}

export function fireRounds(shot: Shot, muzzle: Point, angle: number, scene: RoundScene, born: number, firstId: number, rand: () => number = Math.random): LocalRound[] {
  const { pellets, bulletSpeed, penetrate = 0 } = GUNS[shot.gun];
  return Array.from({ length: pellets }, (_, i) => {
    const a = angle + (rand() - 0.5) * shot.spread * 2;
    const vx = Math.cos(a) * bulletSpeed, vy = Math.sin(a) * bulletSpeed;
    const reach = stopAt(muzzle, (vx / bulletSpeed) * shot.range, (vy / bulletSpeed) * shot.range, scene, penetrate) * shot.range;
    return { id: firstId - i, owner: shot.owner, x: muzzle.x, y: muzzle.y, vx, vy, reach, gun: shot.gun, born };
  });
}

const flown = (r: LocalRound, now: number) => (Math.hypot(r.vx, r.vy) * Math.max(0, now - r.born)) / 1000;

export const roundLive = (r: LocalRound, now: number): boolean => flown(r, now) <= r.reach;

const LONGEST_FLIGHT_MS = 1000 * MAX_RANGE_MUL * Math.max(...GUN_IDS.map((g) => GUNS[g].range / GUNS[g].bulletSpeed));

/** Who fired a shot whose event this page received recently enough that its rounds may still be flying, by the server time of each one's last shot. */
export function recentShooters(lastShotAt: ReadonlyMap<number, number>, renderMs: number): Set<number> {
  return new Set([...lastShotAt].filter(([, at]) => at >= renderMs - LONGEST_FLIGHT_MS).map(([id]) => id));
}

/**
 * Which of the server's gun rounds the page draws locally instead: those from shooters whose shot events it received.
 * Each round is judged the first frame it is seen, so none pops in or out mid-flight.
 */
export function coverServerRounds(prev: ReadonlyMap<number, boolean>, bullets: readonly BulletView[], shooters: ReadonlySet<number>): Map<number, boolean> {
  return new Map(bullets.filter((b) => b.gun !== null).map((b) => [b.id, prev.get(b.id) ?? shooters.has(b.owner)]));
}

/** The rounds to draw: the server's that are not covered, plus the local ones, their tails never reaching back past the muzzle. */
export function drawnRounds(bullets: readonly BulletView[], local: readonly LocalRound[], covered: ReadonlyMap<number, boolean>, now: number): BulletView[] {
  const views = local.filter((r) => roundLive(r, now)).map((r) => {
    const d = flown(r, now), speed = Math.hypot(r.vx, r.vy);
    const k = Math.min(1, d / (speed * TRACER.tail));
    return { id: r.id, x: r.x + (r.vx / speed) * d, y: r.y + (r.vy / speed) * d, vx: r.vx * k, vy: r.vy * k, owner: r.owner, gun: r.gun };
  });
  return [...bullets.filter((b) => !covered.get(b.id)), ...views];
}
