import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD } from '../src/shared/defs.ts';
import { addPlayer, step } from '../src/shared/sim.ts';
import { circleHitsRect } from '../src/shared/sim/movement.ts';
import { createWorld, rand, solidRects, type World } from '../src/shared/sim/world.ts';
import { newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';
import { thinkBots } from '../src/server/bot/tick.ts';
import { TICK_MS } from './helpers.ts';

type Sample = { x: number; y: number; kx: number; ky: number; wall: boolean };

/** Plays bots for `ms` and hands each tick's sample per bot to `check`, which sees the last `window` samples. */
function watch(w: World, bots: Map<number, BotMemory>, ms: number, window: number, check: (name: string, h: readonly Sample[]) => void, opts?: { respawn: false }) {
  const r = () => rand(w);
  const hist = new Map<number, Sample[]>();
  for (let t = 0; t < ms; t += TICK_MS) {
    thinkBots(w, bots, r, opts);
    step(w, TICK_MS);
    const solids = solidRects(w);
    for (const p of w.players.values()) {
      if (p.life.k !== 'alive') { hist.delete(p.id); continue; }
      const h = hist.get(p.id) ?? [];
      h.push({ x: p.x, y: p.y, kx: +p.input.right - +p.input.left, ky: +p.input.down - +p.input.up, wall: solids.some((b) => circleHitsRect(p.x, p.y, WORLD.playerRadius + 2, b)) });
      if (h.length > window) h.shift();
      hist.set(p.id, h);
      if (h.length === window) check(p.name, h);
    }
  }
}

const reversals = (h: readonly Sample[]) => h.slice(1).filter((s, i) => s.kx * h[i]!.kx + s.ky * h[i]!.ky < 0).length;
const net = (h: readonly Sample[]) => Math.hypot(h[h.length - 1]!.x - h[0]!.x, h[h.length - 1]!.y - h[0]!.y);
const travelled = (h: readonly Sample[]) => h.slice(1).reduce((sum, s, i) => sum + Math.hypot(s.x - h[i]!.x, s.y - h[i]!.y), 0);

test('squad bots never flip their keys back and forth in place around the Bastion', () => {
  const w = createWorld('ZOM', 1, 'outpost');
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  for (let i = 0; i < 4; i++) bots.set(addPlayer(w, `b${i}`, randomLoadout(r), { kind: 'bot' }).id, newBotMemory(r));
  const worst: string[] = [];
  watch(w, bots, 90_000, 30, (name, h) => { if (reversals(h) >= 4 && net(h) < 30) worst.push(`${name} ${reversals(h)} flips in a second`); }, { respawn: false });
  assert.deepEqual(worst.slice(0, 3), []);
});

test('bots never shuffle along a wall for seconds without getting anywhere', () => {
  const w = createWorld('FFA', 1, 'plaza');
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  for (let i = 0; i < WORLD.minPlayers; i++) bots.set(addPlayer(w, `b${i}`, randomLoadout(r)).id, newBotMemory(r));
  const stuck: string[] = [];
  watch(w, bots, 70_000, 90, (name, h) => {
    const pressing = h.filter((s) => s.kx || s.ky).length / h.length, walled = h.filter((s) => s.wall).length / h.length;
    if (pressing > 0.8 && walled > 0.8 && net(h) < 40 && travelled(h) < 200) stuck.push(`${name} at ${h[0]!.x.toFixed(0)},${h[0]!.y.toFixed(0)}`);
  });
  assert.deepEqual([...new Set(stuck)].slice(0, 3), []);
});
