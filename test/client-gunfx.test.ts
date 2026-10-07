/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { casingAt, casingHeight, CASING, coverAt, createGunFx, hitCover, hitFlesh, impact, liveCasings, liveHoles, liveMarks, HOLE, noteMap, liveParticles, muzzleFlash, outward } from '../src/client/gunfx.ts';

const none = { walls: [], crates: [] };
const caps = { flashes: 4, particles: 30, casings: 5, marks: 6, holes: 7 };

test('every pool stays within its cap however long the fight runs', () => {
  const fx = createGunFx(caps);
  for (let i = 0; i < 500; i++) {
    muzzleFlash(fx, { x: 0, y: 0 }, i, 'lmg', i);
    impact(fx, i % 3 === 0 ? 'player' : i % 3 === 1 ? 'zombie' : 'wall', { x: 5, y: 5 }, none, i);
  }
  assert.equal(fx.flashes.length, 4);
  assert.equal(fx.particles.length, 30);
  assert.equal(fx.casings.length, 5);
  assert.equal(fx.marks.length, 6);
  assert.equal(fx.holes.length, 7);
  assert.ok(liveParticles(fx, 499) <= 30 && liveCasings(fx, 499) <= 5 && liveMarks(fx, 499) <= 6);
});

test('a cover hit leaves a hole only when it lands on cover, and the hole fades', () => {
  const wall = { x: 100, y: 100, w: 40, h: 40 };
  const fx = createGunFx(caps);
  hitCover(fx, wall, 100, 120, 0);
  assert.equal(liveHoles(fx, 1000), 1);
  assert.equal(liveHoles(fx, 120_000), 1, 'holes last for minutes');
  assert.equal(liveHoles(fx, HOLE.lifeMs + 1), 0);
  noteMap(fx, 'a');
  assert.equal(liveHoles(fx, 2000), 0, 'a new map wipes them');
  const bare = createGunFx(caps);
  hitCover(bare, null, 5, 5, 0);
  assert.equal(liveHoles(bare, 1), 0);
});

test('sparks fly out of the struck face', () => {
  const wall = { x: 100, y: 100, w: 40, h: 40 };
  assert.equal(outward(wall, 100, 120), Math.PI);
  assert.equal(outward(wall, 140, 120), 0);
  assert.equal(outward(wall, 120, 100), -Math.PI / 2);
  assert.equal(outward(wall, 120, 140), Math.PI / 2);
  const fx = createGunFx(caps);
  hitCover(fx, wall, 100, 120, 0, () => 0.5);
  assert.ok(fx.particles.filter((p) => p.shape === 'spark').every((p) => p.vx < 0));
  assert.equal(coverAt({ walls: [{ ...wall, built: false } as never], crates: [] }, 99, 120)?.x, 100);
  assert.equal(coverAt(none, 99, 120), null);
});

test('flesh and ichor differ in colour and a hit marks the floor briefly', () => {
  const a = createGunFx(caps), b = createGunFx(caps);
  hitFlesh(a, 0, 0, 0, false);
  hitFlesh(b, 0, 0, 0, true);
  const reds = new Set(a.particles.filter((p) => p.born === 0).map((p) => p.color));
  const greens = new Set(b.particles.filter((p) => p.born === 0).map((p) => p.color));
  assert.ok([...reds].every((c) => c >= 6 && c <= 8));
  assert.ok([...greens].every((c) => c >= 9 && c <= 11));
  assert.equal(liveMarks(a, 100), 1);
  assert.equal(liveMarks(a, 4000), 0);
});

test('a casing arcs, bounces lower each time, lands and lies still before it fades', () => {
  const peak = (vz: number) => Math.max(...Array.from({ length: 200 }, (_, i) => casingHeight(vz, i / 200)));
  assert.ok(peak(200) > 0);
  assert.equal(casingHeight(200, 3), 0);
  const fx = createGunFx(caps);
  muzzleFlash(fx, { x: 50, y: 50 }, 0, 'pistol', 0, () => 0.5);
  const c = fx.casings[0]!;
  const late = casingAt(c, 2000), later = casingAt(c, 3500);
  assert.equal(late.z, 0);
  assert.ok(Math.hypot(later.x - late.x, later.y - late.y) < 2);
  assert.equal(casingAt(c, 1000).alpha, 1);
  assert.ok(casingAt(c, CASING.lifeMs - 100).alpha < 0.2);
});

test('shotgun and sniper eject their casing after the bolt works, the others at once', () => {
  const fx = createGunFx(caps);
  muzzleFlash(fx, { x: 0, y: 0 }, 0, 'shotgun', 100);
  muzzleFlash(fx, { x: 0, y: 0 }, 0, 'smg', 100);
  assert.ok(fx.casings[0]!.born > 100);
  assert.equal(fx.casings[1]!.born, 100);
});
