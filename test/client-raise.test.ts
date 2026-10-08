/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clickFindsGunDown, NO_FIRING, raiseLeftOf, settle, settleOf, stepTrigger, type ServerGun } from '../src/client/fire.ts';
import { CARRY, carryAt, createRaiseWatch, gunPhaseOf, RETICLE_RAISE, reticleLook, stepCarry } from '../src/client/raise.ts';
import { GUNS, PRESS_BUFFER_MS, raiseMsOf, settleRulesOf, WORLD } from '../src/shared/defs.ts';

const TICK_MS = 1000 / WORLD.tickHz;
const moving = { up: false, down: false, left: false, right: true, reload: false };
const SERVER: ServerGun = { gun: 'assault', mag: GUNS.assault.mag, reloadMs: GUNS.assault.reloadMs, ammo: GUNS.assault.mag, reloading: false, reloadFrac: 0, alive: true, armed: true };

test('the gun phase follows the predicted trigger: sprint, then raising for the gun\'s raise, then ready', () => {
  let f = settle(NO_FIRING, SERVER, 0, 0, []).firing;
  assert.equal(gunPhaseOf(f), 'ready');
  let now = TICK_MS;
  f = { ...f, trigger: stepTrigger(f.trigger, { ...moving, fire: false, shots: 0, sprint: true }, now).t };
  assert.equal(gunPhaseOf(f), 'sprint');
  assert.equal(clickFindsGunDown(f), true, 'a click while sprinting finds the gun down');
  now += TICK_MS;
  f = { ...f, trigger: stepTrigger(f.trigger, { ...moving, fire: false, shots: 0, sprint: false }, now).t };
  assert.equal(gunPhaseOf(f), 'raising');
  assert.equal(raiseLeftOf(f), raiseMsOf(GUNS.assault));
  assert.equal(settleOf(f), 1, 'the settle waits, full, for the gun to come up');
  let ticks = 0;
  while (gunPhaseOf(f) === 'raising') {
    now += TICK_MS;
    ticks++;
    f = { ...f, trigger: stepTrigger(f.trigger, { ...moving, fire: false, shots: 0 }, now).t };
    if (raiseLeftOf(f) > PRESS_BUFFER_MS) assert.equal(clickFindsGunDown(f), true);
  }
  assert.ok(Math.abs(ticks * TICK_MS - raiseMsOf(GUNS.assault)) <= TICK_MS, `ready after ${ticks * TICK_MS}ms`);
  assert.equal(clickFindsGunDown(f), false);
});

test('a snapshot mid-raise tells the client how much of the raise is left, and it predicts no shot before', () => {
  const settleMs = settleRulesOf(GUNS.assault).ms;
  // 300 ms of the raise to go: the clock reads 1 (the settle) plus 300 ms of it.
  const sv = { ...SERVER, sprint: false, settle: 1 + 300 / settleMs, settleMs };
  let f = settle(NO_FIRING, sv, 10, 0, []).firing;
  assert.ok(Math.abs(raiseLeftOf(f) - 300) < 1e-6);
  let fired: number | null = null;
  for (let i = 1; i < 20 && fired === null; i++) {
    const step = stepTrigger(f.trigger, { ...moving, right: false, fire: true, shots: 1 }, (10 + i) * TICK_MS);
    f = { ...f, trigger: step.t };
    if (step.fired) fired = i * TICK_MS;
  }
  assert.ok(fired !== null && fired >= 300 - 1e-6 && fired <= 300 + TICK_MS + 1e-6, `the first predicted shot is ${fired}ms on`);
});

