import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tierGovernor } from '../src/client/fxparams.ts';
import {
  addLight, addShockwave, ambientFor, blastLights, blocksLight, KEEP_MS, lightLevel, liveShocks, maskTriangles, muzzleLight, occludersOf, parseColor,
  pushOut, resetLighting, resolveLights, selectLights, setLight, setLightClock, setLightCollecting, setLightingEnabled, TIERS, type Occluder, type ResolvedLight,
} from '../src/client/lighting.ts';

const light = (over: Partial<ResolvedLight> = {}): ResolvedLight => ({ x: 0, y: 0, radius: 100, rgb: [1, 1, 1], level: 1, cone: null, size: 5, inside: 10, shadows: true, beam: 0, ...over });
const view = { x0: 0, y0: 0, x1: 1000, y1: 600 };

test('lights are collected for the plain canvas too, but shock rings need the shader pass', () => {
  setLightingEnabled(false);
  resetLighting();
  setLightClock(1000);
  addLight({ x: 1, y: 1, radius: 100, color: '#fff' });
  setLight('k', { x: 1, y: 1, radius: 100, color: '#fff' });
  addShockwave({ x: 1, y: 1, radius: 100 });
  assert.equal(resolveLights(1010).length, 2, 'the plain path paints the same lights');
  assert.deepEqual(liveShocks(1010), []);
  setLightCollecting(false);
  resetLighting();
  addLight({ x: 1, y: 1, radius: 100, color: '#fff' });
  assert.deepEqual(resolveLights(1010), [], 'collecting can be switched off');
  setLightCollecting(true);
});

test('a transient light fades and then is dropped; a keyed one lives only while refreshed', () => {
  setLightingEnabled(true);
  resetLighting();
  setLightClock(1000);
  addLight({ x: 5, y: 5, radius: 100, color: '#ffc46b', life: 100 });
  setLight('lamp', { x: 9, y: 9, radius: 160, color: [1, 0.8, 0.5] });
  const early = resolveLights(1030), mid = resolveLights(1070);
  assert.equal(early.length, 2);
  assert.ok(mid.find((l) => l.x === 5)!.level < early.find((l) => l.x === 5)!.level, 'ease-out decay');
  assert.equal(resolveLights(1101).filter((l) => l.x === 5).length, 0, 'transient light expired');
  assert.equal(resolveLights(1000 + KEEP_MS - 1).filter((l) => l.x === 9).length, 1);
  assert.equal(resolveLights(1000 + KEEP_MS + 5).length, 0, 'an unrefreshed lamp goes out');
  setLightClock(2000);
  setLight('lamp', { x: 9, y: 9, radius: 160, color: '#fff' });
  setLightClock(2200);
  setLight('lamp', { x: 40, y: 9, radius: 160, color: '#fff' });
  const [lamp] = resolveLights(2250);
  assert.equal(resolveLights(2250).length, 1);
  assert.equal(lamp!.x, 40, 'setting a key again moves it instead of adding a second light');
  resetLighting();
  setLightingEnabled(false);
});

test('the transient pool is capped', () => {
  setLightingEnabled(true);
  resetLighting();
  setLightClock(0);
  for (let i = 0; i < 500; i++) addLight({ x: i, y: 0, radius: 50, color: '#fff', life: 1e6 });
  assert.ok(resolveLights(1).length <= 64);
  resetLighting();
  setLightingEnabled(false);
});

test('light level: quick attack, ease-out decay, flicker only dims', () => {
  assert.equal(lightLevel(-5, 100, 0, 1), 0);
  assert.equal(lightLevel(100, 100, 0, 1), 0);
  assert.ok(lightLevel(5, 100, 0, 1) < lightLevel(12, 100, 0, 1), 'rises through the attack');
  assert.ok(lightLevel(10, 100, 0, 1) > lightLevel(60, 100, 0, 1));
  assert.equal(lightLevel(1e6, Infinity, 0, 3), 1, 'a persistent light holds');
  for (let t = 0; t < 5000; t += 37) {
    const v = lightLevel(t, Infinity, 0.5, 4.2);
    assert.ok(v <= 1 && v >= 0.5 - 1e-9, `flicker stays within its depth (${v})`);
  }
});

test('colours parse from hex and pass channels through', () => {
  assert.deepEqual(parseColor('#ff8000'), [1, 128 / 255, 0]);
  assert.deepEqual(parseColor('#fff'), [1, 1, 1]);
  assert.deepEqual(parseColor([0.1, 0.2, 0.3]), [0.1, 0.2, 0.3]);
  assert.deepEqual(parseColor('nonsense'), parseColor('#ffb347'), 'unknown falls back to lamp amber');
});

