import type { Rect } from '../../shared/sim/movement.ts';
import { clearShot, isOpen, type NavGrid, type Point } from './nav.ts';

/**
 * A spot hugging a wall or crate, and the bearings it hides from: bit i of `blocks` is set when a shot coming from bearing i * 2π/BEARINGS
 * meets the cover first. Built once per map from its permanent cover; engineer walls and broken crates are left to the live sight checks.
 */
type CoverPoint = { x: number; y: number; blocks: number };

/** Cover points bucketed on a coarse grid, so a query near a bot reads a few buckets instead of the whole map. */
export type CoverIndex = { bucket: number; n: number; cells: CoverPoint[][] };

const BEARINGS = 16;
const STANDOFF = 6;
const SPACING = 50;
/** A shot from a bearing is stopped when its line meets cover this close to the spot, which a wall the bot is hugging always is. */
const SHIELD_PX = 90;
const BUCKET_PX = 250;
/** A spot this close to someone already there is theirs. */
const TAKEN_PX = 60;
/** How far beside a cover spot a bot steps out to see round its edge. */
const PEEK_STEPS = [40, 65, 90] as const;

export const bearingIndex = (from: Point, to: Point) => {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  return ((Math.round((a / (2 * Math.PI)) * BEARINGS) % BEARINGS) + BEARINGS) % BEARINGS;
};

export function coverIndex(nav: NavGrid, cover: readonly Rect[], radius: number): CoverIndex {
  const n = Math.ceil(nav.size / BUCKET_PX);
  const cells: CoverPoint[][] = Array.from({ length: n * n }, () => []);
  const off = radius + STANDOFF;
  for (const r of cover) {
    const sides: [Point, Point][] = [
      [{ x: r.x, y: r.y - off }, { x: r.x + r.w, y: r.y - off }],
      [{ x: r.x, y: r.y + r.h + off }, { x: r.x + r.w, y: r.y + r.h + off }],
      [{ x: r.x - off, y: r.y }, { x: r.x - off, y: r.y + r.h }],
      [{ x: r.x + r.w + off, y: r.y }, { x: r.x + r.w + off, y: r.y + r.h }],
    ];
    for (const [a, b] of sides) {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const count = Math.max(1, Math.round(len / SPACING));
      for (let i = 0; i <= count; i++) {
        const p = { x: a.x + ((b.x - a.x) * i) / count, y: a.y + ((b.y - a.y) * i) / count };
        if (!isOpen(nav, p)) continue;
        const near = cover.filter((o) => o.x - SHIELD_PX <= p.x && p.x <= o.x + o.w + SHIELD_PX && o.y - SHIELD_PX <= p.y && p.y <= o.y + o.h + SHIELD_PX);
        let blocks = 0;
        for (let k = 0; k < BEARINGS; k++) {
          const t = (2 * Math.PI * k) / BEARINGS;
          if (!clearShot(near, p, { x: p.x + Math.cos(t) * SHIELD_PX, y: p.y + Math.sin(t) * SHIELD_PX })) blocks |= 1 << k;
        }
        if (blocks === 0) continue;
        const bx = Math.min(n - 1, Math.floor(p.x / BUCKET_PX)), by = Math.min(n - 1, Math.floor(p.y / BUCKET_PX));
        cells[by * n + bx]!.push({ ...p, blocks });
      }
    }
  }
  return { bucket: BUCKET_PX, n, cells };
}

export function coverNear(index: CoverIndex, at: Point, within: number): CoverPoint[] {
  const out: CoverPoint[] = [];
  const x0 = Math.max(0, Math.floor((at.x - within) / index.bucket)), x1 = Math.min(index.n - 1, Math.floor((at.x + within) / index.bucket));
  const y0 = Math.max(0, Math.floor((at.y - within) / index.bucket)), y1 = Math.min(index.n - 1, Math.floor((at.y + within) / index.bucket));
  for (let by = y0; by <= y1; by++) {
    for (let bx = x0; bx <= x1; bx++) {
      for (const c of index.cells[by * index.n + bx]!) if (Math.hypot(c.x - at.x, c.y - at.y) <= within) out.push(c);
    }
  }
  return out;
}

/** The spot just beside `spot`, across the line to `threat`, from which `threat` is in plain sight, or null when no step round the edge sees it. */
function peekFrom(nav: NavGrid, solids: readonly Rect[], spot: Point, threat: Point): Point | null {
  const a = Math.atan2(threat.y - spot.y, threat.x - spot.x);
  for (const step of PEEK_STEPS) {
    for (const side of [1, -1]) {
      const p = { x: spot.x + Math.cos(a + (side * Math.PI) / 2) * step, y: spot.y + Math.sin(a + (side * Math.PI) / 2) * step };
      if (isOpen(nav, p) && clearShot(solids, p, threat) && clearShot(solids, spot, p)) return p;
    }
  }
  return null;
}

type CoverPick = { spot: CoverPoint; peek: Point | null };

/**
 * The best spot within `reach` of `me` that hides it from every threat right now, judged against the live `solids` so a broken crate
 * or a new engineer wall counts. With `peek` it must also let the bot step out and see `threats[0]`, and it scores how close the
 * spot keeps the bot to `range` from that threat; without, it is a place to hide and prefers being further away.
 */
export function pickCover(
  index: CoverIndex, nav: NavGrid, solids: readonly Rect[], me: Point, threats: readonly Point[],
  opts: { reach: number; range: number; peek: boolean; taken?: readonly Point[] },
): CoverPick | null {
  const main = threats[0];
  if (!main) return null;
  let best: CoverPick | null = null, bestScore = Infinity;
  for (const c of coverNear(index, me, opts.reach)) {
    if (!(c.blocks & (1 << bearingIndex(c, main)))) continue;
    if (opts.taken?.some((t) => Math.hypot(t.x - c.x, t.y - c.y) < TAKEN_PX)) continue;
    const toMain = Math.hypot(main.x - c.x, main.y - c.y);
    const walk = Math.hypot(c.x - me.x, c.y - me.y);
    const score = opts.peek ? walk + Math.abs(toMain - opts.range) * 0.7 : walk - toMain * 0.5;
    if (score >= bestScore) continue;
    if (threats.some((t) => clearShot(solids, c, t))) continue;
    const peek = opts.peek ? peekFrom(nav, solids, c, main) : null;
    if (opts.peek && !peek) continue;
    best = { spot: c, peek };
    bestScore = score;
  }
  return best;
}
