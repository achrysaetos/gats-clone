import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS, ZOM } from '../src/shared/defs.ts';
import { setInput, step } from '../src/shared/sim.ts';
import { snapshotFor, wallViews } from '../src/shared/sim/snapshot.ts';
import { createWorld, newId, type Player, type World } from '../src/shared/sim/world.ts';
import { botThink, newBotMemory, type BotMemory } from '../src/server/bots.ts';
import { spawnAt, TICK_MS } from './helpers.ts';

const seeded = (seed: number) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };
const CORE = { x: 1500, y: 1500 };

function nightWorld(): World {
  const w = createWorld('ZOM', 1, 'outpost');
  w.run!.phase = { k: 'night', toSpawn: [], nextSpawnAt: Infinity };
  w.run!.core.hp = 1e9;
  return w;
}

/** Steps the world with `bots` thinking each tick, until `done` or `ms` runs out; returns whether `done` came true. */
function play(w: World, bots: Player[], ms: number, done: () => boolean, seed = 3): boolean {
  const rand = seeded(seed);
  const mems = new Map<number, BotMemory>(bots.map((b) => [b.id, newBotMemory(rand)]));
  for (let t = 0; t < ms; t += TICK_MS) {
    for (const b of bots) {
      const d = botThink(snapshotFor(w, b.id), wallViews(w), mems.get(b.id)!, rand);
      mems.set(b.id, d.mem);
      setInput(w, b.id, w.tick, d.input);
    }
    step(w, TICK_MS);
    if (done()) return true;
  }
  return false;
}

/** Keeps the night going without bothering anyone. */
const farZombie = (w: World) => w.zombies.push({ id: newId(w), kind: 'walker', x: 60, y: 60, hp: 1e9, attackAt: Infinity });

test('a squad bot walks over to a downed human and holds use until they are up', () => {
  const w = nightWorld();
  farZombie(w);
  const bot = spawnAt(w, CORE.x - 300, CORE.y + 250);
  const human = spawnAt(w, CORE.x + 150, CORE.y + 200, { kind: 'human' });
  human.life = { k: 'downed', bleedOutAt: Infinity, reviveProgress: 0 };
  assert.ok(play(w, [bot], 15_000, () => human.life.k === 'alive'), 'the human got up');
  assert.equal(w.run!.stats.get(bot.id)?.revives, 1);
});

test('a squad bot shoots the zombies coming at the core', () => {
  const w = nightWorld();
  const bot = spawnAt(w, CORE.x, CORE.y + 320);
  w.zombies.push({ id: newId(w), kind: 'walker', x: CORE.x, y: CORE.y + 900, hp: 200, attackAt: 0 });
  assert.ok(play(w, [bot], 10_000, () => w.zombies.length === 0), 'the zombie died');
  assert.equal(bot.kills, 1);
  assert.ok(Math.hypot(bot.x - CORE.x, bot.y - CORE.y) < 600, 'without leaving the core');
});

test('a squad bot mends a damaged wall near the core while no zombie is close', () => {
  const w = nightWorld();
  farZombie(w);
  const bot = spawnAt(w, CORE.x - 300, CORE.y);
  const wall = { id: newId(w), kind: 'wall' as const, cx: 30, cy: 25, hp: 50 };
  w.buildings.push(wall);
  w.buildingsVersion++;
  assert.ok(play(w, [bot], 15_000, () => wall.hp >= BUILDINGS.wall.hp * 0.9), `the wall is mended, at ${wall.hp.toFixed(0)}`);
  assert.ok(w.run!.scrap < ZOM.startScrap, 'for scrap');
  assert.equal(w.buildings.length, 1, 'and builds nothing new');
});