test('selection culls to the view, keeps the strongest, and spends shadows on the best few', () => {
  const lights = [
    light({ x: 500, y: 300, radius: 200, level: 1 }),
    light({ x: 480, y: 300, radius: 60, level: 0.4 }),
    light({ x: 5000, y: 300, radius: 100 }),
    light({ x: -150, y: 300, radius: 100 }),
    light({ x: 100, y: 100, radius: 140, level: 0.9 }),
  ];
  const picked = selectLights(lights, view, 3, 1);
  assert.equal(picked.length, 3);
  assert.ok(!picked.some((l) => l.x === 5000 || l.x === -150), 'off-screen lights are culled, even one whose reach is just outside');
  assert.equal(picked[0]!.radius, 200, 'strongest first');
  assert.deepEqual(picked.map((l) => l.shadows), [true, false, false]);
  assert.ok(selectLights(lights, view, 10, 10).some((l) => l.x === -150) === false);
  assert.equal(selectLights([light({ x: -90, radius: 100 })], view, 5, 5).length, 1, 'a light whose reach crosses the edge still counts');
});

test('tiers get cheaper, and the governor steps down only on slow frames and never back up', () => {
  for (let i = 1; i < TIERS.length; i++) {
    assert.ok(TIERS[i]!.lights <= TIERS[i - 1]!.lights && TIERS[i]!.shadowLights <= TIERS[i - 1]!.shadowLights && TIERS[i]!.steps <= TIERS[i - 1]!.steps);
  }
  const gov = tierGovernor(21, 10);
  let tier = 0;
  for (let i = 0; i < 40; i++) tier = gov(16.7, tier, 2);
  assert.equal(tier, 0, 'at 60 fps nothing changes');
  for (let i = 0; i < 10; i++) tier = gov(40, tier, 2);
  assert.equal(tier, 1);
  for (let i = 0; i < 10; i++) tier = gov(40, tier, 2);
  assert.equal(tier, 2);
  let last = 2;
  for (let i = 0; i < 10; i++) last = gov(40, last, 2);
  assert.equal(last, -1, 'out of tiers: give the lights up');
  for (let i = 0; i < 10; i++) tier = gov(8, tier, 2);
  assert.equal(tier, 2, 'it does not creep back up');
});

const solid = (kind: string, x: number, y: number, w: number, h: number) => ({ kind, x, y, w, h }) as never;
const face = (kind: string) => (kind === 'curb' || kind === 'pad' ? 0 : 14);

test('only solids that stand and are in view become occluders', () => {
  const solids = [solid('concrete', 100, 100, 50, 50), solid('curb', 0, 0, 1000, 20), solid('pad', 300, 300, 40, 40), solid('crate', 2000, 100, 40, 40), solid('sandstone', 900, 560, 80, 20)];
  assert.deepEqual(blocksLight({ kind: 'concrete' }), true);
  assert.deepEqual(blocksLight({ kind: 'core' }), false);
  const o = occludersOf(solids, view, face);
  assert.deepEqual(o.map((r) => r.x), [100, 900]);
  assert.equal(o[0]!.face, 14);
  assert.equal(occludersOf([solid('concrete', 100, 640, 50, 50)], view, face).length, 0, 'below the view');
  assert.equal(occludersOf([solid('concrete', 100, 590, 50, 50)], view, face).length, 1);
  assert.equal(occludersOf([solid('brick', 100, -80, 50, 50)], view, face).length, 0, 'wholly above, even with its front face');
  assert.equal(occludersOf([solid('brick', 100, -80, 50, 70)], view, face).length, 1);
});

test('a light inside a wall is moved just outside it, by the nearest edge', () => {
  const r: Occluder[] = [{ x: 100, y: 100, w: 200, h: 40, face: 14 }];
  assert.deepEqual(pushOut(50, 50, r), { x: 50, y: 50 }, 'open floor is untouched');
  assert.deepEqual(pushOut(110, 120, r), { x: 97, y: 120 }, 'near the left edge');
  assert.deepEqual(pushOut(200, 105, r), { x: 200, y: 97 }, 'near the top edge');
  assert.deepEqual(pushOut(200, 135, r), { x: 200, y: 143 }, 'near the bottom edge');
  assert.deepEqual(pushOut(290, 120, r), { x: 303, y: 120 }, 'near the right edge');
});

