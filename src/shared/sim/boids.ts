import type { ZombieKind } from '../defs.ts';
import { ZOMBIES } from '../defs.ts';
import { dist2, type Rect } from './movement.ts';
import type { Zombie } from './world.ts';

/**
 * Boids steering for the horde. A zombie's wish is a weighted sum of seeking its goal, parting from close zombies (a heavier one shoves a lighter one
 * aside), matching its neighbours' headings, drifting toward its pack, backing off blocked cells, and a slow personal wander; all in fractions of its top speed.
 * Everything here is a function of the zombies' ids and positions, so a run replays exactly from its seed.
 */
export const BOID = {
  /** Neighbour queries look this far (one hash cell; the 3x3 around a zombie covers it). */
  reach: 120,
  /** Parting begins at this many times the two radii's sum. */
  sepRange: 1.7,
  seek: 1,
  sep: 1.2,
  align: 0.22,
  cohere: 0.1,
  avoid: 1.3,
  wander: 0.12,
  /** How fast the heading eases toward the wish, per second. */
  turn: 7,
  /** How far off a path cell's center a zombie prefers to walk, at most, px. */
  lateral: 14,
};

/** What a kind makes of squad players: `lure` scales how hard a player pulls against the core, `range` is how far that pull reaches, `leash` how far a chase may run from where it began. */
export const LURE: Record<ZombieKind, { lure: number; range: number; leash: number }> = {
  walker: { lure: 1, range: 340, leash: 460 },
  runner: { lure: 1.4, range: 420, leash: 600 },
  plated: { lure: 0.8, range: 260, leash: 420 },
  brute: { lure: 0.3, range: 150, leash: 300 },
  bloater: { lure: 0.2, range: 150, leash: 300 },
  colossus: { lure: 0.1, range: 150, leash: 300 },
};

/** A zombie's standing in the target contest. `tgt` is what it is after: the core, a squad player (`pid`), or the wall in its way. */
export type ZAi = {
  tgt: 'core' | 'player' | 'wall';
  pid: number;
  /** The soonest a chosen player may be dropped for another or the core. */
  holdUntil: number;
  /** The last time the chosen player was in sight. */
  seenAt: number;
  /** No chasing players until then, after a leash snaps. */
  coolUntil: number;
  evalAt: number;
  /** Where the chase began, for the leash. */
  ox: number;
  oy: number;
  /** Steering velocity, px/s. */
  hx: number;
  hy: number;
  /** The angle round the core this zombie wants to arrive at, once it is near. */
  ring: number | null;
  ringOkAt: number;
  ringOk: boolean;
};

export type Personality = { speed: number; lat: number; phase: number; rate: number; lure: number; ring: number };

