/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAP_IDS, MAPS } from '../src/shared/maps.ts';
import { pushOutConvex } from '../src/shared/geom.ts';
import { circleBlocked, circleHitsRect, clamp, dist2, earliestHit, MAX_SUBSTEP, segmentBlocked, segmentEntersRectAt, segmentHits, slide, type Rect } from '../src/shared/sim/movement.ts';
import { prefixGrid, setGridEnabled } from '../src/shared/sim/rectgrid.ts';
import { createWorld, solidRects } from '../src/shared/sim/world.ts';

/** The linear scans as they were before the grid, kept verbatim as the reference every grid answer must match. */
function refResolve(solids: readonly Rect[], nx: number, ny: number, r: number, size: number): { x: number; y: number } {
  let x = clamp(nx, r, size - r), y = clamp(ny, r, size - r);
  let bent = false;
  for (const b of solids) {
    const cx = clamp(x, b.x, b.x + b.w), cy = clamp(y, b.y, b.y + b.h);
    const d2 = dist2(x, y, cx, cy);
    if (d2 >= r * r) continue;
    if (b.pts) {
      const out = pushOutConvex(x, y, r, b.pts);
      if (out) { x = out.x; y = out.y; bent = true; }
      continue;
    }
    if (d2 > 0) {
      const d = Math.sqrt(d2);
      x = cx + ((x - cx) / d) * r;
      y = cy + ((y - cy) / d) * r;
    } else {
      const exits = [
        { x: b.x - r, y, depth: x - b.x },
        { x: b.x + b.w + r, y, depth: b.x + b.w - x },
        { x, y: b.y - r, depth: y - b.y },
        { x, y: b.y + b.h + r, depth: b.y + b.h - y },
      ];
      const shallowest = exits.reduce((m, o) => (o.depth < m.depth ? o : m));
      x = shallowest.x;
      y = shallowest.y;
    }
  }
  for (let pass = 0; bent && pass < 3; pass++) {
    bent = false;
    for (const b of solids) {
      if (!b.pts) continue;
      if (dist2(x, y, clamp(x, b.x, b.x + b.w), clamp(y, b.y, b.y + b.h)) >= r * r) continue;
      const out = pushOutConvex(x, y, r, b.pts);
      if (out) { x = out.x; y = out.y; bent = true; }
    }
  }
  return { x: clamp(x, r, size - r), y: clamp(y, r, size - r) };
}
function refSlide(solids: readonly Rect[], x: number, y: number, dx: number, dy: number, r: number, size: number): { x: number; y: number } {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / MAX_SUBSTEP));
  let at = { x, y };
  for (let i = 0; i < steps; i++) at = refResolve(solids, at.x + dx / steps, at.y + dy / steps, r, size);
  return at;
}
function refEarliest(solids: readonly Rect[], px: number, py: number, dx: number, dy: number) {
  let best: { t: number; b: Rect } | null = null;
  for (const b of solids) {
    const t = segmentEntersRectAt(px, py, dx, dy, b);
    if (t !== null && (!best || t < best.t)) best = { t, b };
  }
  return best;
}