test('shadow mask geometry: front faces first, then footprints, in clip space with y up', () => {
  const rects: Occluder[] = [{ x: 0, y: 0, w: 500, h: 300, face: 0 }, { x: 500, y: 300, w: 250, h: 150, face: 30 }];
  const tri = maskTriangles(rects, view);
  assert.equal(tri.length, (1 + 2) * 6 * 3, 'one face quad plus two footprints');
  const flags = [...Array(tri.length / 3).keys()].map((i) => tri[i * 3 + 2]!);
  assert.deepEqual(flags.slice(0, 6), [1, 1, 1, 1, 1, 1], 'the face comes first');
  assert.deepEqual(flags.slice(6), Array(12).fill(0));
  // The face of rect 2 spans x 500..750 and y 450..480 in the 1000x600 view: clip x 0..0.5, y -0.5..-0.6.
  const xs = [0, 1, 2, 3, 4, 5].map((i) => tri[i * 3]!), ys = [0, 1, 2, 3, 4, 5].map((i) => tri[i * 3 + 1]!);
  assert.ok(Math.abs(Math.min(...xs) - 0) < 1e-6 && Math.abs(Math.max(...xs) - 0.5) < 1e-6);
  assert.ok(Math.abs(Math.max(...ys) - 0.5) < 1e-6 === false);
  assert.ok(Math.abs(Math.max(...ys) - -0.5) < 1e-6 && Math.abs(Math.min(...ys) - -0.6) < 1e-6);
  // The first footprint is the top-left half of the view's width, so it covers clip x -1..0 and y 1..0.
  const fx = [6, 7, 8, 9, 10, 11].map((i) => tri[i * 3]!), fy = [6, 7, 8, 9, 10, 11].map((i) => tri[i * 3 + 1]!);
  assert.ok(Math.abs(Math.min(...fx) + 1) < 1e-6 && Math.abs(Math.max(...fx)) < 1e-6);
  assert.ok(Math.abs(Math.max(...fy) - 1) < 1e-6 && Math.abs(Math.min(...fy)) < 1e-6);
  assert.equal(maskTriangles([], view).length, 0);
});

test('ambient: day is neutral and bright, night is dark steel blue, and it eases between', () => {
  const day = ambientFor(0), night = ambientFor(1), dusk = ambientFor(0.5);
  assert.deepEqual(day.rgb, [1, 1, 1]);
  assert.ok(night.rgb[2] > night.rgb[0] && night.rgb[2] < 0.7 && night.rgb[0] < 0.35, 'cool and dark, never black');
  assert.ok(night.rgb.every((c) => c > 0.1), 'never black');
  assert.ok(dusk.rgb[0] < day.rgb[0] && dusk.rgb[0] > night.rgb[0]);
  assert.ok(night.gain > day.gain, 'lights matter more at night');
  assert.equal(day.shafts, 0, 'no shafts in daylight');
  assert.ok(night.shafts > 0);
  assert.ok(night.ao > day.ao && day.ao > 0, 'a hint of contact darkening by day');
  assert.deepEqual(ambientFor(-3).rgb, day.rgb);
  assert.deepEqual(ambientFor(9).rgb, night.rgb);
  assert.ok(ambientFor(0, true).rgb[0] < 1, 'storm drains a touch');
});

test('muzzle and blast lights scale with the weapon and the blast', () => {
  const pistol = muzzleLight({ x: 10, y: 10 }, 0, 'pistol'), sniper = muzzleLight({ x: 10, y: 10 }, 0, 'sniper'), quiet = muzzleLight({ x: 10, y: 10 }, 0, 'sniper', true);
  assert.ok(sniper.radius > pistol.radius && sniper.life! > pistol.life!);
  assert.ok(quiet.intensity! < sniper.intensity! && quiet.radius < sniper.radius);
  assert.ok(pistol.x > 10, 'pushed a little along the line of fire');
  const [flash, glow] = blastLights(0, 0, 100, false), [pf] = blastLights(0, 0, 40, true);
  assert.ok(flash!.life! < glow!.life!, 'a flash, then the glow');
  assert.ok(glow!.radius > 200 && pf!.radius < flash!.radius);
});

test('shock rings run their life and are dropped', () => {
  setLightingEnabled(true);
  resetLighting();
  setLightClock(100);
  addShockwave({ x: 0, y: 0, radius: 200, life: 500 });
  assert.equal(liveShocks(100)[0]!.k, 0);
  assert.ok(Math.abs(liveShocks(350)[0]!.k - 0.5) < 1e-9);
  assert.equal(liveShocks(600).length, 0);
  for (let i = 0; i < 10; i++) addShockwave({ x: i, y: 0, radius: 50 });
  assert.ok(liveShocks(100).length <= 4, 'capped');
  resetLighting();
  setLightingEnabled(false);
});
