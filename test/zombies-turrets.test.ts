import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS, ZOM, ZOMBIES, type TurretKind, type ZombieKind } from '../src/shared/defs.ts';
import { removePlayer, step } from '../src/shared/sim.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import { createWorld, newId, type Turret, type World } from '../src/shared/sim/world.ts';
import { press, run, spawnAt, TICK_MS } from './helpers.ts';

/** A turret on open ground well west of the core. */
const T = { cx: 20, cy: 30 }, TX = (T.cx + 0.5) * ZOM.cell, TY = (T.cy + 0.5) * ZOM.cell;
const SENTRY = BUILDINGS.sentry.turret;

/** A night with nothing left to spawn and no map cover, so only what a test places counts. */
function nightWorld(): World {
  const w = createWorld('ZOM', 1, 'outpost');
  w.run!.phase = { k: 'night', toSpawn: [], nextSpawnAt: Infinity };
  w.walls = [];
  w.crates = [];
  w.wallsVersion++;
  return w;
}

function addTurret(w: World, kind: TurretKind, owner: number, over: Partial<Turret> = {}): Turret {
  const t: Turret = { id: newId(w), kind, ...T, hp: BUILDINGS[kind].hp, owner, ammo: BUILDINGS[kind].turret.ammo, nextFireAt: 0, ...over };
  w.buildings.push(t);
  w.buildingsVersion++;
  return t;
}

function addZombie(w: World, kind: ZombieKind, x: number, y: number, hp = 1e9) {
  const z = { id: newId(w), kind, x, y, hp, attackAt: Infinity };
  w.zombies.push(z);
  return z;
}

const shotsIn = (w: World) => w.events.flatMap((e) => (e.e === 'turret' ? [e] : []));

test('a turret fires one round at its nearest zombie in range, spending one of its ammo', () => {
  const w = nightWorld();
  const t = addTurret(w, 'sentry', spawnAt(w, TX, TY + 300).id);
  addZombie(w, 'walker', TX - 300, TY);
  addZombie(w, 'walker', TX, TY - 200);
  step(w, TICK_MS);
  const shots = shotsIn(w);
  assert.equal(shots.length, 1);
  assert.deepEqual([shots[0]!.kind, shots[0]!.x, shots[0]!.y], ['sentry', TX, TY]);
  assert.ok(Math.abs(shots[0]!.angle + Math.PI / 2) < 0.1, `aimed north at the nearer zombie, angle ${shots[0]!.angle.toFixed(2)}`);
  assert.equal(t.ammo, SENTRY.ammo - 1);
  assert.deepEqual(w.bullets.map((b) => b.turret), ['sentry']);
});

test('a cannon picks a brute in range over a nearer walker, and a sentry a walker over a nearer brute', () => {
  for (const [kind, near, far, angle] of [['cannon', 'walker', 'brute', Math.PI], ['sentry', 'brute', 'walker', Math.PI]] as const) {
    const w = nightWorld();
    addTurret(w, kind, spawnAt(w, TX, TY + 300).id);
    addZombie(w, near, TX, TY - 150);
    addZombie(w, far, TX - 350, TY);
    step(w, TICK_MS);
    assert.ok(Math.abs(shotsIn(w)[0]!.angle - angle) < 0.1, `${kind} aimed at the ${far}, angle ${shotsIn(w)[0]!.angle.toFixed(2)}`);
  }
});

test('a round hurts each zombie kind by its own amount: a sentry barely scratches a brute', () => {
  for (const kind of ['walker', 'brute'] as const) {
    const w = nightWorld();
    addTurret(w, 'sentry', spawnAt(w, TX, TY + 300).id, { ammo: 1 });
    const z = addZombie(w, kind, TX, TY - 150);
    run(w, 500);
    assert.equal(1e9 - z.hp, SENTRY.damage[kind]);
  }
});

test('a zombie out of range or behind cover draws no fire, but the squad\'s own walls hide nothing', () => {
  const w = nightWorld();
  const owner = spawnAt(w, TX, TY + 300).id;
  const t = addTurret(w, 'sentry', owner);
  addZombie(w, 'walker', TX, TY - SENTRY.range - 30);
  step(w, TICK_MS);
  assert.deepEqual([shotsIn(w).length, t.ammo], [0, SENTRY.ammo], 'out of range');

  w.zombies = [];
  w.walls.push({ x: TX - 50, y: TY - 120, w: 100, h: 20, built: false, expiresAt: Infinity });
  w.wallsVersion++;
  addZombie(w, 'walker', TX, TY - 200);
  step(w, TICK_MS);
  assert.equal(shotsIn(w).length, 0, 'behind cover');

  w.walls = [];
  w.wallsVersion++;
  w.buildings.push({ id: newId(w), kind: 'wall', cx: T.cx, cy: T.cy - 2, hp: BUILDINGS.wall.hp });
  w.buildingsVersion++;
  const z = w.zombies[0]!;
  run(w, 500);
  assert.ok(t.ammo < SENTRY.ammo && z.hp < 1e9, 'fired over the squad wall and hit');
});

test('a turret stops firing once its ammo runs out', () => {
  const w = nightWorld();
  const t = addTurret(w, 'sentry', spawnAt(w, TX, TY + 300).id, { ammo: 3 });
  addZombie(w, 'walker', TX, TY - 200);
  let shots = 0;
  for (let ms = 0; ms < 3000; ms += TICK_MS) { step(w, TICK_MS); shots += shotsIn(w).length; }
  assert.deepEqual([shots, t.ammo], [3, 0]);
});

