/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentEntersRectAt, type Rect } from '../src/shared/sim/movement.ts';

/** The slab test as it was written before it was made allocation-free; the rewrite must answer exactly the same, to the bit. */
function reference(px: number, py: number, dx: number, dy: number, r: Rect): number | null {
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[px, dx, r.x, r.x + r.w], [py, dy, r.y, r.y + r.h]] as const) {
    if (d === 0) { if (p < lo || p > hi) return null; continue; }
    let a = (lo - p) / d, b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return r.pts ? segmentEntersRectAt(px, py, dx, dy, r) : t0;
}

test('the allocation-free slab test gives exactly what the tuple-loop one gave, axis-aligned and diagonal, inside and out', () => {
  let seed = 11;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = (xs: number[]) => xs[Math.floor(rand() * xs.length)]!;
  for (let i = 0; i < 50_000; i++) {
    const r: Rect = { x: Math.round(rand() * 400), y: Math.round(rand() * 400), w: 1 + Math.round(rand() * 200), h: 1 + Math.round(rand() * 200) };
    const px = rand() < 0.2 ? r.x : rand() * 700 - 50, py = rand() < 0.2 ? r.y + r.h : rand() * 700 - 50;
    const dx = rand() < 0.25 ? 0 : pick([-1, 1]) * rand() * 600, dy = rand() < 0.25 ? 0 : pick([-1, 1]) * rand() * 600;
    assert.equal(segmentEntersRectAt(px, py, dx, dy, r), reference(px, py, dx, dy, r), `segment (${px}, ${py}) + (${dx}, ${dy}) against ${JSON.stringify(r)}`);
  }
});
