/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShadowCache, drawSolids, faceDepth, LIGHT, MATERIALS, shadowHull, type Solid } from '../src/client/tilt.ts';

type Call = { name: string; args: number[]; fill: unknown };

/** A context that records every rect it is asked to fill or path, with the fill style at the time. */
function recorder(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: number[]) => { calls.push({ name: String(prop), args, fill: target.fillStyle }); return { width: 0 }; };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

test('a solid casts its shadow from its own rect, as far along the light as it is tall', () => {
  const wall: Solid = { kind: 'concrete', x: 100, y: 200, w: 60, h: 20 };
  const p = shadowHull(wall);
  const points = Array.from({ length: p.length / 2 }, (_, i) => [p[i * 2]!, p[i * 2 + 1]!]);
  for (const corner of [[100, 200], [160, 200], [100, 220]]) assert.ok(points.some(([x, y]) => x === corner[0] && y === corner[1]), `keeps the corner ${corner} where the wall stands`);
  const far = Math.max(...points.map(([x, y]) => x + y));
  const crate = shadowHull({ ...wall, kind: 'crate' });
  const crateFar = Math.max(...Array.from({ length: crate.length / 2 }, (_, i) => crate[i * 2]! + crate[i * 2 + 1]!));
  assert.ok(MATERIALS.concrete.height > MATERIALS.crate.height && far > crateFar, 'the taller wall reaches further');
  const [fx, fy] = points.find(([x, y]) => x + y === far)!;
  const len = Math.hypot(fx! - 160, fy! - 220);
  assert.ok(Math.abs((fx! - 160) / len - LIGHT.x / Math.hypot(LIGHT.x, LIGHT.y)) < 1e-9, 'it falls along the light');
});

test('each top face is exactly its collision rect, with the front face hanging below it', () => {
  const { ctx, calls } = recorder();
  const solids: Solid[] = [
    { kind: 'concrete', x: 10, y: 20, w: 300, h: 40 },
    { kind: 'crate', x: 400, y: 80, w: 44, h: 44, wear: 0.5 },
    { kind: 'sandbag', x: 500, y: 500, w: 50, h: 50, wear: 0 },
  ];
  drawSolids(ctx, solids);
  for (const s of solids) {
    assert.ok(calls.some((c) => c.name === 'fillRect' && c.args.join() === [s.x, s.y, s.w, s.h].join()), `${s.kind} top at its rect`);
    assert.ok(calls.some((c) => c.name === 'rect' && c.args.join() === [s.x, s.y + s.h, s.w, faceDepth(s.kind)].join() && c.fill === MATERIALS[s.kind].face), `${s.kind} face below its rect`);
  }
  const lastFace = calls.map((c) => c.name === 'rect' && c.fill === MATERIALS.sandbag.face).lastIndexOf(true);
  const firstTop = calls.findIndex((c) => c.name === 'fillRect');
  assert.ok(lastFace < firstTop, 'every face is drawn before any top, so nearer solids cover the faces behind them');
});

test('the shadow layer traces the map once per layout and re-blurs only when the squad builds or loses something', () => {
  const { ctx } = recorder();
  Object.assign(globalThis, { document: { createElement: () => ({ getContext: () => ctx }) } });
  const cache = createShadowCache();
  let traced = 0;
  const map = [{ kind: 'concrete', x: 0, y: 0, w: 100, h: 20 }] satisfies Solid[];
  const statics = () => { traced++; return map; };
  const layout = {};
  const wall = (x: number): Solid => ({ kind: 'sandbag', x, y: 50, w: 50, h: 50 });
  cache.get(layout, 3000, statics, []);
  cache.get(layout, 3000, statics, []);
  assert.deepEqual([cache.bakes(), traced], [1, 1], 'an unchanged frame reuses the layer');
  cache.get(layout, 3000, statics, [wall(100)]);
  cache.get(layout, 3000, statics, [{ ...wall(100), wear: 0.8 }]);
  assert.deepEqual([cache.bakes(), traced], [2, 1], 'a new building re-blurs once; wear alone changes nothing; the map is not traced again');
  cache.get(layout, 3000, statics, []);
  assert.equal(cache.bakes(), 3, 'losing the building re-blurs');
  cache.get({}, 3000, statics, []);
  assert.deepEqual([cache.bakes(), traced], [4, 2], 'a new layout traces the map again');
});
