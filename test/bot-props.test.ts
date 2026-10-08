/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUNS, PROP_FX, PROPS, WORLD, type PropKind } from '../src/shared/defs.ts';
import { setInput, step } from '../src/shared/sim.ts';
import { damageProp } from '../src/shared/sim/props.ts';
import { snapshotFor } from '../src/shared/sim/snapshot.ts';
import type { Prop, World } from '../src/shared/sim/world.ts';
import { botThink, newBotMemory, type BotMemory } from '../src/server/bots.ts';
import { arenaFor } from '../src/server/bot/arena.ts';
import { hazardState, hazardsOf, propToShoot, seenProps, shotWouldHurtMe } from '../src/server/bot/props.ts';
import { isOpen } from '../src/server/bot/nav.ts';
import { emptyWorld, spawnAt, TICK_MS } from './helpers.ts';

const seeded = (seed: number) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };
const KIND_INDEX: Record<PropKind, number> = { propane: 0, gas: 1, generator: 2, oil: 3, lamp: 4, medic: 5, ammo: 6, paint: 7 };

function addProp(w: World, kind: PropKind, x: number, y: number): Prop {
  const q: Prop = { id: w.nextId++, kind, x, y, hp: PROPS[kind].hp, phase: 'stand', at: 0, respawnAt: null, vx: 0, vy: 0, by: null, home: { x, y } };
  w.props.push(q);
  w.wallsVersion++;
  return q;
}
const seen = (...xs: [PropKind, number, number][]) => seenProps(xs.map(([k, x, y], i) => [i, KIND_INDEX[k], x, y, 10]));

test('standing props close the bot nav grid, and shattering or a respawn opens and closes it again', () => {
  const w = emptyWorld();
  const q = addProp(w, 'generator', 1500, 1500);
  const standing = arenaFor(w);
  assert.ok(!isOpen(standing.nav, { x: 1500, y: 1500 }), 'the generator is solid');
  assert.ok(isOpen(standing.nav, { x: 1500 + PROPS.generator.size / 2 + WORLD.playerRadius + 30, y: 1500 }), 'with a body-width of clearance and no more');
  const me = spawnAt(w, 1000, 1500);
  damageProp(w, q, 1000, { attacker: me, team: me.team }, { x: 1, y: 0 });
  for (let t = 0; t < 1500; t += TICK_MS) step(w, TICK_MS);
  assert.ok(q.respawnAt !== null);
  assert.ok(isOpen(arenaFor(w).nav, { x: 1500, y: 1500 }), 'the grid opens where it stood');
  const cab = addProp(w, 'medic', 2500, 1500);
  assert.ok(!isOpen(arenaFor(w).nav, { x: 2500, y: 1500 }));
  damageProp(w, cab, 1000, { attacker: me, team: me.team }, { x: 1, y: 0 });
  assert.ok(isOpen(arenaFor(w).nav, { x: 2500, y: 1500 }), 'a pack on the floor is walked over');
});

function walkTo(w: World, goal: { x: number; y: number }, ms: number) {
  const bot = spawnAt(w, 1000, 1500, { loadout: { weapon: 'assault' } });
  const r = seeded(7);
  let mem: BotMemory = { ...newBotMemory(r), intent: { k: 'patrol', goal, since: 0, holdUntil: 1e9 } };
  let best = Infinity, stall = 0, worst = 0, t = 0;
  for (; t < ms; t += TICK_MS) {
    const d = botThink(snapshotFor(w, bot.id), arenaFor(w), mem, r);
    mem = d.mem;
    setInput(w, bot.id, Math.round(t / TICK_MS) + 1, d.input);
    step(w, TICK_MS);
    const left = Math.hypot(goal.x - bot.x, goal.y - bot.y);
    if (left < best - 1) { best = left; stall = 0; } else stall++;
    worst = Math.max(worst, stall);
    if (left < 40) break;
  }
  return { bot, left: Math.hypot(goal.x - bot.x, goal.y - bot.y), worst: worst * TICK_MS, ms: t };
}

test('a bot whose way runs through a wall of props goes round and never stalls', () => {
  const w = emptyWorld();
  for (const [kind, y] of [['generator', 1300], ['medic', 1350], ['ammo', 1400], ['oil', 1450], ['gas', 1500], ['propane', 1550], ['lamp', 1600], ['generator', 1650], ['medic', 1700]] as const) addProp(w, kind, 1500, y);
  const r = walkTo(w, { x: 2000, y: 1500 }, 25_000);
  assert.ok(r.left < 60, `it arrives (${r.left.toFixed(0)} px short after ${(r.ms / 1000).toFixed(1)} s)`);
  assert.ok(r.worst < 2000, 'and never goes two seconds without getting nearer');
});

test('a bot shoots a gas canister with an enemy beside it, from outside the cloud, and the enemy is poisoned', () => {
  const w = emptyWorld();
  const bot = spawnAt(w, 600, 1000, { loadout: { weapon: 'assault' } });
  const enemy = spawnAt(w, 1250, 1000, { loadout: { color: 'blue' } });
  const can = addProp(w, 'gas', 1260, 1060);
  assert.ok(GUNS[bot.gun].range > 700);
  const r = seeded(11);
  let mem: BotMemory = { ...newBotMemory(r), persona: 'aggressive' };
  let blown = false;
  for (let i = 0; i < 240 && !blown; i++) {
    const d = botThink(snapshotFor(w, bot.id), arenaFor(w), mem, r);
    mem = d.mem;
    setInput(w, bot.id, i + 1, d.input);
    step(w, TICK_MS);
    blown = can.respawnAt !== null;
  }
  assert.ok(blown, 'the canister went off');
  assert.ok(w.thrown.some((t) => t.kind === 'gasCloud'));
  for (let i = 0; i < 20; i++) step(w, TICK_MS);
  assert.ok(enemy.life.k === 'dead' || (enemy.life.k === 'alive' && enemy.life.hp < 100), 'the enemy stood in it');
  assert.ok(bot.life.k === 'alive' && bot.life.hp === 100, 'the bot did not');
});

