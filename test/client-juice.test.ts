/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HITSTOP, lag, newClock, requestStop, stepClock } from '../src/client/hitstop.ts';
import { addHit, alphaOf, isBig, NUM, NUM_LIFE_MS, sweepNums, type Num } from '../src/client/dmgnums.ts';
import { BIT_CAP, BURST_MS, clearHits, emitBit, heightAt, liveBits, onDeath, queueHits, releaseQueued, resetFx, nums, travel } from '../src/client/killfx.ts';
import { beatHz, flashAt, heartbeat, zoomAt, SCREEN } from '../src/client/screenfx.ts';

test('hit-stop holds the drawn clock for its length, then catches up to real time', () => {
  const c = newClock(1000);
  assert.equal(stepClock(c, 1016), 1016);
  assert.ok(requestStop(c, 1016, 55));
  assert.equal(stepClock(c, 1033), 1016, 'held');
  assert.equal(stepClock(c, 1066), 1016, 'still held');
  const after = stepClock(c, 1086);
  assert.ok(after > 1016 && after < 1086, 'catching up, not teleporting');
  let t = 1086;
  while (lag(c) > 0) { t += 16; stepClock(c, t); assert.ok(t < 1400); }
  assert.equal(stepClock(c, t + 16), t + 16);
});

test('a hit-stop is capped, extends while running, and cannot be chained by a held trigger', () => {
  const c = newClock(0);
  assert.ok(requestStop(c, 100, 500));
  assert.equal(c.until - 100, HITSTOP.maxMs, 'capped');
  assert.ok(!requestStop(c, 120, 30), 'a shorter one inside it adds nothing');
  stepClock(c, 200);
  assert.ok(!requestStop(c, 210, 40), 'cooldown');
  assert.ok(requestStop(c, 160 + HITSTOP.cooldownMs + 60, 40));
  assert.ok(HITSTOP.killMs >= 30 && HITSTOP.killMs <= 60 && HITSTOP.bigMs >= 30 && HITSTOP.bigMs <= 60, 'within the bible 30-60 ms');
});

test('hits on one victim stack into one number, a newer number pushes older ones up, and the list is capped', () => {
  const list: Num[] = [];
  const hit = (victim: number, amount: number) => ({ victim, kind: 'player' as const, amount, x: 0, y: 0 });
  addHit(list, hit(2, 14), 0);
  addHit(list, hit(2, 14), 100);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.total, 28);
  assert.equal(list[0]!.chips.length, 2);
  addHit(list, hit(2, 10), 100 + NUM.windowMs + 10);
  assert.equal(list.length, 2, 'past the window it opens a new number');
  assert.ok(list[0]!.push > 0 && list[1]!.push === 0);
  addHit(list, hit(3, 5), 100);
  assert.equal(list.length, 3, 'another victim has its own');
  for (let i = 0; i < 100; i++) addHit(list, hit(100 + i, 5), 0);
  assert.equal(list.length, NUM.cap);
  sweepNums(list, NUM_LIFE_MS + 10_000);
  assert.equal(list.length, 0);
});

test('a number fades only after its combo window, and a big hit is big', () => {
  const list: Num[] = [];
  addHit(list, { victim: 1, kind: 'player', amount: 135, x: 0, y: 0 }, 0);
  const n = list[0]!;
  assert.ok(isBig(n));
  assert.equal(alphaOf(n, NUM.windowMs), 1);
  assert.equal(alphaOf(n, NUM_LIFE_MS), 0);
});

test('the burst pool never grows past its cap and every bit ends within the burst limit', () => {
  resetFx();
  for (let i = 0; i < 60; i++) onDeath({ x: 0, y: 0, color: '#e8743b', dir: 1, mine: i % 2 === 0, self: false }, 0);
  assert.ok(liveBits(1).length <= BIT_CAP);
  assert.equal(liveBits(BURST_MS + 200).length, 0, 'nothing outlasts the burst');
  for (let i = 0; i < BIT_CAP * 2; i++) emitBit({ kind: 'chunk', x: 0, y: 0, born: 0, life: 100 });
  assert.equal(liveBits(1).length, BIT_CAP);
});

test('your hits are held until the render clock reaches their tick, and a big sum is one hit-stop', () => {
  resetFx();
  const ev = (victim: number, amount: number) => ({ e: 'dmg' as const, attacker: 1, victim, amount, x: 5, y: 5, kind: 'player' as const });
  queueHits([ev(2, 17), ev(2, 17), ev(2, 17), ev(2, 17), ev(9, 20), { ...ev(3, 20), attacker: 7 }], 1, 1000);
  releaseQueued(900, 5000);
  assert.equal(nums.length, 0, 'not yet');
  releaseQueued(1000, 5000);
  assert.equal(nums.length, 2);
  assert.equal(nums.find((n) => n.victim === 2)!.total, 68);
});

