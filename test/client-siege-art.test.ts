/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ZOM, ZOMBIES } from '../src/shared/defs.ts';
import type { BuildingView } from '../src/shared/protocol.ts';
import { coreRectAt } from '../src/shared/sim/build.ts';
import { CRACK_COUNT, coreCracks, coreStage, sputter } from '../src/client/coreart.ts';
import { bandAlpha, ALPHA_BANDS } from '../src/client/effects.ts';
import { burst, createBudget, createPool, liveCount, particleAt, take } from '../src/client/particles.ts';
import { coreFlash, createSiegeFx, due, onStrike, SIEGE_CAP } from '../src/client/siegefx.ts';
import { animateZombies, BITE_SLACK, biteTarget, cellId, clearZombieAnims, crossed, STRIKE_AT, swingPose, telegraphs, zombieAnim, type Strike } from '../src/client/zombieart.ts';

const core = { x: 1500, y: 1500 };
const rect = coreRectAt(core);
const none = new Map<number, BuildingView>();

test('the core wears in stages as its health falls: cracks, then smoke, then sputter, then the alarm', () => {
  const full = coreStage(1);
  assert.deepEqual([full.cracks, full.smoke, full.sputter, full.alarm, full.chunks], [0, 0, false, false, 0]);
  assert.equal(coreStage(0.95).cracks, 0, 'a scratch leaves it whole');
  assert.ok(coreStage(0.85).cracks > 0, 'cracks open early');
  assert.equal(coreStage(0.61).smoke, 0);
  assert.equal(coreStage(0.59).smoke, 1, 'one plume below 60%');
  assert.equal(coreStage(0.34).smoke, 3, 'thicker below 35%');
  assert.ok(coreStage(0.34).sputter && !coreStage(0.34).alarm);
  assert.ok(coreStage(0.2).alarm, 'the alarm wails when critical');
  assert.equal(coreStage(0).cracks, CRACK_COUNT);
  let last = coreStage(1);
  for (let f = 1; f >= 0; f -= 0.01) {
    const s = coreStage(f);
    assert.ok(s.cracks >= last.cracks && s.smoke >= last.smoke && s.smokeRate >= last.smokeRate && s.chunks >= last.chunks, `worse never looks better at ${f.toFixed(2)}`);
    last = s;
  }
});

test('a repaired core loses the wear it was mended past', () => {
  const hurt = coreStage(0.3), mended = coreStage(0.8);
  assert.ok(mended.cracks < hurt.cracks && mended.smoke === 0 && !mended.sputter);
});

test('the core cracks the same way every time, inside its block, starting on its rim', () => {
  const a = coreCracks(core.x, core.y), b = coreCracks(core.x, core.y);
  assert.equal(a, b, 'cached');
  assert.equal(a.length, CRACK_COUNT);
  for (const c of a) {
    assert.ok(Math.abs(c.x) >= ZOM.coreHalf - 3 || Math.abs(c.y) >= ZOM.coreHalf - 3, 'starts on the rim');
    for (const v of c.lines) assert.ok(Math.abs(v) <= ZOM.coreHalf, 'stays on the block');
  }
  const sides = new Set(a.slice(0, 4).map((c) => (Math.abs(c.x) > Math.abs(c.y) ? Math.sign(c.x) * 2 : Math.sign(c.y))));
  assert.equal(sides.size, 4, 'the first four cracks open on four different sides');
  assert.notDeepEqual(coreCracks(900, 900)[0]!.lines, a[0]!.lines, 'another core cracks its own way');
});

test('a sputtering light mostly stays on but drops out', () => {
  let off = 0, on = 0;
  for (let t = 0; t < 20_000; t += 7) (sputter(t) < 0.5 ? off++ : on++);
  assert.ok(off > 0 && on > off * 4, `${on} on, ${off} off`);
});

test('a zombie in reach of the core bites the core at the nearest point on its face', () => {
  const r = ZOMBIES.walker.radius;
  const x = rect.x + rect.w + r + ZOM.biteReach;
  const t = biteTarget('walker', x, 1500, rect, none, []);
  assert.deepEqual(t, { on: 'core', x: rect.x + rect.w, y: 1500 });
  assert.equal(biteTarget('walker', x + BITE_SLACK + 1, 1500, rect, none, []), null, 'one step further is out of reach');
});

test('a player in reach is bitten before the core, and a wall beside a zombie is bitten when nothing else is', () => {
  const x = rect.x + rect.w + 20;
  const t = biteTarget('walker', x, 1500, rect, none, [{ x: x + 30, y: 1500, r: 16 }]);
  assert.equal(t?.on, 'player');
  const wall = { kind: 'wall', cx: 10, cy: 10, hp: 10 } as const;
  const at = new Map([[cellId(10, 10), wall as BuildingView]]);
  const w = biteTarget('brute', 10 * ZOM.cell - ZOMBIES.brute.radius - 5, 10 * ZOM.cell + 25, null, at, []);
  assert.deepEqual(w, { on: 'building', x: 10 * ZOM.cell, y: 10 * ZOM.cell + 25 });
  assert.equal(biteTarget('brute', 5 * ZOM.cell, 5 * ZOM.cell, null, at, []), null, 'a far wall is not bitten');
});