test('propToShoot weighs who a hazard would reach and where the shooter stands', () => {
  const me = { x: 0, y: 0 }, range = 900;
  const gas = seen(['gas', 500, 0]);
  assert.equal(propToShoot(me, gas, [{ x: 530, y: 20 }], [], [], range)?.kind, 'gas', 'an enemy in the cloud');
  assert.equal(propToShoot(me, gas, [{ x: 500 + 400, y: 20 }], [], [], range), null, 'an enemy out of its reach');
  assert.equal(propToShoot(me, gas, [{ x: 530, y: 20 }], [{ x: 480, y: 80 }], [], range), null, 'a friend in it too');
  assert.equal(propToShoot(me, gas, [{ x: 530, y: 20 }], [], [{ x: 250, y: -100, w: 20, h: 200 }], range), null, 'a wall in the way');
  assert.equal(propToShoot({ x: 500 - 150, y: 0 }, gas, [{ x: 530, y: 20 }], [], [], range), null, 'the shooter inside the cloud');
  assert.equal(propToShoot(me, seen(['generator', 500, 0]), [{ x: 520, y: 150 }], [], [], range)?.kind, 'generator', 'an EMP slows an enemy in its reach');
  assert.equal(propToShoot(me, seen(['oil', 500, 0]), [{ x: 540, y: 20 }], [], [], range)?.kind, 'oil', 'fire');
  assert.equal(propToShoot(me, seen(['lamp', 500, 0]), [{ x: 520, y: 20 }], [], [], range), null, 'a lamp does nothing to anyone');
  assert.equal(propToShoot(me, seen(['medic', 500, 0]), [{ x: 520, y: 20 }], [], [], range), null, 'nor a cabinet that heals');
  // A tank flies down the line it was hit on, so an enemy behind it on that line is in its path.
  assert.equal(propToShoot(me, seen(['propane', 400, 0]), [{ x: 700, y: 10 }], [], [], range)?.kind, 'propane', 'an enemy in its flight path');
  assert.equal(propToShoot(me, seen(['propane', 400, 0]), [{ x: 700, y: 300 }], [], [], range), null, 'an enemy off to the side');
  assert.equal(propToShoot(me, seen(['propane', 400, 0]), [{ x: 300, y: 0 }], [], [], range), null, 'an enemy behind the tank');
});

test('a bot holds fire rather than shoot down a line that meets a hazard standing beside it', () => {
  const me = { x: 0, y: 0 };
  assert.ok(shotWouldHurtMe(seen(['gas', 120, 0]), me, { x: 900, y: 0 }), 'a canister just ahead');
  assert.ok(!shotWouldHurtMe(seen(['gas', 700, 0]), me, { x: 900, y: 0 }), 'one far enough ahead');
  assert.ok(!shotWouldHurtMe(seen(['gas', 120, 0]), me, { x: 0, y: 900 }), 'one off the line');
  assert.ok(shotWouldHurtMe(seen(['oil', 100, 0]), me, { x: 900, y: 0 }));
  assert.ok(shotWouldHurtMe(seen(['generator', 150, 0]), me, { x: 900, y: 0 }));
  assert.ok(!shotWouldHurtMe(seen(['lamp', 60, 0]), me, { x: 900, y: 0 }), 'a lamp is harmless');
});

test('bots keep out of fire and gas: out of one they stand in, held at the edge of one on their way', () => {
  const w = emptyWorld();
  const owner = spawnAt(w, 300, 300, { name: 'o', loadout: { color: 'blue' } });
  const bot = spawnAt(w, 1000, 1000, { loadout: { weapon: 'assault' } });
  const q = addProp(w, 'oil', 1000, 1000);
  damageProp(w, q, 1000, { attacker: owner, team: owner.team }, { x: 1, y: 0 });
  const hazards = hazardsOf(snapshotFor(w, bot.id).thrown, bot.id);
  assert.equal(hazards.length, 1);
  assert.equal(hazardState(hazards, { x: 1000, y: 1000 }, null).k, 'in');
  assert.equal(hazardState(hazards, { x: 1000 + PROP_FX.oil.radius + 100, y: 1000 }, { x: 1000 - 200, y: 1000 }).k, 'entering', 'a route through it');
  assert.equal(hazardState(hazards, { x: 1000 + PROP_FX.oil.radius + 100, y: 1000 }, { x: 1000 + 600, y: 1000 }).k, 'clear');
  assert.equal(hazardsOf(snapshotFor(w, owner.id).thrown, owner.id).length, 0, 'a bot does not fear its own fire, which cannot hurt it');

  const r = seeded(2);
  let mem: BotMemory = { ...newBotMemory(r), intent: { k: 'patrol', goal: { x: 1900, y: 1000 }, since: 0, holdUntil: 1e9 } };
  let burned = 0;
  for (let i = 0; i < 120; i++) {
    const hp0 = bot.life.k === 'alive' ? bot.life.hp : 0;
    const d = botThink(snapshotFor(w, bot.id), arenaFor(w), mem, r);
    mem = d.mem;
    setInput(w, bot.id, i + 1, d.input);
    step(w, TICK_MS);
    if (i > 45 && bot.life.k === 'alive' && bot.life.hp < hp0) burned++;
  }
  assert.ok(Math.hypot(bot.x - 1000, bot.y - 1000) > PROP_FX.oil.radius - 10, 'it walked out of the slick');
  assert.ok(burned < 4, `and stopped burning (${burned} more hurts after its first second and a half)`);
});
