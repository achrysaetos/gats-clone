/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BARREL, GUNS, WORLD } from '../src/shared/defs.ts';
import { setInput, step } from '../src/shared/sim.ts';
import { damageBarrel } from '../src/shared/sim/barrels.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import type { Barrel, World } from '../src/shared/sim/world.ts';
import { botThink, newBotMemory, type BotMemory } from '../src/server/bots.ts';
import { arenaFor } from '../src/server/bot/arena.ts';
import { barrelToShoot, seenBarrels, shotWouldBurnMe, BARREL_SAFE_PX } from '../src/server/bot/barrels.ts';
import { findPath, isOpen } from '../src/server/bot/nav.ts';
import { emptyWorld, setWalls, spawnAt, TICK_MS } from './helpers.ts';

const seeded = (seed: number) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };

function addBarrel(w: World, x: number, y: number): Barrel {
  const b: Barrel = { id: w.nextId++, x, y, hp: BARREL.hp, fuseAt: null, respawnAt: null, by: null };
  w.barrels.push(b);
  w.wallsVersion++;
  return b;
}

/** A square block of barrels a barrel's width apart, centred on (cx, cy): too tight for a body to pass between. */
function cluster(w: World, cx: number, cy: number, side: number) {
  for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) addBarrel(w, cx + (i - (side - 1) / 2) * 50, cy + (j - (side - 1) / 2) * 50);
}

const view = (xs: [number, number][]) => seenBarrels(xs.map(([x, y], i) => [i, x, y, 10]));

test('standing barrels close the bot nav grid, and a burst or a respawn opens and closes it again', () => {
  const w = emptyWorld();
  const b = addBarrel(w, 1500, 1500);
  const standing = arenaFor(w);
  assert.ok(!isOpen(standing.nav, { x: 1500, y: 1500 }), 'the barrel is solid');
  assert.ok(!isOpen(standing.nav, { x: 1500 + BARREL.size / 2 + WORLD.playerRadius - 4, y: 1500 }), 'with a body-width of clearance');
  assert.ok(isOpen(standing.nav, { x: 1500 + BARREL.size / 2 + WORLD.playerRadius + 30, y: 1500 }), 'and no more');
  assert.equal(arenaFor(w), standing, 'an unchanged barrel set hands back the same arena');

  const shooter = spawnAt(w, 1000, 1500);
  damageBarrel(w, b, 1000, { attacker: shooter, team: shooter.team });
  for (let t = 0; t < 1000 && b.respawnAt === null; t += TICK_MS) step(w, TICK_MS);
  assert.ok(b.respawnAt !== null, 'it burst');
  assert.ok(isOpen(arenaFor(w).nav, { x: 1500, y: 1500 }), 'the nav grid opens where it stood');
  w.now = b.respawnAt!;
  w.players.delete(shooter.id);
  step(w, TICK_MS);
  assert.equal(b.respawnAt, null, 'it stood again');
  assert.ok(!isOpen(arenaFor(w).nav, { x: 1500, y: 1500 }), 'and the grid closes again');
});

test('a goal that falls in the clearance of a barrel is not one a bot is sent to', () => {
  const w = emptyWorld();
  cluster(w, 1500, 1500, 3);
  const arena = arenaFor(w);
  assert.equal(findPath(arena.nav, { x: 1000, y: 1500 }, { x: 1500, y: 1500 }) === null, false, 'the nearest open cell still gets a route');
  assert.deepEqual(arena.barrels.length, 9);
});

function walkTo(w: World, goal: { x: number; y: number }, ms: number): { x: number; y: number; stall: number }[] {
  const bot = spawnAt(w, 1000, 1500, { loadout: { weapon: 'assault' } });
  const r = seeded(7);
  let mem: BotMemory = { ...newBotMemory(r), intent: { k: 'patrol', goal, since: 0, holdUntil: 1e9 } };
  const at: { x: number; y: number; stall: number }[] = [];
  let stall = 0, best = Infinity;
  for (let i = 0; i < ms / TICK_MS; i++) {
    const d = botThink(snapshotFor(w, bot.id), arenaFor(w), mem, r);
    mem = d.mem;
    setInput(w, bot.id, i + 1, d.input);
    step(w, TICK_MS);
    const left = Math.hypot(goal.x - bot.x, goal.y - bot.y);
    if (left < best - 1) { best = left; stall = 0; } else stall++;
    at.push({ x: bot.x, y: bot.y, stall });
    if (left < 40) break;
  }
  return at;
}

test('a bot whose way to its goal runs through a barrel cluster goes round it and never stalls', () => {
  const cup = (w: World) => {
    for (let y = 1300; y <= 1700; y += 50) addBarrel(w, 1500, y);
    for (let x = 1550; x <= 1750; x += 50) { addBarrel(w, x, 1300); addBarrel(w, x, 1700); }
  };
  for (const [name, setup] of [
    ['a block', (w: World) => cluster(w, 1500, 1500, 4)],
    ['a block wedged against a wall', (w: World) => { setWalls(w, [{ x: 1380, y: 900, w: 40, h: 630 }]); cluster(w, 1500, 1500, 4); }],
    ['a cup of barrels facing the bot\'s goal', cup],
  ] as const) {
    const w = emptyWorld();
    setup(w);
    const goal = { x: 2000, y: 1500 };
    const at = walkTo(w, goal, 25_000);
    const end = at[at.length - 1]!;
    assert.ok(Math.hypot(goal.x - end.x, goal.y - end.y) < 60, `${name}: arrives (ended at ${end.x.toFixed(0)},${end.y.toFixed(0)} after ${(at.length * TICK_MS / 1000).toFixed(1)}s)`);
    assert.ok(Math.max(...at.map((s) => s.stall)) * TICK_MS < 2000, `${name}: never goes two seconds without getting nearer`);
    assert.ok(at.length * TICK_MS < 12_000, `${name}: takes ${(at.length * TICK_MS / 1000).toFixed(1)}s for a 1000px walk`);
  }
});