test('the reticle is lowered (wide, grey, faint, no dot) while the gun is down, then snaps in with a flash', () => {
  const maxGap = 90;
  for (const phase of ['sprint', 'raising'] as const) {
    const low = reticleLook(phase, 10, maxGap, -Infinity, Infinity);
    assert.ok(low.gap >= maxGap * 0.75, `${phase}: splayed wide (${low.gap})`);
    assert.equal(low.grey, true);
    assert.equal(low.dot, 0, 'no centre dot');
    assert.ok(low.alpha < 0.6);
  }
  const snapping = reticleLook('ready', 10, maxGap, RETICLE_RAISE.snapMs * 0.3, Infinity);
  assert.ok(snapping.gap < maxGap * RETICLE_RAISE.lowShare && snapping.gap > 10, `closing in (${snapping.gap})`);
  assert.ok(snapping.flash > 0 && !snapping.grey);
  const landed = reticleLook('ready', 10, maxGap, RETICLE_RAISE.snapMs, Infinity);
  assert.ok(Math.abs(landed.gap - 10) < 1e-9, 'lands on the spread\'s own gap');
  const over = Array.from({ length: 30 }, (_, i) => reticleLook('ready', 10, maxGap, (i / 30) * RETICLE_RAISE.snapMs, Infinity).gap);
  assert.ok(Math.min(...over) < 10, 'it overshoots a hair, a snap rather than a slide');
  const settled = reticleLook('ready', 10, maxGap, 5000, Infinity);
  assert.deepEqual(settled, { gap: 10, alpha: 1, grey: false, dot: 1, flash: 0, shake: 0 });
  assert.equal(reticleLook('ready', 10, maxGap, Infinity, Infinity).gap, 10, 'never raised: just the spread');
  const shaken = [10, 30, 60, 100].map((ms) => reticleLook('raising', 10, maxGap, -Infinity, ms).shake);
  assert.ok(shaken.some((x) => Math.abs(x) > 1), 'a click while the gun is down shakes it');
  assert.equal(reticleLook('raising', 10, maxGap, -Infinity, RETICLE_RAISE.shakeMs).shake, 0);
});

test('the raise watch clicks once, the frame the gun comes up, and notes a click made while it was down', () => {
  const watch = createRaiseWatch();
  let f = settle(NO_FIRING, SERVER, 0, 0, []).firing;
  f = { ...f, trigger: stepTrigger(f.trigger, { ...moving, fire: false, shots: 0, sprint: true }, TICK_MS).t };
  assert.equal(watch.step(f, 0), false);
  assert.equal(watch.click(f, 5), true);
  assert.equal(watch.sinceDenied(25), 20);
  f = { ...f, trigger: stepTrigger(f.trigger, { ...moving, fire: false, shots: 0 }, 2 * TICK_MS).t };
  assert.equal(watch.step(f, 10), false);
  assert.equal(watch.phase, 'raising');
  let ups = 0, now = 10, at = 2;
  while (now < 2000) {
    at++;
    now += TICK_MS;
    f = { ...f, trigger: stepTrigger(f.trigger, { ...moving, fire: false, shots: 0 }, at * TICK_MS).t };
    if (watch.step(f, now)) ups++;
  }
  assert.equal(ups, 1);
  assert.equal(watch.phase, 'ready');
  assert.equal(watch.click(f, now), false, 'a click on a raised gun is not denied');
});

test('the soldier\'s gun comes up from the carry over exactly the gun\'s raise time, overshoots a hair, and settles on the aim', () => {
  for (const gun of ['pistol', 'lmg'] as const) {
    const raise = raiseMsOf(GUNS[gun]);
    const at = (ms: number) => carryAt(ms, raise, 1);
    assert.equal(at(0), 1, 'starts in the carry');
    assert.ok(at(raise * 0.5) > 0.5, `${gun}: still mostly low half way up (${at(raise * 0.5)})`);
    // It moves the whole time: monotonic down to the aim.
    for (let ms = 0; ms < raise; ms += raise / 20) assert.ok(at(ms + raise / 20) <= at(ms) + 1e-12);
    assert.ok(Math.abs(at(raise)) < 1e-9, 'on the aim exactly when it can fire');
    const past = Array.from({ length: 20 }, (_, i) => at(raise + (i / 20) * CARRY.overshootMs));
    assert.ok(Math.min(...past) < -0.05 && Math.min(...past) >= -CARRY.overshoot, 'swings a hair past the aim');
    assert.equal(at(raise + CARRY.overshootMs), 0);
  }
  // A short sprint that only got the gun 30% into the carry comes up from there, and swings past the aim only 30% as far.
  assert.equal(carryAt(0, 400, 0.3), 0.3);
  assert.ok(Math.abs(carryAt(200, 400, 0.3) - 0.3 * carryAt(200, 400, 1)) < 1e-12);
  const swing = (from: number) => Math.min(...Array.from({ length: 20 }, (_, i) => carryAt(400 + (i / 20) * CARRY.overshootMs, 400, from)));
  assert.ok(Math.abs(swing(0.3) - 0.3 * swing(1)) < 1e-12, `overshoot scales with the carry (${swing(0.3)} vs ${swing(1)})`);
});