test('a swing rears back, lunges past rest, squashes on the blow and settles', () => {
  const windup = swingPose(0.45), blow = swingPose(STRIKE_AT), after = swingPose(0.7), rest = swingPose(0.95);
  assert.ok(windup.lunge < 0 && windup.spread > 0.3, 'rears back with the arms open');
  assert.ok(telegraphs(windup), 'the wind-up telegraphs');
  assert.ok(blow.lunge > 0.3 && blow.spread < 0 && blow.reach > 1.3, 'snaps forward, claws crossing');
  assert.ok(!telegraphs(blow));
  assert.ok(after.stretch < 0.9, 'squashed just after the blow');
  assert.deepEqual(rest, { lunge: 0, spread: 0, reach: 1, stretch: 1 });
  for (let t = 0; t < 1; t += 0.01) { const p = swingPose(t); assert.ok(Number.isFinite(p.lunge + p.spread + p.reach + p.stretch)); }
});

test('crossing the strike mark is seen once per cycle, across the wrap too', () => {
  assert.ok(crossed(0.5, 0.7, STRIKE_AT));
  assert.ok(!crossed(0.7, 0.9, STRIKE_AT));
  assert.ok(crossed(0.9, 0.7, STRIKE_AT), 'a frame long enough to wrap still lands the blow');
  assert.ok(!crossed(0.9, 0.1, STRIKE_AT));
});

test('a zombie standing at the core lands blows on its bite cadence; a walking one never swings', () => {
  clearZombieAnims();
  const x = rect.x + rect.w + 20;
  const strikes: Strike[] = [];
  const target = (k: Parameters<typeof biteTarget>[0], zx: number, zy: number) => biteTarget(k, zx, zy, rect, none, []);
  const period = ZOMBIES.walker.attackMs;
  for (let t = 0; t <= period * 5; t += 16) animateZombies([[1, 0, x, 1500, 10], [2, 0, 800 + t * 0.1, 800, 10]], t, core, target, (s) => strikes.push(s));
  assert.ok(strikes.length >= 4 && strikes.length <= 6, `${strikes.length} blows in five bites`);
  assert.ok(strikes.every((s) => s.target.on === 'core' && Math.abs(s.angle - Math.PI) < 0.01), 'all on the core, swung toward it');
  assert.equal(zombieAnim(2)?.swingAt, null);
  assert.ok((zombieAnim(2)?.stride ?? 0) > 1, 'the walker strode');
  animateZombies([], period * 6, core, target, () => {});
  assert.equal(zombieAnim(1), undefined, 'gone zombies are forgotten');
});

test('the strike budget thins a horde\'s blows to a lone spark instead of flooding the pool', () => {
  const fx = createSiegeFx();
  const s: Strike = { kind: 'walker', target: { on: 'core', x: 1550, y: 1500 }, x: 1570, y: 1500, angle: Math.PI };
  const full = createSiegeFx();
  onStrike(full, s, 1000, () => 0.5);
  const perFull = liveCount(full.pool, 1000);
  for (let i = 0; i < 300; i++) onStrike(fx, s, 1000, () => 0.5);
  const burstMax = fx.strikes.max;
  assert.equal(liveCount(fx.pool, 1000), burstMax * perFull + (300 - burstMax), 'past the budget each blow is a single spark');
  for (let i = 0; i < 2000; i++) onStrike(fx, s, 1000, () => 0.5);
  assert.equal(liveCount(fx.pool, 1000), SIEGE_CAP, 'and the pool never grows past its cap');
  assert.ok(fx.puffs.length <= 48, 'hit puffs are capped');
});

test('a token budget refills at its rate and never past its cap', () => {
  const b = createBudget(10, 5);
  assert.equal(take(b, 0, 9), 5);
  assert.equal(take(b, 0, 1), 0);
  assert.equal(take(b, 300, 9), 3);
  assert.equal(take(b, 100_000, 99), 5);
});

test('emission owed carries over between frames, so smoke keeps its rate at any frame rate', () => {
  const fx = createSiegeFx();
  let n = 0;
  for (let t = 0; t < 1000; t += 7) n += due(fx, 'k', 5, 7);
  assert.ok(n >= 4 && n <= 5, `${n}`);
});

test('smoke and embers climb as they age, and a scaled burst emits fewer', () => {
  const pool = createPool(16);
  burst(pool, 'plume', 0, 0, 0, 0, () => 0.5);
  const p = pool.slots[0]!;
  assert.ok(particleAt(p, 1000).y < particleAt(p, 0).y - 20, 'rises');
  const thin = createPool(64);
  burst(thin, 'hotSparks', 0, 0, 0, 0, Math.random, undefined, 0.2);
  assert.equal(liveCount(thin, 0), 1);
});

test('particles are drawn in a few alpha steps', () => {
  assert.equal(bandAlpha(1), 1);
  assert.equal(bandAlpha(0.01), 1 / ALPHA_BANDS);
  assert.equal(bandAlpha(0.5), 0.5);
});

test('a core bitten without pause flashes at most once per gap instead of staying white', () => {
  const fx = createSiegeFx();
  let lit = 0;
  for (let t = 0; t < 3000; t += 16) if (coreFlash(fx, Math.floor(t / 50) * 50, t) > 0.5) lit++;
  assert.ok(lit < (3000 / 16) * 0.3, `${lit} of ${3000 / 16} frames flashed`);
  assert.ok(lit > 0);
});
