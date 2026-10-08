/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ResolvedLight } from '../src/client/lighting.ts';

/** Every canvas the night pass makes records the colour of each fill made under a 'darken' composite (its soft ceiling). */
const ceilings: string[] = [];
function recordingContext() {
  const target: Record<string | symbol, unknown> = { globalCompositeOperation: 'source-over' };
  return new Proxy(target, {
    get: (t, k) => {
      if (k in t) return t[k];
      if (k === 'fillRect') return () => { if (t.globalCompositeOperation === 'darken') ceilings.push(String(t.fillStyle)); };
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set: (t, k, v) => { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
}
Object.assign(globalThis, { document: { createElement: () => { const ctx = recordingContext(); return { width: 0, height: 0, getContext: () => ctx }; } } });
const { drawNightFx } = await import('../src/client/nightfx.ts');

const lamp = (x: number, y: number, level = 1): ResolvedLight => ({ x, y, radius: 120, rgb: [1, 0.8, 0.5], level, cone: null, size: 5, inside: 10, shadows: false, beam: 0 });
const tl = { x: 0, y: 0 }, br = { x: 1200, y: 800 };

test('the plain-canvas night paints only the lights that reach the view, at most thirty of them', () => {
  const inView = Array.from({ length: 5 }, (_, i) => lamp(100 + i * 200, 400));
  const away = Array.from({ length: 10 }, (_, i) => lamp(5000 + i * 300, 400));
  assert.equal(drawNightFx(recordingContext(), tl, br, 1, 0, undefined, [...inView, ...away]), 5);
  const market = Array.from({ length: 120 }, (_, i) => lamp((i % 12) * 100, Math.floor(i / 12) * 80));
  assert.equal(drawNightFx(recordingContext(), tl, br, 1, 0, undefined, market), 30, 'a crowded view is capped');
});

test('however many pools stack, the light is clamped under a soft ceiling and the glow stays a warm tint', () => {
  ceilings.length = 0;
  const stacked = Array.from({ length: 30 }, () => lamp(600, 400));
  drawNightFx(recordingContext(), tl, br, 1, 0, undefined, stacked);
  const rgb = (s: string) => /rgba\((\d+), (\d+), (\d+)/.exec(s)!.slice(1).map(Number);
  assert.equal(ceilings.length, 2, 'one ceiling for the light, one for the glow');
  const [light, glow] = ceilings.map(rgb);
  assert.ok(light!.every((c) => c < 255 && c >= 0.9 * 255), `no channel of the light reaches white (${light})`);
  assert.ok(glow!.every((c) => c <= 0.6 * 255) && glow![0]! > glow![1]! && glow![1]! > glow![2]!, `the glow is capped low and warm (${glow})`);
});
