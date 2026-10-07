import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { BUILDING_KINDS, ZOM } from '../src/shared/defs.ts';
import { addPlayer, step } from '../src/shared/sim.ts';
import { build, upgrade } from '../src/shared/sim/run.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { createWorld, rand } from '../src/shared/sim/world.ts';
import { newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';
import { thinkBots } from '../src/server/bot/tick.ts';
import { TICK_MS } from './helpers.ts';

/** Plays a bot squad through the first day, walls and turrets and the first nights, hashing every snapshot. */
function replay(seed: number): { hash: string; nights: number; walls: number } {
  const w = createWorld('ZOM', seed, 'outpost');
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  for (let i = 0; i < ZOM.squadSize; i++) bots.set(addPlayer(w, `bot${i}`, randomLoadout(r)).id, newBotMemory(r));
  const builder = [...bots.keys()][0]!;
  const hash = createHash('sha256');
  for (let tick = 0; tick < 6000 && w.run!.phase.k !== 'over'; tick++) {
    thinkBots(w, bots, r, { respawn: false });
    const me = w.players.get(builder)!;
    // Every kind and wall tier goes up, and anything standing is upgraded, so tiers, levels, strips, depots, posts and coils are all in the hash.
    if (tick % 15 === 0) {
      const n = tick / 15, cx = Math.floor(me.x / ZOM.cell) + 2, cy = Math.floor(me.y / ZOM.cell) + (tick % 4) - 2;
      build(w, builder, BUILDING_KINDS[n % BUILDING_KINDS.length]!, cx, cy, 1 + (n % 3));
      if (n % 3 === 2) upgrade(w, builder, cx, cy);
    }
    step(w, TICK_MS);
    for (const id of bots.keys()) hash.update(JSON.stringify(snapshotFor(w, id)));
  }
  return { hash: hash.digest('hex'), nights: w.run!.night, walls: w.buildings.length + w.floor.length };
}

test('a zombies run replays exactly from its seed', () => {
  const a = replay(11), b = replay(11), c = replay(12);
  assert.ok(a.nights >= 2, `reached night ${a.nights}`);
  assert.ok(a.walls >= 6, `${a.walls} buildings stood at the end`);
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
});