test('a body drops into the carry over CARRY.downMs while it sprints and comes back up over its raise; reduced motion snaps', () => {
  const raise = 400;
  // id 101: first seen walking, then sprints for 70 ms (half the drop), then stops.
  assert.equal(stepCarry(101, false, raise, 1000, false), 0);
  let a = 0;
  for (let now = 1000; now <= 1070; now += 10) a = stepCarry(101, true, raise, now, false);
  assert.ok(Math.abs(a - 70 / CARRY.downMs) < 1e-9, `half way down after 70 ms (${a})`);
  assert.equal(stepCarry(101, false, raise, 1080, false), a, 'the sprint just ended: still where it got to');
  assert.ok(Math.abs(stepCarry(101, false, raise, 1080 + raise / 2, false) - carryAt(raise / 2, raise, a)) < 1e-12, 'then rises on carryAt from there');
  assert.equal(stepCarry(101, false, raise, 1080 + raise + CARRY.overshootMs, false), 0, 'and is on the aim once it settles');
  // Seen sprinting from the first frame, it is already in the carry. With reduced motion, the gun is held down for the raise and then snaps up.
  assert.equal(stepCarry(102, true, raise, 0, true), 1);
  assert.equal(stepCarry(102, false, raise, 10, true), 1);
  assert.equal(stepCarry(102, false, raise, 10 + raise - 1, true), 1, 'no easing');
  assert.equal(stepCarry(102, false, raise, 10 + raise, true), 0, 'and no overshoot');
});

test('a sprint the server reports runs no raise clock: the gun is down until it ends, and only then comes up', () => {
  const settleMs = settleRulesOf(GUNS.assault).ms;
  const f = settle(NO_FIRING, { ...SERVER, sprint: true, settle: 1 + 300 / settleMs, settleMs }, 10, 0, []).firing;
  assert.equal(gunPhaseOf(f), 'sprint');
  assert.equal(raiseLeftOf(f), 0, 'no raise is counted down while still sprinting');
  assert.equal(clickFindsGunDown(f), true);
});

test('a click within the press buffer of the gun coming up is kept, not denied; nothing is "down" for the dead or after the round', () => {
  const settleMs = settleRulesOf(GUNS.assault).ms;
  const raising = (leftMs: number) => settle(NO_FIRING, { ...SERVER, sprint: false, settle: 1 + leftMs / settleMs, settleMs }, 10, 0, []).firing;
  assert.equal(clickFindsGunDown(raising(PRESS_BUFFER_MS + 20)), true);
  assert.equal(gunPhaseOf(raising(PRESS_BUFFER_MS - 20)), 'raising');
  assert.equal(clickFindsGunDown(raising(PRESS_BUFFER_MS - 20)), false, 'close enough to up that the click is buffered into the first shot');
  const sprinting = settle(NO_FIRING, { ...SERVER, sprint: true }, 10, 0, []).firing;
  assert.equal(clickFindsGunDown(settle(sprinting, { ...SERVER, sprint: true, alive: false }, 11, 0, []).firing), false, 'dead');
  assert.equal(clickFindsGunDown(settle(NO_FIRING, { ...SERVER, sprint: true, armed: false }, 10, 0, []).firing), false, 'round over');
});

test('the raise watch reads a dead soldier\'s gun as ready, so no click plays at the respawn', () => {
  const watch = createRaiseWatch();
  const sprinting = settle(NO_FIRING, { ...SERVER, sprint: true }, 10, 0, []).firing;
  watch.step(sprinting, 0);
  assert.equal(watch.phase, 'sprint');
  const dead = settle(sprinting, { ...SERVER, sprint: true, alive: false }, 11, 0, []).firing;
  assert.equal(watch.step(dead, 16), false);
  assert.equal(watch.phase, 'ready');
});

test('a lowered reticle never draws tighter than the spread itself', () => {
  const wide = reticleLook('raising', 85, 90, -Infinity, Infinity);
  assert.equal(wide.gap, 85, 'a spread wider than the lowered share keeps its own gap');
  assert.equal(reticleLook('raising', 10, 90, -Infinity, Infinity).gap, 90 * RETICLE_RAISE.lowShare);
});
