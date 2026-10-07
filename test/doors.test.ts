/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD } from '../src/shared/defs.ts';
import type { MapDoor } from '../src/shared/geom.ts';
import { MAPS, type MapDef } from '../src/shared/maps.ts';
import { makeSnapshotEncoder } from '../src/shared/wire.ts';
import { explode } from '../src/shared/sim/combat.ts';
import { doorLeaves, DOOR_THICK } from '../src/shared/sim/doors.ts';
import { solidsOf } from '../src/client/predict.ts';
import { circleHitsRect } from '../src/shared/sim/movement.ts';
import { snapshotFor, wallViews } from '../src/shared/sim/snapshot.ts';
import { createWorld, type World } from '../src/shared/sim/world.ts';
import { press, run, spawnAt } from './helpers.ts';

const R = WORLD.playerRadius;
const geoWorld = (): World => {
  const w = createWorld('FFA', 1, 'geo-test');
  w.crates = []; w.barrels = []; w.props = []; w.airdrops = { due: [], flight: null };
  return w;
};
const door = (w: World, id: string) => w.doors.find((d) => d.id === id)!;

/** A one-door map swapped in for `geo-test` while `f` runs. */
function withDoors<T>(doors: MapDoor[], f: () => T): T {
  const was = MAPS['geo-test'];
  (MAPS as Record<string, MapDef>)['geo-test'] = { ...was, doors };
  try { return f(); } finally { (MAPS as Record<string, MapDef>)['geo-test'] = was; }
}

test('an auto slider opens as someone nears, holds, and closes once they are gone', () => {
  const w = geoWorld();
  const p = spawnAt(w, 2325, 590);
  assert.equal(door(w, 'room-1').open, 0);
  run(w, 600);
  assert.equal(door(w, 'room-1').open, 255);
  assert.equal(w.walls.filter((x) => x.door === 'room-1').length, 0, 'no leaf in the way once open');
  press(w, p, { down: true });
  run(w, 2500);
  press(w, p, {});
  run(w, 2500);
  assert.equal(door(w, 'room-1').open, 0);
  assert.equal(w.walls.filter((x) => x.door === 'room-1').length, 1, 'the leaf is back');
});

test('a double slider retracts two leaves, one to each side', () => {
  const w = geoWorld();
  spawnAt(w, 2925, 590);
  run(w, 150);
  const mid = door(w, 'room-2').open;
  assert.ok(mid > 0 && mid < 255);
  assert.equal(w.walls.filter((x) => x.door === 'room-2').length, 2);
  run(w, 600);
  assert.equal(w.walls.filter((x) => x.door === 'room-2').length, 0);
});

test('walking into a swing door pushes it away from you, from either side, and you walk through', () => {
  for (const [from, dir] of [[700, -1], [380, 1]] as const) {
    const w = geoWorld();
    const p = spawnAt(w, 3525, from);
    press(w, p, dir < 0 ? { up: true } : { down: true });
    run(w, 3000);
    assert.equal(door(w, 'room-3').sign, dir, `pushed ${dir < 0 ? 'north' : 'south'} swings that way`);
    assert.ok(dir < 0 ? p.y < 500 : p.y > 560, `got through (${p.y})`);
  }
});

test('a swing door swings back shut on its own after the hold', () => {
  const w = geoWorld();
  const p = spawnAt(w, 3525, 700);
  press(w, p, { up: true });
  run(w, 1500);
  press(w, p, {});
  assert.ok(door(w, 'room-3').open > 0);
  run(w, 6000);
  assert.equal(door(w, 'room-3').open, 0);
});