/** 32-bit integer hash to [0, 1). */
export function hash01(n: number, salt: number): number {
  let h = Math.imul(n ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const PERSONALITY = new Map<number, Personality>();
export function personality(id: number): Personality {
  let p = PERSONALITY.get(id);
  if (!p) {
    p = { speed: 0.95 + hash01(id, 1) * 0.1, lat: hash01(id, 2) * 2 - 1, phase: hash01(id, 3) * Math.PI * 2, rate: 0.5 + hash01(id, 4) * 0.9, lure: 0.85 + hash01(id, 5) * 0.3, ring: hash01(id, 6) * 2 - 1 };
    if (PERSONALITY.size > 4096) PERSONALITY.clear();
    PERSONALITY.set(id, p);
  }
  return p;
}

export function aiOf(z: Zombie, now: number): ZAi {
  return z.ai ??= { tgt: 'core', pid: 0, holdUntil: 0, seenAt: now, coolUntil: 0, evalAt: now, ox: z.x, oy: z.y, hx: 0, hy: 0, ring: null, ringOkAt: 0, ringOk: false };
}

/** Zombies hashed into square cells of `BOID.reach`, as linked lists in typed arrays so a tick allocates almost nothing. */
export type Grid = { dim: number; head: Int32Array; next: Int32Array; zs: readonly Zombie[] };

export function buildGrid(zs: readonly Zombie[], size: number): Grid {
  const dim = Math.ceil(size / BOID.reach);
  const head = new Int32Array(dim * dim).fill(-1), next = new Int32Array(zs.length);
  for (let i = 0; i < zs.length; i++) {
    const c = cellOf(zs[i]!.x, zs[i]!.y, dim);
    next[i] = head[c]!;
    head[c] = i;
  }
  return { dim, head, next, zs };
}

const cellOf = (x: number, y: number, dim: number) =>
  Math.min(dim - 1, Math.max(0, Math.floor(y / BOID.reach))) * dim + Math.min(dim - 1, Math.max(0, Math.floor(x / BOID.reach)));

/** One zombie's wish (a vector no longer than 1, in top speeds) and its hard push out of overlaps (px this tick). */
export type Steer = { wx: number; wy: number; px: number; py: number };

const out: Steer = { wx: 0, wy: 0, px: 0, py: 0 };

/**
 * `seekX/seekY` is the unit direction to the goal (0 when it has arrived); `blocked` lists the nearby solid cell rects to back off (see `avoidRects`).
 */
export function steer(g: Grid, i: number, now: number, seekX: number, seekY: number, avoid: readonly Rect[]): Steer {
  const z = g.zs[i]!, def = ZOMBIES[z.kind], me = personality(z.id);
  const cx = Math.min(g.dim - 1, Math.max(0, Math.floor(z.x / BOID.reach))), cy = Math.min(g.dim - 1, Math.max(0, Math.floor(z.y / BOID.reach)));
  let sx = 0, sy = 0, ax = 0, ay = 0, an = 0, kx = 0, ky = 0, kn = 0, px = 0, py = 0;
  const m2 = def.radius * def.radius;
  for (let yy = Math.max(0, cy - 1); yy <= Math.min(g.dim - 1, cy + 1); yy++) {
    for (let xx = Math.max(0, cx - 1); xx <= Math.min(g.dim - 1, cx + 1); xx++) {
      for (let j = g.head[yy * g.dim + xx]!; j >= 0; j = g.next[j]!) {
        if (j === i) continue;
        const o = g.zs[j]!, od = ZOMBIES[o.kind];
        const d2 = dist2(z.x, z.y, o.x, o.y);
        if (d2 >= BOID.reach * BOID.reach) continue;
        const d = Math.sqrt(d2), min = def.radius + od.radius;
        const o2 = od.radius * od.radius, share = o2 / (m2 + o2);
        const ux = d > 0 ? (z.x - o.x) / d : z.id < o.id ? -1 : 1, uy = d > 0 ? (z.y - o.y) / d : 0;
        const range = min * BOID.sepRange;
        if (d < range) {
          const k = (1 - d / range) ** 2 * 2 * share;
          sx += ux * k;
          sy += uy * k;
          if (d < min) { px += ux * (min - d) * share; py += uy * (min - d) * share; }
        }
        ax += o.vx / od.speed;
        ay += o.vy / od.speed;
        an++;
        if (z.pack !== undefined && z.pack === o.pack) { kx += o.x; ky += o.y; kn++; }
      }
    }
  }
  let wx = seekX * BOID.seek + sx * BOID.sep, wy = seekY * BOID.seek + sy * BOID.sep;
  if (an > 0) { wx += (ax / an) * BOID.align; wy += (ay / an) * BOID.align; }
  if (kn > 0) {
    const dx = kx / kn - z.x, dy = ky / kn - z.y, d = Math.hypot(dx, dy);
    if (d > 0) { const k = Math.min(1, d / BOID.reach); wx += (dx / d) * k * BOID.cohere; wy += (dy / d) * k * BOID.cohere; }
  }
  let vx = 0, vy = 0;
  for (const r of avoid) {
    const nx = Math.max(r.x, Math.min(z.x, r.x + r.w)), ny = Math.max(r.y, Math.min(z.y, r.y + r.h));
    const dx = z.x - nx, dy = z.y - ny, d = Math.hypot(dx, dy), range = def.radius + 16;
    if (d >= range) continue;
    // Standing inside the cell's square (d 0) leaves the way out to the seek and the hard slide.
    if (d > 0) { const k = (1 - d / range) * BOID.avoid; vx += (dx / d) * k; vy += (dy / d) * k; }
  }
  // Backing off cover steers along it, never against the way on: only the part of the push that does not oppose the seek counts.
  const against = vx * seekX + vy * seekY;
  if (against < 0) { vx -= against * seekX; vy -= against * seekY; }
  wx += vx;
  wy += vy;
  // A slow sideways sway about the way it is heading, so a column does not keep its lanes.
  const sway = Math.sin((now / 1000) * me.rate + me.phase) * BOID.wander;
  wx += -seekY * sway;
  wy += seekX * sway;
  const len = Math.hypot(wx, wy);
  if (len > 1) { wx /= len; wy /= len; }
  out.wx = wx; out.wy = wy; out.px = px; out.py = py;
  return out;
}
