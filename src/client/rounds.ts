import { GUNS, WORLD, ZOMBIE_KINDS, ZOMBIES, type GunId } from '../shared/defs.ts';
import type { BulletView, Snapshot, WallView } from '../shared/protocol.ts';
import { segmentEntersCircleAt, segmentEntersRectAt, type Rect } from '../shared/sim/movement.ts';
import { TRACER } from './render.ts';

type Point = { x: number; y: number };
type Body = { x: number; y: number; r: number };
/** What stops a round as drawn: cover, and the bodies of enemies and zombies where the page draws them. */
export type RoundScene = { solids: readonly Rect[]; bodies: readonly Body[] };
/**
 * A round of your own, drawn from your drawn muzzle when the server's shot event arrives. The server's copy starts
 * a round trip plus the render delay down its line, because lag compensation flies it through the past you saw.
 */
export type OwnRound = { id: number; x: number; y: number; vx: number; vy: number; reach: number; gun: GunId; born: number };

export function roundScene(snap: Pick<Snapshot, 'players' | 'crates' | 'zombies'>, walls: readonly WallView[], myId: number): RoundScene {
  const myTeam = snap.players.find((p) => p.id === myId)?.team ?? null;
  return {
    solids: [...walls, ...snap.crates.map((c) => ({ x: c.x, y: c.y, w: c.size, h: c.size }))],
    bodies: [
      ...snap.players.filter((p) => p.alive && p.id !== myId && (myTeam === null || p.team !== myTeam)).map((p) => ({ x: p.x, y: p.y, r: WORLD.playerRadius })),
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

export function fireOwnRounds(
  gun: GunId, range: number, spread: number, muzzle: Point, angle: number, scene: RoundScene, born: number, firstId: number, rand: () => number = Math.random,
): OwnRound[] {
  const { pellets, bulletSpeed, penetrate = 0 } = GUNS[gun];
  return Array.from({ length: pellets }, (_, i) => {
    const a = angle + (rand() - 0.5) * spread * 2;
    const vx = Math.cos(a) * bulletSpeed, vy = Math.sin(a) * bulletSpeed;
    const reach = stopAt(muzzle, (vx / bulletSpeed) * range, (vy / bulletSpeed) * range, scene, penetrate) * range;
    return { id: firstId - i, x: muzzle.x, y: muzzle.y, vx, vy, reach, gun, born };
  });
}

const flown = (r: OwnRound, now: number) => (Math.hypot(r.vx, r.vy) * Math.max(0, now - r.born)) / 1000;

export const roundLive = (r: OwnRound, now: number): boolean => flown(r, now) <= r.reach;

/** The rounds to draw: the server's, minus your own gun's, plus your own from your muzzle, their tails never reaching back past it. */
export function drawnRounds(bullets: readonly BulletView[], own: readonly OwnRound[], myId: number, now: number): BulletView[] {
  const views = own.filter((r) => roundLive(r, now)).map((r) => {
    const d = flown(r, now), speed = Math.hypot(r.vx, r.vy);
    const k = Math.min(1, d / (speed * TRACER.tail));
    return { id: r.id, x: r.x + (r.vx / speed) * d, y: r.y + (r.vy / speed) * d, vx: r.vx * k, vy: r.vy * k, owner: myId, gun: r.gun };
  });
  return [...bullets.filter((b) => b.owner !== myId || b.gun === null), ...views];
}
