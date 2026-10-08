/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MapDef } from '../src/shared/maps.ts';

/** A WebGL context stand-in: every call is a no-op that hands back a truthy handle, and losing it is counted. */
function fakeGL(lost: { n: number }) {
  const lose = { loseContext: () => { lost.n++; } };
  return new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => (k === 'getExtension' ? (name: string) => (name === 'WEBGL_lose_context' ? lose : null) : () => ({})),
  });
}
const fake2d = () => new Proxy({} as Record<string, unknown>, {
  get: (_t, k) => (k === 'getImageData' ? (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => ({})),
});

test('a map change frees the old water context (WEBGL_lose_context) before making the next, and the old one\'s loss does not knock the water off the GPU', async () => {
  const lost = { n: 0 };
  const canvases: { listeners: Map<string, (e: { preventDefault(): void }) => void>; webgl: boolean }[] = [];
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g.document, location: g.location };
  Object.assign(globalThis, {
    location: { search: '' },
    document: {
      createElement: () => {
        const c = { width: 0, height: 0, webgl: false, listeners: new Map<string, (e: { preventDefault(): void }) => void>(),
          addEventListener(type: string, fn: (e: { preventDefault(): void }) => void) { c.listeners.set(type, fn); },
          getContext(kind: string) { if (kind === 'webgl') { c.webgl = true; return fakeGL(lost); } return fake2d(); } };
        canvases.push(c);
        return c;
      },
    },
  });
  try {
    const { drawWater, waterStats } = await import('../src/client/themes/harborwater.ts');
    const ctx = { getTransform: () => ({ a: 1 }), drawImage() {} } as unknown as CanvasRenderingContext2D;
    const view = { x0: 0, y0: 0, x1: 100, y1: 100 };
    const map = (name: string, size: number) => ({ name, size, polys: [] }) as unknown as MapDef;
    drawWater(ctx, 0, view, map('wa', 120), [], []);
    assert.equal(waterStats.mode, 'gl');
    const glCanvases = () => canvases.filter((c) => c.webgl);
    assert.equal(glCanvases().length, 1);
    drawWater(ctx, 16, view, map('wb', 180), [], []);
    assert.equal(glCanvases().length, 2, 'the new map gets its own context');
    assert.equal(lost.n, 1, 'and the old one is let go at once, not left for the browser to evict');
    // The browser then reports the old context lost: that is the release, not a failure of the water now in use.
    glCanvases()[0]!.listeners.get('webglcontextlost')?.({ preventDefault() {} });
    drawWater(ctx, 32, view, map('wb', 180), [], []);
    assert.equal(waterStats.mode, 'gl', 'the water stays on the GPU');
    assert.equal(glCanvases().length, 2, 'with the same context');
  } finally {
    Object.assign(globalThis, saved);
  }
});
