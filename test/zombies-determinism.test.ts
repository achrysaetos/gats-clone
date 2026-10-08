import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { ZOM } from '../src/shared/defs.ts';
import { addPlayer, step } from '../src/shared/sim.ts';
import { build } from '../src/shared/sim/run.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { createWorld, rand } from '../src/shared/sim/world.ts';
import { newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';
import { thinkBots } from '../src/server/bot/tick.ts';
import { TICK_MS } from './helpers.ts';

/** Plays a bot squad through the first day, walls and turrets and the first nights, hashing every snapshot. */
function replay(seed: number): { hash: string; nights: number; walls: number } {
  const w = createWorld('ZOM', seed, 'yard');
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  for (let i = 0; i < ZOM.squadSize; i++) bots.set(addPlayer(w, `bot${i}`, randomLoadout(r)).id, newBotMemory(r));
  const builder = [...bots.keys()][0]!;
  const hash = createHash('sha256');
  for (let tick = 0; tick < 6000 && w.run!.phase.k !== 'over'; tick++) {
    thinkBots(w, bots, r, { respawn: false });
    const me = w.players.get(builder)!;
    if (tick % 15 === 0) build(w, builder, (['wall', 'wall', 'sentry', 'cannon'] as const)[(tick / 15) % 4]!, Math.floor(me.x / ZOM.cell) + 2, Math.floor(me.y / ZOM.cell) + (tick % 4) - 2);
    step(w, TICK_MS);
    for (const id of bots.keys()) hash.update(JSON.stringify(snapshotFor(w, id)));
  }
  return { hash: hash.digest('hex'), nights: w.run!.night, walls: w.buildings.length };
}

test('a zombies run replays exactly from its seed', () => {
  const a = replay(11), b = replay(11), c = replay(12);
  assert.ok(a.nights >= 2, `reached night ${a.nights}`);
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
});