/** Runs `f` with the grid on and off and asserts the answers are identical, to the bit and in order, and match `ref` when given. */
function same<T>(f: () => T, what: () => string, ref?: () => T): void {
  setGridEnabled(true);
  const grid = f();
  setGridEnabled(false);
  const linear = f();
  setGridEnabled(true);
  assert.deepStrictEqual(grid, linear, what());
  if (ref) assert.deepStrictEqual(grid, ref(), what());
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

test('the wall grid answers every query exactly as a linear scan does, on every map', () => {
  for (const map of MAP_IDS) {
    const w = createWorld('FFA', 3, map);
    const size = MAPS[map].size;
    const solids = solidRects(w);
    const lists: readonly Rect[][] = [w.walls, solids];
    if (w.walls.length >= 30) assert.ok(prefixGrid(solids), `${map}: solids get a grid`);
    const r = rng(map.length * 7919);
    // Points near walls are where answers are fussy: on edges, corners and inside.
    const near = (): { x: number; y: number } => {
      if (r() < 0.5) return { x: r() * size, y: r() * size };
      const b = w.walls[Math.floor(r() * w.walls.length)]!;
      const snap = (v: number, lo: number, hi: number) => (r() < 0.3 ? (r() < 0.5 ? lo : hi) : v);
      return { x: snap(b.x - 40 + r() * (b.w + 80), b.x, b.x + b.w), y: snap(b.y - 40 + r() * (b.h + 80), b.y, b.y + b.h) };
    };
    for (let i = 0; i < 600; i++) {
      const a = near();
      const kind = r();
      const len = kind < 0.4 ? r() * 60 : kind < 0.8 ? r() * 1500 : 0;
      const ang = r() < 0.2 ? Math.floor(r() * 4) * (Math.PI / 2) : r() * 2 * Math.PI;
      const dx = r() < 0.1 ? 0 : Math.cos(ang) * len, dy = r() < 0.1 ? 0 : Math.sin(ang) * len;
      const at = () => `${map} #${i} from (${a.x}, ${a.y}) by (${dx}, ${dy})`;
      for (const list of lists) {
        same(() => earliestHit(list, a.x, a.y, dx, dy), at, () => refEarliest(list, a.x, a.y, dx, dy));
        same(() => segmentHits(list, a.x, a.y, dx, dy, 'nb').map((h) => [h.t, list.indexOf(h.b)]), at);
        for (const skip of [undefined, 'nb', 'ns'] as const) same(() => segmentBlocked(list, a.x, a.y, dx, dy, skip), at, () => list.some((b) => !(skip && b[skip]) && segmentEntersRectAt(a.x, a.y, dx, dy, b) !== null));
        const rad = 5 + r() * 40;
        same(() => circleBlocked(list, a.x, a.y, rad), at, () => list.some((b) => circleHitsRect(a.x, a.y, rad, b)));
      }
      same(() => slide(solids, a.x, a.y, dx / 20, dy / 20, 20, size), at, () => refSlide(solids, a.x, a.y, dx / 20, dy / 20, 20, size));
      const sx = (r() - 0.5) * 240, sy = (r() - 0.5) * 240;
      same(() => slide(solids, a.x, a.y, sx, sy, 20, size), at, () => refSlide(solids, a.x, a.y, sx, sy, 20, size));
    }
  }
});

test('a query finds every wall it crosses, including one it only grazes at a corner', () => {
  const w = createWorld('FFA', 1, 'causeway');
  const solids = solidRects(w);
  const g = prefixGrid(solids)!;
  assert.ok(g && g.k >= 500);
  // Rays along each wall's box edges, which meet it exactly on its boundary.
  for (const b of w.walls.slice(0, 200)) {
    for (const [px, py, dx, dy] of [[b.x - 30, b.y, b.w + 60, 0], [b.x, b.y - 30, 0, b.h + 60], [b.x - 10, b.y - 10, 10, 10], [b.x + b.w + 10, b.y + b.h + 10, -10, -10]] as const) {
      same(() => earliestHit(solids, px, py, dx, dy), () => `edge ray at ${b.x},${b.y}`, () => refEarliest(solids, px, py, dx, dy));
      same(() => segmentBlocked(solids, px, py, dx, dy), () => `edge ray at ${b.x},${b.y}`);
    }
  }
});

test('two wall lists that share their first wall but not the rest each get answers from their own walls', () => {
  const fixed = (x: number, y: number) => ({ x, y, w: 40, h: 40, built: false, expiresAt: Infinity });
  const first = fixed(0, 0);
  // Thirty walls in a row along y = 1000, and thirty in a column along x = 1000: only the first wall is shared.
  const row = [first, ...Array.from({ length: 30 }, (_, i) => fixed(100 + i * 60, 1000))];
  const column = [first, ...Array.from({ length: 30 }, (_, i) => fixed(1000, 100 + i * 60))];
  assert.ok(prefixGrid(row) && prefixGrid(column), 'both are long enough to be gridded');
  assert.notEqual(prefixGrid(row), prefixGrid(column), 'each its own grid');
  assert.equal(segmentBlocked(row, 500, 900, 0, 200), true, 'the row crosses x = 500');
  assert.equal(segmentBlocked(column, 500, 900, 0, 200), false, 'the column does not');
  assert.equal(segmentBlocked(column, 900, 500, 200, 0), true);
  assert.equal(segmentBlocked(row, 900, 500, 200, 0), false);
});
