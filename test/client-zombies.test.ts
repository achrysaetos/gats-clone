/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSiteOf } from '../src/client/zombies.ts';
import { BUILDINGS, ZOM } from '../src/shared/defs.ts';
import { buildRefusal } from '../src/shared/sim/build.ts';
import { build } from '../src/shared/sim/run.ts';
import { snapshotFor, wallViews } from '../src/shared/sim/snapshot.ts';
import { createWorld, newId, type World } from '../src/shared/sim/world.ts';
import { spawnAt } from './helpers.ts';

const AT = { x: 1380, y: 1525 };

function squadWorld() {
  const w = createWorld('ZOM', 1, 'outpost');
  const p = spawnAt(w, AT.x, AT.y);
  return { w, p };
}

const previewOf = (w: World, id: number, cx: number, cy: number) => {
  const p = w.players.get(id)!;
  const site = buildSiteOf(snapshotFor(w, id), wallViews(w), p);
  return site && buildRefusal(site, cx, cy);
};

test('the build preview judges every cell around the builder as the server does', () => {
  const { w, p } = squadWorld();
  w.zombies.push({ id: newId(w), kind: 'brute', x: AT.x + 120, y: AT.y - 60, hp: 1, attackAt: Infinity });
  spawnAt(w, AT.x - 100, AT.y + 100);
  w.buildings.push({ id: newId(w), kind: 'wall', cx: 28, cy: 27, hp: 1 });
  w.walls.push({ x: 1200, y: 1400, w: 24, h: 140, built: false, expiresAt: Infinity });
  const seen = new Set<string | null>();
  for (let cy = 24; cy <= 37; cy++) {
    for (let cx = 20; cx <= 33; cx++) {
      const server = build(structuredClone(w), p.id, cx, cy);
      seen.add(server);
      assert.equal(previewOf(w, p.id, cx, cy), server, `cell ${cx},${cy}`);
    }
  }
  assert.deepEqual([...seen].sort(), [null, 'body', 'core', 'cover', 'farFromCore', 'outOfReach', 'taken'].sort(), 'the sweep covered every refusal a cell can earn');
});

test('the build preview refuses at night, while down, and when the bank is short, as the server does', () => {
  const cases: [string, (w: World, id: number) => void][] = [
    ['notDay', (w) => { w.run!.phase = { k: 'night', toSpawn: [], nextSpawnAt: Infinity }; }],
    ['notDay', (w, id) => { w.players.get(id)!.life = { k: 'downed', bleedOutAt: Infinity, reviveProgress: 0 }; }],
    ['scrap', (w) => { w.run!.scrap = BUILDINGS.wall.cost - 1; }],
  ];
  for (const [reason, arrange] of cases) {
    const { w, p } = squadWorld();
    arrange(w, p.id);
    assert.equal(previewOf(w, p.id, 26, 30), reason);
    assert.equal(build(w, p.id, 26, 30), reason);
  }
});

test('the build preview reads the builder from where the client draws them', () => {
  const { w, p } = squadWorld();
  const snap = snapshotFor(w, p.id);
  const far = buildSiteOf(snap, wallViews(w), { x: AT.x - 7 * ZOM.cell, y: AT.y })!;
  assert.equal(buildRefusal(far, 26, 30), 'outOfReach', 'the drawn position decides reach, not the snapshot\'s');
  const near = buildSiteOf(snap, wallViews(w), { x: AT.x, y: AT.y - 3 * ZOM.cell })!;
  assert.equal(buildRefusal(near, 26, 30), null, 'the builder\'s own body moves with them');
});