test('a bot walks on once the cluster in its way has burst', () => {
  const w = emptyWorld();
  cluster(w, 1500, 1500, 3);
  const goal = { x: 2000, y: 1500 };
  const bot = spawnAt(w, 1000, 1500);
  const r = seeded(3);
  let mem: BotMemory = { ...newBotMemory(r), intent: { k: 'patrol', goal, since: 0, holdUntil: 1e9 } };
  for (let i = 0; i < 90; i++) {
    if (i === 30) for (const b of w.barrels) { b.respawnAt = w.now + 1e9; w.wallsVersion++; }
    const d = botThink(snapshotFor(w, bot.id), arenaFor(w), mem, r);
    mem = d.mem;
    setInput(w, bot.id, i + 1, d.input);
    step(w, TICK_MS);
  }
  assert.ok(Math.hypot(goal.x - bot.x, goal.y - bot.y) < 400, 'it headed straight for the goal through the gap the burst left');
});

test('a bot shoots a barrel with an enemy beside it, from outside the blast', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 900, 1000, { loadout: { weapon: 'assault' } });
  const enemy = spawnAt(w, 1400, 1000, { loadout: { color: 'blue' } });
  const b = addBarrel(w, 1420, 1070);
  assert.ok(GUNS[bot.gun].range > 500, 'the barrel is within reach');
  const r = seeded(11);
  let mem: BotMemory = { ...newBotMemory(r), persona: 'aggressive' };
  let blown = false;
  for (let i = 0; i < 200 && !blown; i++) {
    const d = botThink(snapshotFor(w, bot.id), arenaFor(w), mem, r);
    mem = d.mem;
    setInput(w, bot.id, i + 1, d.input);
    step(w, TICK_MS);
    blown = b.respawnAt !== null;
  }
  assert.ok(blown, 'the barrel went off');
  assert.ok(enemy.life.k === 'dead' || (enemy.life.k === 'alive' && enemy.life.hp < 100), 'and the enemy was in it');
  assert.ok(bot.life.k === 'alive' && bot.life.hp === 100, 'the bot was not');
});

test('a bot never sets off a barrel whose blast would reach it', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 1300, 1000, { loadout: { weapon: 'assault' } });
  spawnAt(w, 1500, 1000, { loadout: { color: 'blue' } });
  const b = addBarrel(w, 1400, 1000);
  const r = seeded(5);
  let mem: BotMemory = { ...newBotMemory(r), persona: 'marksman' };
  const first: number[] = [];
  for (let i = 0; i < 240; i++) {
    const d = botThink(snapshotFor(w, bot.id), arenaFor(w), mem, r);
    mem = d.mem;
    setInput(w, bot.id, i + 1, d.input);
    step(w, TICK_MS);
    const near = Math.hypot(bot.x - b.x, bot.y - b.y) < BARREL_SAFE_PX;
    if (b.respawnAt !== null || b.fuseAt !== null) first.push(near ? 1 : 0);
    if (b.respawnAt !== null || b.fuseAt !== null) break;
  }
  assert.ok(!first.includes(1), 'it was not standing in the blast when the barrel went');
  assert.equal(bot.life.k === 'alive' && bot.life.hp, 100);
});

test('barrelToShoot weighs who is in the blast and where the shooter stands', () => {
  const me = { x: 0, y: 0 };
  const barrels = view([[500, 0]]);
  const range = 800;
  assert.equal(barrelToShoot(me, barrels, [{ x: 530, y: 20 }], [], [], range)?.id, 0, 'an enemy beside it');
  assert.equal(barrelToShoot(me, barrels, [{ x: 530 + BARREL.radius, y: 20 }], [], [], range), null, 'an enemy out of its reach');
  assert.equal(barrelToShoot(me, barrels, [{ x: 530, y: 20 }], [{ x: 480, y: 100 }], [], range), null, 'a friend beside it too');
  assert.equal(barrelToShoot(me, barrels, [{ x: 530, y: 20 }], [], [{ x: 250, y: -100, w: 20, h: 200 }], range), null, 'a wall in the way');
  assert.equal(barrelToShoot(me, barrels, [{ x: 530, y: 20 }], [], [], 400), null, 'out of the gun\'s reach');
  assert.equal(barrelToShoot({ x: 500 - BARREL_SAFE_PX + 10, y: 0 }, barrels, [{ x: 530, y: 20 }], [], [], range), null, 'the shooter inside the blast');
  const chained = view([[500, 0], [500 - BARREL.radius + 20, 0]]);
  assert.equal(barrelToShoot({ x: 500 - BARREL_SAFE_PX - 50, y: 0 }, chained, [{ x: 530, y: 20 }], [], [], range), null, 'inside the blast of one it would set off');
  assert.equal(barrelToShoot(me, view([[300, 0], [500, 0]]), [{ x: 530, y: 20 }], [], [], range), null, 'a barrel in front hides the one behind, and that one is too far from the enemy');
});

test('a bot holds fire rather than shoot down a line that meets a barrel it stands beside', () => {
  const close = view([[100, 0]]), far = view([[700, 0]]);
  assert.ok(shotWouldBurnMe(close, { x: 0, y: 0 }, { x: 900, y: 0 }), 'a barrel just ahead');
  assert.ok(!shotWouldBurnMe(far, { x: 0, y: 0 }, { x: 900, y: 0 }), 'a barrel far enough ahead');
  assert.ok(!shotWouldBurnMe(close, { x: 0, y: 0 }, { x: 0, y: 900 }), 'a barrel off the line');
});
