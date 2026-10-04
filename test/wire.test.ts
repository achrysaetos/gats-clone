/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Snapshot, SnapshotWire } from '../src/shared/protocol.ts';
import { step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { createWorld } from '../src/shared/sim/world.ts';
import { fillSnapshot, makeSnapshotEncoder } from '../src/shared/wire.ts';
import { press, spawnAt, TICK_MS } from './helpers.ts';

const fullForm = (snap: Snapshot): Snapshot => JSON.parse(makeSnapshotEncoder()(snap));

test('omitting unchanged crates, leaderboard, zones and match reconstructs the same state as full snapshots', () => {
  for (const mode of ['FFA', 'DOM'] as const) {
    const w = createWorld(mode, 3);
    const p = spawnAt(w, 1500, 1500, { name: 'Mover' });
    spawnAt(w, 1400, 1400, { name: 'Other', team: mode === 'DOM' ? 'blue' : null });
    const encode = makeSnapshotEncoder();
    let last: Snapshot | null = null;
    const sent = { crates: 0, leaderboard: 0, zones: 0, match: 0 };
    for (let tick = 0; tick < 90; tick++) {
      press(w, p, { right: tick % 40 < 20, up: tick % 40 >= 20, angle: tick / 7 });
      if (tick === 30) w.crates[0]!.hp -= 5;
      if (tick === 50) p.score += 10;
      step(w, TICK_MS);
      const snap = snapshotFor(w, p.id);
      const wire = JSON.parse(encode(snap)) as SnapshotWire;
      for (const k of Object.keys(sent) as (keyof typeof sent)[]) if (wire[k] !== undefined) sent[k]++;
      const filled = fillSnapshot(wire, last);
      assert.deepEqual(filled, fullForm(snap), `${mode} tick ${tick}`);
      last = filled;
    }
    assert.ok(sent.crates >= 2 && sent.crates < 30, `${mode} crates sent ${sent.crates}/90`);
    assert.ok(sent.leaderboard >= 2 && sent.leaderboard < 10, `${mode} leaderboard sent ${sent.leaderboard}/90`);
    assert.ok(sent.match < 10, `${mode} match sent ${sent.match}/90`);
  }
});

test('the wire keeps positions to 0.1 units and angles to 0.01 radians, and integers exact', () => {
  const w = createWorld('FFA', 3);
  const p = spawnAt(w, 1500.123456, 1500.987654);
  p.angle = 1.23456789;
  const snap = snapshotFor(w, p.id);
  const sent = fullForm(snap).players.find((v) => v.id === p.id)!;
  const real = snap.players.find((v) => v.id === p.id)!;
  assert.ok(Math.abs(sent.x - real.x) <= 0.05 && Math.abs(sent.y - real.y) <= 0.05, `${sent.x},${sent.y}`);
  assert.ok(Math.abs(sent.angle - real.angle) <= 0.005, `${sent.angle}`);
  assert.equal(sent.id, real.id);
  assert.equal(sent.hp, real.hp);
  assert.equal(fullForm(snap).tick, snap.tick);
  assert.ok(String(sent.x).length <= 6, 'no long float tails');
});

test('a client that never received a sticky field cannot rebuild the snapshot', () => {
  const w = createWorld('FFA', 3);
  const p = spawnAt(w, 1500, 1500);
  const { crates: _, ...wire } = snapshotFor(w, p.id);
  assert.equal(fillSnapshot(wire, null), null);
});
