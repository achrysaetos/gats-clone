import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { ZOM } from '../src/shared/defs.ts';
import { addPlayer, setInput, step } from '../src/shared/sim.ts';
import { build } from '../src/shared/sim/run.ts';
import { snapshotFor, wallViews } from '../src/shared/sim/snapshot.ts';
import { choosePick } from '../src/shared/sim/stats.ts';
import { createWorld, rand } from '../src/shared/sim/world.ts';
import { botThink, newBotMemory, randomLoadout, type BotMemory } from '../src/server/bots.ts';
import { TICK_MS } from './helpers.ts';

/** Plays a bot squad through the first day, a ring of walls and the first nights, hashing every snapshot. */
function replay(seed: number): { hash: string; nights: number; walls: number } {
  const w = createWorld('ZOM', seed, 'outpost');
  const r = () => rand(w);
  const bots = new Map<number, BotMemory>();
  for (let i = 0; i < ZOM.squadSize; i++) bots.set(addPlayer(w, `bot${i}`, randomLoadout(r)).id, newBotMemory(r));
  const builder = [...bots.keys()][0]!;
  const hash = createHash('sha256');
  for (let tick = 0; tick < 6000 && w.run!.phase.k !== 'over'; tick++) {
    const walls = wallViews(w);
    for (const [id, mem] of bots) {
      const d = botThink(snapshotFor(w, id), walls, mem, r);
      bots.set(id, d.mem);
      setInput(w, id, w.tick, d.input);
      if (d.pick) choosePick(w, id, d.pick.level, d.pick.option);
    }
    const me = w.players.get(builder)!;
    if (tick % 15 === 0) build(w, builder, Math.floor(me.x / ZOM.cell) + 2, Math.floor(me.y / ZOM.cell) + (tick % 4) - 2);
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
