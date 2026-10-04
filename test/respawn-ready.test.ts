import assert from 'node:assert/strict';
import { test } from 'node:test';
import { respawn, step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { makeSnapshotEncoder } from '../src/shared/wire.ts';
import { emptyWorld, spawnAt, TICK_MS } from './helpers.ts';

test('the wire never reports a respawn as ready before the server accepts it', () => {
  const w = emptyWorld();
  const p = spawnAt(w, 500, 500);
  const encode = makeSnapshotEncoder();
  let checked = 0;
  for (let death = 0; death < 400; death++) {
    p.life = { k: 'dead', respawnAt: w.now + 3000 };
    while (p.life.k === 'dead') {
      step(w, TICK_MS);
      const wire = JSON.parse(encode(snapshotFor(w, p.id)));
      if (wire.self.respawnIn !== 0) continue;
      checked++;
      const until: number = p.life.k === 'dead' ? p.life.respawnAt : NaN;
      assert.ok(respawn(w, p.id, p.loadout), `ready on the wire at now=${w.now} but the server refuses until ${until}`);
    }
    for (let i = 0; i < death % 7; i++) step(w, TICK_MS);
  }
  assert.equal(checked, 400);
});
