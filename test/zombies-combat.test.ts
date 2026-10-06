import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS, GUNS, ZOM, ZOMBIES, type ZombieKind } from '../src/shared/defs.ts';
import { explode } from '../src/shared/sim/combat.ts';
import { zombieMaxHp } from '../src/shared/sim/run.ts';
import { createWorld, newId, type World } from '../src/shared/sim/world.ts';
import { equip, grantPerks, hpOf, press, run, shootOnce, spawnAt, TICK_MS } from './helpers.ts';

/** A quiet night, so only what a test places takes part. Tests line up on the open ground due south of the core, where a zombie walks straight at the shooter. */
function nightWorld(): World {
  const w = createWorld('ZOM', 1, 'outpost');
  w.run!.phase = { k: 'night', toSpawn: [], nextSpawnAt: Infinity, dawnAt: Infinity };
  w.run!.core.hp = 1e9;
  return w;
}

const X = 1475, Y = 1700, DOWN = Math.PI / 2;

function addZombie(w: World, kind: ZombieKind, x: number, y: number, hp = zombieMaxHp(kind, 1, 1)) {
  const z = { id: newId(w), kind, x, y, hp, attackAt: Infinity };
  w.zombies.push(z);
  return z;
}

test('shooting a zombie dead pays the shooter its score and kill, and the squad its scrap', () => {
  const w = nightWorld();
  const p = spawnAt(w, X, Y);
  const z = addZombie(w, 'walker', X, Y + 300);
  addZombie(w, 'walker', 100, 100);
  const shots = Math.ceil(z.hp / GUNS.pistol.damage);
  const scrap = w.run!.scrap;
  for (let i = 0; i < shots; i++) shootOnce(w, p, DOWN, 300);
  assert.ok(!w.zombies.includes(z), 'the zombie is gone');
  assert.deepEqual(
    { score: p.score, kills: p.kills, scrap: w.run!.scrap - scrap, stats: w.run!.stats.get(p.id)?.kills },
    { score: ZOMBIES.walker.score, kills: 1, scrap: ZOMBIES.walker.scrap, stats: 1 },
  );
});

test('a bullet stops in the first zombie it hits unless the gun pierces', () => {
  const w = nightWorld();
  const p = spawnAt(w, X, Y);
  const front = addZombie(w, 'brute', X, Y + 200, 1000);
  const back = addZombie(w, 'brute', X, Y + 300, 1000);
  shootOnce(w, p, DOWN);
  assert.deepEqual([1000 - front.hp, 1000 - back.hp], [GUNS.pistol.damage, 0]);
  equip(p, 'railSlug');
  shootOnce(w, p, DOWN);
  assert.equal(1000 - back.hp, GUNS.railSlug.damage, 'a piercing round reaches the second');
});

test('a piercing round that ends a tick inside a zombie hits it once', () => {
  const w = nightWorld();
  const p = spawnAt(w, X, Y);
  equip(p, 'railSlug');
  const z = addZombie(w, 'brute', X, Y + 120, 1000);
  shootOnce(w, p, DOWN);
  assert.equal(1000 - z.hp, GUNS.railSlug.damage);
});

test('the squad shoots over its own walls', () => {
  const w = nightWorld();
  const p = spawnAt(w, X, Y);
  w.buildings.push({ id: newId(w), kind: 'wall', cx: Math.floor(X / ZOM.cell), cy: Math.floor((Y + 100) / ZOM.cell), hp: BUILDINGS.wall.hp });
  w.buildingsVersion++;
  const z = addZombie(w, 'brute', X, Y + 250, 1000);
  shootOnce(w, p, DOWN);
  assert.equal(1000 - z.hp, GUNS.pistol.damage);
});

test('a blast hurts every zombie in its radius, less with distance, and credits its owner', () => {
  const w = nightWorld();
  const p = spawnAt(w, X, Y);
  const near = addZombie(w, 'brute', 1000, 2000, 1000);
  const far = addZombie(w, 'brute', 1100, 2000, 1000);
  const out = addZombie(w, 'brute', 1180, 2000, 1000);
  const kill = addZombie(w, 'walker', 990, 1990, 1);
  explode(w, 1000, 2000, 130, 90, { attacker: p, team: p.team, label: 'test' });
  assert.equal(1000 - near.hp, 90);
  assert.ok(1000 - far.hp > 0 && 1000 - far.hp < 90, `${1000 - far.hp} at range`);
  assert.equal(out.hp, 1000);
  assert.ok(!w.zombies.includes(kill));
  assert.equal(p.kills, 1);
});

test('knife, gas and land mines work on zombies too', () => {
  const knifeWorld = nightWorld();
  const knifer = spawnAt(knifeWorld, X, Y);
  grantPerks(knifeWorld, knifer, ['optics', 'shield', 'knife']);
  const cut = addZombie(knifeWorld, 'brute', X, Y + 100, 1000);
  press(knifeWorld, knifer, { ability: true, angle: DOWN });
  run(knifeWorld, TICK_MS);
  assert.ok(cut.hp < 1000, 'the knife cut');

  const gasWorld = nightWorld();
  const gasser = spawnAt(gasWorld, X, Y);
  const choking = addZombie(gasWorld, 'brute', X, Y + 400, 1000);
  gasWorld.thrown.push({ id: newId(gasWorld), kind: 'gasCloud', owner: gasser.id, team: gasser.team, x: X, y: Y + 400, expiresAt: Infinity });
  run(gasWorld, 1000);
  assert.ok(choking.hp < 1000, 'the gas choked');

  const mineWorld = nightWorld();
  const miner = spawnAt(mineWorld, X, Y);
  mineWorld.thrown.push({ id: newId(mineWorld), kind: 'landMine', owner: miner.id, team: miner.team, x: X, y: Y + 400, armedAt: 0, expiresAt: Infinity });
  const stepper = addZombie(mineWorld, 'brute', X, Y + 410, 1000);
  run(mineWorld, TICK_MS);
  assert.ok(stepper.hp < 1000, 'the mine went off under the zombie');
  assert.equal(mineWorld.thrown.length, 0);
});

test('a human shoots zombies for plain damage: the triple-health handicap is only against bots', () => {
  const w = nightWorld();
  const p = spawnAt(w, X, Y, { kind: 'human' });
  const z = addZombie(w, 'brute', X, Y + 300, 1000);
  shootOnce(w, p, DOWN);
  assert.equal(1000 - z.hp, GUNS.pistol.damage);
});

test('in a run only bites hurt the squad: a blast at a player\'s own feet leaves them whole', () => {
  const w = nightWorld();
  const p = spawnAt(w, X, Y);
  const before = hpOf(p);
  explode(w, X, Y, 130, 90, { attacker: p, team: p.team, label: 'test' });
  assert.equal(hpOf(p), before);
});

test('a shotgun blast into one zombie reads as one hit marker carrying all its pellets', () => {
  const w = nightWorld();
  const p = spawnAt(w, X, Y, { loadout: { weapon: 'shotgun' } });
  const z = addZombie(w, 'brute', X, Y + 60, 10_000);
  press(w, p, { angle: DOWN, fire: true, shots: p.input.shots + 1 });
  run(w, TICK_MS);
  const marks = w.events.filter((e) => e.e === 'dmg' && e.victim === z.id);
  assert.equal(marks.length, 1);
  assert.equal(marks[0]!.e === 'dmg' && marks[0]!.amount, 10_000 - z.hp);
  assert.ok(10_000 - z.hp > GUNS.shotgun.damage, 'more than one pellet landed');
});