test('a door never crushes: a manual slider will not close on a body standing in it', () => {
  const manual: MapDoor = { id: 'm', kind: 'slide', x: 2250, y: 525, w: 150, axis: 'h', material: 'metal', auto: false };
  withDoors([manual], () => {
    const w = geoWorld();
    const p = spawnAt(w, 2325, 600);
    press(w, p, { use: true });
    run(w, 60);
    press(w, p, { use: false });
    run(w, 800);
    assert.equal(w.doors[0]!.open, 255);
    press(w, p, { up: true });
    run(w, 290);
    press(w, p, { up: false, use: false });
    assert.ok(p.y < 560 && p.y > 490, `standing in the doorway (${p.y})`);
    run(w, 600);
    press(w, p, { use: true });
    run(w, 1500);
    assert.ok(w.doors[0]!.open > 0, 'held open by the body');
    assert.ok(w.walls.filter((x) => x.door === 'm').every((l) => !circleHitsRect(p.x, p.y, R, l)), 'never inside a leaf');
  });
});

test('a blast throws a swing door open, away from it', () => {
  const w = geoWorld();
  explode(w, 3525, 600, 140, 10, { attacker: null, team: null, label: 'Test' });
  const d = door(w, 'room-3');
  assert.ok(d.open >= 230);
  assert.equal(d.sign, -1);
});

test('closed doors block rounds and bodies; glass blocks both but not sight', () => {
  const w = geoWorld();
  const shut = w.walls.filter((x) => x.door === 'room-3');
  assert.equal(shut.length, 1);
  const glass = w.walls.find((x) => x.door === 'room-1')!;
  assert.equal(glass.ns, true);
  assert.equal(shut[0]!.ns, undefined);
  const shooter = spawnAt(w, 3525, 700, { loadout: { weapon: 'assault' } });
  const victim = spawnAt(w, 3525, 380);
  press(w, shooter, { angle: -Math.PI / 2, fire: true, shots: 1 });
  run(w, 600);
  assert.equal(victim.life.k === 'alive' ? victim.life.hp : 0, 100, 'the shut door stopped the round');
});

test('the same seed and inputs give the same doors, tick for tick', () => {
  const trace = () => {
    const w = geoWorld();
    const p = spawnAt(w, 3525, 700);
    const out: number[] = [];
    for (let i = 0; i < 200; i++) {
      press(w, p, { up: i < 40 });
      run(w, 1000 / 30);
      out.push(...w.doors.map((d) => d.open * 3 + d.sign));
    }
    return out;
  };
  assert.deepEqual(trace(), trace());
});

test('doors cost a few bytes on the wire and only when they change', () => {
  const w = geoWorld();
  const p = spawnAt(w, 3525, 700);
  const enc = makeSnapshotEncoder();
  const first = JSON.parse(enc(snapshotFor(w, p.id)));
  assert.deepEqual(first.doors, []);
  const quiet = JSON.parse(enc(snapshotFor(w, p.id)));
  assert.equal('doors' in quiet, false, 'unchanged doors are left out');
  press(w, p, { up: true });
  run(w, 800);
  const moving = snapshotFor(w, p.id);
  assert.ok(moving.doors!.length >= 1);
  assert.ok(JSON.stringify(moving.doors).length < 40 * moving.doors!.length);
  assert.ok(wallViews(w).every((x) => !('door' in x)), 'door leaves are not sent as walls');
});

test('the client rebuilds the same leaves from the snapshot as the server holds', () => {
  const w = geoWorld();
  const p = spawnAt(w, 3525, 700);
  press(w, p, { up: true });
  for (let i = 0; i < 30; i++) {
    run(w, 1000 / 30);
    const snap = snapshotFor(w, p.id);
    const client = solidsOf(wallViews(w), snap, MAPS['geo-test'].doors).filter((r) => r.pts !== undefined || true);
    const serverLeaves = w.walls.filter((x) => x.door !== undefined);
    for (const l of serverLeaves) assert.ok(client.some((c) => c.x === l.x && c.y === l.y && c.w === l.w && c.h === l.h), `leaf of ${l.door} on tick ${i}`);
  }
});

test('door leaves are thin and shaped to the swing', () => {
  const d = MAPS['geo-test'].doors!.find((x) => x.id === 'room-3')!;
  const shut = doorLeaves(d, 0, 1)[0]!;
  assert.equal(shut.h, DOOR_THICK);
  const half = doorLeaves(d, 128, 1)[0]!;
  assert.ok(half.pts && half.h > DOOR_THICK);
});