test('a turret\'s rounds pass a squad player by and leave them whole', () => {
  const w = nightWorld();
  const mate = spawnAt(w, TX, TY - 100);
  addTurret(w, 'cannon', spawnAt(w, TX, TY + 300).id);
  const z = addZombie(w, 'walker', TX, TY - 220);
  const hp = mate.life.k === 'alive' ? mate.life.hp : 0;
  run(w, 300);
  assert.equal(z.hp, 1e9 - BUILDINGS.cannon.turret.damage.walker, 'the round reached the zombie');
  assert.equal(mate.life.k === 'alive' && mate.life.hp, hp);
});

test('a turret\'s kill pays the squad its scrap and the builder its score, and counts as the turret\'s kill, not the builder\'s', () => {
  const w = nightWorld();
  const builder = spawnAt(w, TX, TY + 300);
  addTurret(w, 'cannon', builder.id);
  addZombie(w, 'brute', TX, TY - 200, 1);
  addZombie(w, 'walker', 60, 60);
  const scrap = w.run!.scrap;
  let zkill = null;
  for (let ms = 0; ms < 1000 && !zkill; ms += TICK_MS) { step(w, TICK_MS); zkill = w.events.find((e) => e.e === 'zkill') ?? null; }
  assert.deepEqual(zkill && { ...zkill, x: 0, y: 0, id: 0 }, { e: 'zkill', id: 0, kind: 'brute', x: 0, y: 0, by: null });
  assert.equal(w.run!.scrap - scrap, ZOMBIES.brute.scrap);
  assert.deepEqual([builder.score, builder.kills, w.run!.stats.get(builder.id)?.kills ?? 0], [ZOMBIES.brute.score, 0, 0]);
  assert.deepEqual(w.run!.turretKills, { sentry: { walker: 0, brute: 0 }, cannon: { walker: 0, brute: 1 } });

  removePlayer(w, builder.id);
  addZombie(w, 'walker', TX, TY - 200, 1);
  run(w, BUILDINGS.cannon.turret.fireMs + 500);
  assert.equal(w.run!.turretKills.cannon.walker, 1, 'a turret keeps firing after its builder leaves');
  assert.equal(w.run!.scrap - scrap, ZOMBIES.brute.scrap + ZOMBIES.walker.scrap);
});

test('zombies bite a turret down like a wall', () => {
  const w = nightWorld();
  const owner = spawnAt(w, 1500, 1700).id;
  const line = Array.from({ length: 60 }, (_, cy) => addTurret(w, 'sentry', owner, { cx: 10, cy, ammo: 0 }));
  const t = line[30]!;
  const z = addZombie(w, 'brute', 10 * ZOM.cell - ZOMBIES.brute.radius - 2, 30.5 * ZOM.cell);
  z.attackAt = 0;
  step(w, TICK_MS);
  assert.equal(BUILDINGS.sentry.hp - t.hp, ZOMBIES.brute.damage * ZOMBIES.brute.buildingDamageMul);
  t.hp = 1;
  z.attackAt = 0;
  const version = w.buildingsVersion;
  step(w, TICK_MS);
  assert.ok(!w.buildings.includes(t) && w.buildingsVersion > version, 'the bitten-through turret is gone');
});

test('holding use by a turret short of ammo reloads it for scrap up to a full load, mending a worn one first', () => {
  const w = nightWorld();
  const p = spawnAt(w, TX, TY + 100);
  const t = addTurret(w, 'sentry', p.id, { ammo: 0, hp: BUILDINGS.sentry.hp - 200 });
  w.run!.scrap = 1000;
  press(w, p, { use: true });
  run(w, 1000);
  assert.equal(t.ammo, 0, 'mended before reloaded');
  assert.ok(t.hp > BUILDINGS.sentry.hp - 200);

  t.hp = BUILDINGS.sentry.hp;
  t.ammo = 0.3;
  let scrap = w.run!.scrap;
  run(w, 1000);
  const loaded = t.ammo - 0.3;
  assert.ok(Math.abs(loaded - (SENTRY.ammo * 1000) / ZOM.refillMs) <= (SENTRY.ammo * TICK_MS) / ZOM.refillMs + 1e-6, `reloaded ${loaded.toFixed(1)}`);
  assert.ok(Math.abs(scrap - w.run!.scrap - loaded * SENTRY.scrapPerRound) < 1e-6, 'for scrap by the round');

  run(w, ZOM.refillMs);
  scrap = w.run!.scrap;
  run(w, 1000);
  assert.deepEqual([t.ammo, w.run!.scrap], [SENTRY.ammo, scrap], 'full, and no scrap spent past it');

  t.ammo = 0;
  w.run!.scrap = 0;
  run(w, 1000);
  assert.equal(t.ammo, 0, 'no scrap, no reload');
});

test('a turret\'s ammo shows in tenths, and its aim and rounds only in its shot events, so the sticky buildings field holds still while it fires', () => {
  const w = nightWorld();
  const p = spawnAt(w, TX, TY + 300);
  const t = addTurret(w, 'sentry', p.id);
  addZombie(w, 'walker', TX, TY - 200);
  step(w, TICK_MS);
  const first = snapshotFor(w, p.id);
  assert.deepEqual(first.buildings, [{ kind: 'sentry', cx: T.cx, cy: T.cy, hp: 10, ammo: 10 }]);
  assert.deepEqual([first.bullets.length, w.bullets.length], [0, 1], 'its round flies on the server but stays off the wire');
  run(w, 500);
  assert.ok(t.ammo < SENTRY.ammo - 1, 'it kept firing');
  assert.deepEqual(snapshotFor(w, p.id).buildings, first.buildings);
  t.ammo = 0.5;
  const view = snapshotFor(w, p.id).buildings![0]!;
  assert.equal(view.kind !== 'wall' && view.ammo, 0, 'empty once it cannot fire a whole round');
});
