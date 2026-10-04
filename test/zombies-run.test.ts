import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS, LEVELS, ZOM } from '../src/shared/defs.ts';
import { MAPS } from '../src/shared/maps.ts';
import { createWorld, newId, type World } from '../src/shared/sim/world.ts';
import { run, spawnAt, TICK_MS } from './helpers.ts';
import { step } from '../src/shared/sim.ts';

const zomWorld = (): World => createWorld('ZOM', 1, 'outpost');
const phaseOf = (w: World) => w.run!.phase.k;

function runUntil(w: World, done: () => boolean, maxMs: number) {
  for (let t = 0; t < maxMs && !done(); t += TICK_MS) step(w, TICK_MS);
  assert.ok(done(), `condition not met within ${maxMs}ms`);
}

test('a run opens on a day with the starting scrap and a whole core, and night falls when the day runs out', () => {
  const w = zomWorld();
  assert.deepEqual({ phase: phaseOf(w), night: w.run!.night, scrap: w.run!.scrap, core: w.run!.core.hp }, { phase: 'day', night: 1, scrap: ZOM.startScrap, core: ZOM.coreHp });
  run(w, ZOM.dayMs - 500);
  assert.equal(phaseOf(w), 'day');
  run(w, 1000);
  assert.equal(phaseOf(w), 'night');
});

test('the night trickles its wave in from the horde edges and stays dark until the whole wave is spawned and dead', () => {
  const w = zomWorld();
  w.run!.core.hp = 1e9;
  for (let i = 0; i < 4; i++) spawnAt(w, 1380, 1450 + i * 30, { kind: i === 0 ? 'human' : 'bot' });
  run(w, ZOM.dayMs + TICK_MS);
  const night = w.run!.phase;
  assert.ok(night.k === 'night');
  const wave = night.toSpawn.length + w.zombies.length;
  assert.equal(wave, ZOM.waveSize(1, { humans: 1, bots: 3 }));
  const horde = MAPS.outpost.siege!.horde;
  const seen = new Set<number>();
  for (let t = 0; t < 1000; t += TICK_MS) {
    for (const z of w.zombies.filter((z) => !seen.has(z.id))) {
      seen.add(z.id);
      assert.ok(horde.some((r) => z.x >= r.x && z.x <= r.x + r.w && z.y >= r.y && z.y <= r.y + r.h), `zombie at ${z.x},${z.y} came from no edge`);
    }
    step(w, TICK_MS);
  }
  assert.ok(w.zombies.length > 1 && w.zombies.length < wave, `${w.zombies.length} of ${wave} spawned after a second`);

  w.zombies = [];
  run(w, TICK_MS * 2);
  assert.equal(phaseOf(w), 'night', 'killing what has spawned does not end the night while more are to come');

  runUntil(w, () => w.run!.phase.k === 'night' && w.run!.phase.toSpawn.length === 0, 120_000);
  assert.ok(w.zombies.length > 0);
  run(w, 1000);
  assert.equal(phaseOf(w), 'night', 'a fully spawned wave still alive holds the night');

  w.zombies = [];
  run(w, TICK_MS);
  assert.deepEqual({ phase: phaseOf(w), night: w.run!.night }, { phase: 'day', night: 2 });
});

test('the core falling ends the run with the night reached, and the restart wipes the run and everyone\'s progress', () => {
  const w = zomWorld();
  const p = spawnAt(w, 1300, 1500, { kind: 'human' });
  run(w, ZOM.dayMs + 2000);
  p.score = LEVELS[3].score;
  p.level = 3;
  p.kills = 7;
  w.run!.scrap = 3;
  w.buildings.push({ id: newId(w), kind: 'wall', cx: 25, cy: 25, hp: BUILDINGS.wall.hp });
  w.run!.core.hp = 0;
  run(w, TICK_MS);
  const over = w.run!.phase;
  assert.ok(over.k === 'over');
  assert.equal(over.night, 1);
  assert.equal(w.zombies.length, 0, 'the horde leaves the field once the core falls');

  run(w, ZOM.restartMs - 1000);
  assert.equal(phaseOf(w), 'over');
  run(w, 1000 + TICK_MS);
  assert.deepEqual(
    { phase: phaseOf(w), night: w.run!.night, scrap: w.run!.scrap, core: w.run!.core.hp, buildings: w.buildings.length, score: p.score, level: p.level, kills: p.kills, alive: p.life.k },
    { phase: 'day', night: 1, scrap: ZOM.startScrap, core: ZOM.coreHp, buildings: 0, score: 0, level: 0, kills: 0, alive: 'alive' },
  );
});
