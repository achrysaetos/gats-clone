/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createQuality, govern, governor, GOVERN, parseMode, QUALITY, TIERS, type Governor, type Tier } from '../src/client/quality.ts';

/** Feeds `ms`-long frames for `seconds`, returning the governor and each tier it passed through. */
function run(g: Governor, frames: (i: number) => number, seconds: number, start = 0) {
  const tiers: Tier[] = [g.tier];
  let now = start;
  for (let i = 0; now < start + seconds * 1000; i++) {
    const ms = frames(i);
    now += ms;
    g = govern(g, ms, now);
    if (g.tier !== tiers.at(-1)) tiers.push(g.tier);
  }
  return { g, tiers, now };
}

const steady = () => 1000 / 60;
/** Seconds from a change to the governor's next judgement. */
const PERIOD = (GOVERN.settleMs + GOVERN.windowMs) / 1000;
/** A fifth of frames miss vsync, like the 2560x1440 2x DPR runs that dropped up to 19% of frames. */
const dropping = (i: number) => (i % 5 === 0 ? 2000 / 60 : 1000 / 60);

test('frames on budget never move the tier', () => {
  assert.deepEqual(run(governor('high'), steady, 120).tiers, ['high']);
});

test('dropped frames step down one tier per window, not all at once', () => {
  const { tiers } = run(governor('high'), (i) => (i % 3 === 0 ? 40 : 1000 / 60), PERIOD * 0.9);
  assert.deepEqual(tiers, ['high'], 'needs a full window plus the settle before judging');
  const longer = run(governor('high'), (i) => (i % 3 === 0 ? 40 : 1000 / 60), PERIOD * 1.5);
  assert.deepEqual(longer.tiers, ['high', 'medium']);
});

test('a GPU that stays slow walks down to low and stops there', () => {
  assert.deepEqual(run(governor('ultra', 'ultra'), () => 34, 60).tiers, ['ultra', 'high', 'medium', 'low']);
});

test('a lone GC pause does not step down, and a paused page is not frame time', () => {
  assert.deepEqual(run(governor('high'), (i) => (i % 200 === 199 ? 300 : 1000 / 60), 60).tiers, ['high']);
  assert.deepEqual(run(governor('high'), (i) => (i % 200 === 199 ? GOVERN.hitchMs + 1 : 1000 / 60), 600).tiers, ['high']);
});

test('even at a frame a second the governor judges every couple of seconds of frames', () => {
  const { tiers, now } = run(governor('high'), () => 1000, 30);
  assert.deepEqual(tiers, ['high', 'medium', 'low'], `reached low by ${now / 1000}s`);
});

test('after a slow spell the governor climbs back, but never above its top', () => {
  const slow = run(governor('high'), dropping, PERIOD * 1.5);
  assert.equal(slow.g.tier, 'medium');
  const calm = run(slow.g, steady, 30 + GOVERN.barMs / 1000, slow.now);
  assert.deepEqual(calm.tiers, ['medium', 'high'], 'back to high once the bar on it lapses');
  assert.deepEqual(run(calm.g, steady, 300, calm.now).tiers, ['high'], 'auto never climbs to ultra');
});

test('a tier that keeps failing is tried less and less often, so the governor never thrashes', () => {
  // A scene that is fine at medium and drops frames at high.
  let g = governor('high');
  let now = 0;
  const ups: number[] = [];
  for (let i = 0; now < 20 * 60_000; i++) {
    const ms = g.tier === 'high' ? dropping(i) : steady();
    now += ms;
    const before = g.tier;
    g = govern(g, ms, now);
    if (before === 'medium' && g.tier === 'high') ups.push(now);
  }
  const gaps = ups.slice(1).map((t, i) => t - ups[i]!);
  assert.ok(ups.length >= 2 && ups.length <= 5, `climbed back ${ups.length} times in 20 minutes`);
  assert.ok(gaps.every((gap, i) => i === 0 || gap > gaps[i - 1]!), `each retry waits longer: ${gaps.map((x) => Math.round(x / 1000)).join(', ')}s`);
});

test('a tier picked by hand ignores frame time; auto steps; ?bloom=0 turns bloom off on every tier', () => {
  const fixed = createQuality('ultra', true);
  for (let i = 0, now = 0; i < 2000; i++) fixed.frame(40, (now += 40));
  assert.equal(fixed.tier(), 'ultra');
  assert.equal(fixed.knobs().bloomDiv, QUALITY.ultra.bloomDiv);
  const auto = createQuality('auto', false);
  for (let i = 0, now = 0; i < 400; i++) auto.frame(40, (now += 40));
  assert.notEqual(auto.tier(), 'high');
  assert.equal(auto.changes()[0]?.why, 'auto');
  assert.ok(auto.changes()[0]!.p90! > GOVERN.downMs);
  for (const t of TIERS) { auto.set(t, 0); assert.equal(auto.knobs().bloomDiv, null); }
});

test('tiers only get cheaper going down, and modes parse from the address bar or storage', () => {
  for (let i = 1; i < TIERS.length; i++) {
    const lo = QUALITY[TIERS[i - 1]!], hi = QUALITY[TIERS[i]!];
    assert.ok(lo.renderScale <= hi.renderScale && lo.particles <= hi.particles && lo.decals <= hi.decals && lo.lights <= hi.lights);
    assert.ok((lo.bloomDiv === null ? 0 : 1 / lo.bloomDiv) <= (hi.bloomDiv === null ? 0 : 1 / hi.bloomDiv));
  }
  assert.equal(parseMode('medium'), 'medium');
  assert.equal(parseMode('auto'), 'auto');
  assert.equal(parseMode('max'), null);
  assert.equal(parseMode(null), null);
});