test('hits queued in one room never surface in the next: their tick times belong to the old room, and clearHits drops them', () => {
  resetFx();
  const ev = { e: 'dmg' as const, attacker: 1, victim: 2, amount: 20, x: 5, y: 5, kind: 'player' as const };
  // Late in a long match: 600 s of server time. The page leaves before the render clock reaches it.
  queueHits([ev], 1, 600_000);
  releaseQueued(599_900, 1000);
  assert.equal(nums.length, 0);
  // Left alone, the next room's clock (which starts near zero) reaches 600 s ten minutes in, and a number pops over nobody.
  releaseQueued(600_000, 2000);
  assert.equal(nums.length, 1, "without a reset the old room's hit lands in the new one");
  resetFx();
  queueHits([ev], 1, 600_000);
  clearHits();
  releaseQueued(600_000, 3000);
  assert.equal(nums.length, 0, 'after clearHits nothing from the old room is left to land');
});

test('a hidden tab does not save up hits for one burst on return once clearHits runs', () => {
  resetFx();
  const ev = (victim: number) => ({ e: 'dmg' as const, attacker: 1, victim, amount: 30, x: 5, y: 5, kind: 'player' as const });
  for (let t = 0; t < 60; t++) queueHits([ev(t), ev(t)], 1, 10_000 + t * 33);
  releaseQueued(20_000, 5000);
  assert.ok(nums.length >= NUM.cap, `${nums.length} numbers at once on return without a reset`);
  resetFx();
  for (let t = 0; t < 60; t++) queueHits([ev(t), ev(t)], 1, 10_000 + t * 33);
  clearHits();
  releaseQueued(20_000, 5000);
  assert.equal(nums.length, 0);
});

test('ballistic helpers: a toss lands, bounces once lower, then rests', () => {
  const vz = 300, g = 1500, t1 = (2 * vz) / g;
  assert.equal(heightAt(vz, g, 0), 0);
  assert.ok(heightAt(vz, g, t1 / 2) > 25);
  const peak2 = Math.max(...Array.from({ length: 40 }, (_, i) => heightAt(vz, g, t1 + (i * 0.4 * t1) / 40)));
  assert.ok(peak2 > 0 && peak2 < heightAt(vz, g, t1 / 2));
  assert.equal(heightAt(vz, g, 5), 0);
  assert.ok(travel(300, 4, 10) < 300 / 4 + 0.01, 'drag stops it');
});

test('screen pulses are short, a heartbeat is two thumps, and health speeds it up', () => {
  assert.equal(zoomAt(1000 + SCREEN.punchMs, 1000, 1), 1);
  assert.ok(zoomAt(1030, 1000, 1) > 1 && zoomAt(1030, 1000, 1) <= 1 + SCREEN.punchZoom);
  assert.equal(flashAt(1000 + SCREEN.flashMs, 1000, 1), 0);
  assert.ok(heartbeat(0.04) > 0.9 && heartbeat(0.24) > 0.5 && heartbeat(0.5) < 0.05);
  assert.ok(beatHz(0.05) > beatHz(0.3) && beatHz(0.0) <= 2.4 + 1e-9);
});

test('when the WebGL pass owns the world, a kill never paints the cleared HUD canvas solid (no black-out), only the faint amber wash', async () => {
  const { pulseScreen, drawScreenPulse, setPulseHook } = await import('../src/client/screenfx.ts');
  const fills: { op: string; alpha: number; style: unknown }[] = [];
  const ctx = {
    canvas: {}, globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '',
    save() {}, restore() {}, setTransform() {}, drawImage() {},
    fillRect(this: { globalCompositeOperation: string; globalAlpha: number; fillStyle: unknown }) { fills.push({ op: this.globalCompositeOperation, alpha: this.globalAlpha, style: this.fillStyle }); },
  } as unknown as CanvasRenderingContext2D;
  let gl = 0;
  setPulseHook((s) => { gl = s; });
  pulseScreen(1000, 1);
  setPulseHook(null);
  drawScreenPulse(ctx, 800, 600, 1, 1010, false);
  assert.ok(gl > 0, 'the post pass takes the chromatic pulse');
  assert.ok(fills.every((f) => f.op === 'source-over' && f.alpha <= 0.2), JSON.stringify(fills));
});
