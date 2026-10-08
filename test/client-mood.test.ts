import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lightGovernor } from '../src/client/fxparams.ts';
import { ambientFor } from '../src/client/lighting.ts';
import { MIN_AMBIENT, MOODS, moodOf } from '../src/client/mood.ts';
import { MAP_IDS, MAPS } from '../src/shared/maps.ts';

const lum = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;

test('every versus map has a mood, found by id or display name', () => {
  for (const id of MAP_IDS) {
    if (id === 'outpost' || id === 'range') continue;
    assert.ok(MOODS[id], `${id} has a mood`);
    assert.equal(moodOf(id), MOODS[id]);
    assert.equal(moodOf(MAPS[id].name), MOODS[id]);
  }
  assert.equal(moodOf('outpost'), undefined);
  assert.equal(moodOf(undefined), undefined);
});

test('no mood crushes the world: ambient channels stay above the floor and the picture stays readable', () => {
  for (const [id, m] of Object.entries(MOODS)) {
    assert.ok(m.dusk >= 0 && m.dusk <= 1, id);
    if (m.ambient) {
      assert.ok(m.ambient.every((c) => c >= MIN_AMBIENT && c <= 1), `${id} ambient in range`);
      assert.ok(lum(m.ambient) >= 0.24, `${id} ambient luminance ${lum(m.ambient).toFixed(2)} is not black`);
    }
    assert.ok((m.gain ?? 1) >= 0.8 && (m.gain ?? 1) <= 1.6, `${id} gain`);
    if (m.fog) assert.ok(m.fog.density > 0 && m.fog.density <= 0.6, `${id} fog stays subtle`);
  }
});

test('the night maps are dark enough for their lights to matter, and the day maps stay bright', () => {
  const dark = Object.entries(MOODS).filter(([, m]) => m.dusk >= 0.85);
  assert.ok(dark.length >= 7, 'most maps are night maps');
  const bright = Object.entries(MOODS).filter(([, m]) => m.dusk <= 0.35);
  assert.ok(bright.length >= 1, 'at least one map is a day map');
  for (const [, m] of dark) assert.ok(lum(ambientFor(m.dusk, false, m).rgb) < 0.5);
});

test('a mood feeds the ambient: its own night colour, its fog, wet ground and rain', () => {
  const m = MOODS.market!;
  const a = ambientFor(1, false, m);
  a.rgb.forEach((c, i) => assert.ok(Math.abs(c - m.ambient![i]!) < 1e-9));
  assert.ok(a.gain > ambientFor(1).gain, 'a neon night hits harder than the default');
  assert.ok(a.fog && a.fog.density > 0 && a.wet > 0.5 && a.rain > 0.5);
  const none = ambientFor(1);
  assert.equal(none.fog, null);
  assert.equal(none.wet + none.rain, 0);
  assert.deepEqual(ambientFor(0, false, m).rgb, [1, 1, 1], 'by day the mood fades out');
});

test('governor: a transient spike never steps the lights down; a sustained slow stretch does, one tier at a time', () => {
  const g = lightGovernor({ bucketMs: 1000 });
  let now = 0;
  const feed = (dt: number, secs: number, tier: number, cpu = 3) => {
    const out: string[] = [];
    for (let i = 0; i < secs * (1000 / dt); i++) { now += dt; const s = g.push(dt, cpu, now, tier, 2, true); if (s.action !== 'none') out.push(s.action); }
    return out;
  };
  assert.deepEqual(feed(16.7, 5, 0), [], 'smooth');
  assert.deepEqual(feed(120, 2, 0), [], 'a two second hitch is not a slow GPU');
  assert.deepEqual(feed(16.7, 5, 0), []);
  assert.deepEqual(feed(300, 5, 0), [], 'stalls over 250 ms are not frame times');
  const slow = feed(45, 6, 0);
  assert.deepEqual(slow, ['down'], 'sustained slow frames step down once');
  assert.deepEqual(feed(45, 1, 1), [], 'then it waits to see the effect');
});

test('governor: a display held to 30 Hz is not slow, but lights are only given up at the lowest tier after a long bad stretch', () => {
  const g = lightGovernor({ bucketMs: 1000 });
  let now = 0;
  const run = (dt: number, secs: number, tier: number) => {
    const out: string[] = [];
    for (let i = 0; i < secs * (1000 / dt); i++) { now += dt; const s = g.push(dt, 3, now, tier, 2, true); if (s.action !== 'none') out.push(s.action); }
    return out;
  };
  assert.deepEqual(run(33.3, 30, 0), [], '30 Hz power-saver pacing keeps every tier');
  const g2 = lightGovernor({ bucketMs: 1000 });
  now = 0;
  const acts: string[] = [];
  for (let i = 0; i < 60 * 25; i++) { now += 40; const s = g2.push(40, 3, now, 2, 2, true); if (s.action !== 'none') acts.push(s.action); }
  assert.deepEqual(acts.slice(0, 1), ['off'], 'at the lowest tier it takes a long stretch of 25 fps before the lights go');
  assert.ok(now > 12_000, 'not within the first seconds');
});

test('governor: a long smooth stretch steps back up, but not to a tier that failed twice', () => {
  const g = lightGovernor({ bucketMs: 1000, goodBuckets: 5 });
  let now = 0;
  const step = (dt: number, secs: number, tier: number) => {
    const out: string[] = [];
    for (let i = 0; i < secs * (1000 / dt); i++) { now += dt; const s = g.push(dt, 3, now, tier, 2, true); if (s.action !== 'none') out.push(s.action); }
    return out;
  };
  assert.deepEqual(step(50, 5, 0), ['down']);
  assert.deepEqual(step(16.7, 9, 1), ['up'], 'smooth again, so it climbs back');
  assert.deepEqual(step(50, 5, 0), ['down']);
  assert.deepEqual(step(16.7, 12, 1), [], 'tier 0 failed twice: it stays on tier 1');
});

test('governor: CPU cost alone can drop the lights, and a pass that stays costly with lights off is dropped', () => {
  const g = lightGovernor({ bucketMs: 1000 });
  let now = 0;
  const acts: string[] = [];
  for (let i = 0; i < 60 * 12; i++) { now += 16.7; const s = g.push(16.7, 22, now, 0, 2, true); if (s.action !== 'none') acts.push(s.action); }
  assert.ok(acts.includes('down'), 'heavy CPU steps a tier down');
  const g2 = lightGovernor({ bucketMs: 1000 });
  now = 0;
  let plain = false;
  for (let i = 0; i < 60 * 10; i++) { now += 16.7; if (g2.push(16.7, 22, now, 2, 2, false).action === 'plain') plain = true; }
  assert.ok(plain);
});
